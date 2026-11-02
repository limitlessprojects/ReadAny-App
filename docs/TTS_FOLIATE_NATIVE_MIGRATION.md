# TTS 迁移到 foliate-js 自带 TTS class

分支：`refactor/tts-use-foliate-native`

## 目标

把"句子分段 + 高亮跟随"的源头从 React 侧的 `chunkIndex → segment.cfi` 链路，
迁到 foliate-js 自带的 `TTS` class（`packages/foliate-js/tts.js`）。

最终架构：

```
foliate.view.tts             (WebView 内，driver)
   ↓ start() / next() → SSML(带 <mark>)
   ↓                           ↑ setMark(name) → highlight(range) 内部触发
   ↓                           ↑
TTSPlayer.speak(ssml)      onMark(name) ← 引擎事件
```

引擎层只关心 "吃 SSML、吐 mark"，不再关心 chunkIndex / cfi / segment。

## 现状速记

- `view.tts` 在 web 端 **已经初始化**（FoliateViewer.tsx:379），但只用于查询（getVisibleTTSSegments / highlightCfi），未驱动播放。
- 3 个引擎的对外回调统一是 `onChunkChange(index, total)`，**不支持 mark**。
- Edge TTS 服务器已开 `wordBoundaryEnabled: true`，但当前代码丢弃所有 metadata 帧（edge-tts.ts:347–358 只累加音频）。
- Browser TTS 不支持 SSML，需 fallback 策略。
- mobile 多一层 WebView↔RN 桥，需要双向消息协议。

## 迁移阶段（建议顺序）

### Phase 0 — 准备（不破坏现有功能）

- [ ] 抽出 `ITTSPlayer` 的新接口 `ITTSPlayerWithMarks`，保留 `onChunkChange`，新增 `onMark?: (name: string) => void` 与 `speakSSML?(ssml: string)`。
- [ ] 在 `core/src/tts/types.ts` 加 `TTSMarkSegment` 类型。
- [ ] 加 feature flag：`useFoliateNativeTTS`（store 里），默认 false。

### Phase 1 — Edge TTS 解析 mark 事件（最有性价比）

- [ ] 在 `edge-tts.ts` 把当前丢弃的 metadata 文本帧解析出来，提取 `WordBoundary` / `Bookmark` 事件（含 `Offset` 100ns 单位、`Text`、`Name`）。
- [ ] 改 `genSSML` 接受外部 SSML（mark 已含），不再强制包 plain text。
- [ ] `EdgeTTSPlayer.speakSSML(ssml)`：保留预取/AudioContext 拼接，逐段播放时按 offset 触发 `onMark`。
- [ ] 引擎 e2e 测试：手写一段带 `<bookmark mark="0">…<bookmark mark="1">` 的 SSML，验证 mark 事件按时序到达。

### Phase 2 — WebView ↔ React 协议（mobile）

- [ ] `use-reader-bridge.ts` 增加：
  - 下行：`doStartTTSSSML(ssml, requestId)` / `doSetMark(name)`
  - 上行：`ttsMark(requestId, name)` / `ttsChunkEnd(requestId)`
- [ ] 注入到 WebView 的 `window.doStartTTSSSML`：调 `view.tts.start()` / `view.tts.next()`，把返回的 SSML postMessage 给 RN。
- [ ] mark 事件从 RN → WebView：`window.foliateSetMark(name)` → `view.tts.setMark(name)`。

### Phase 3 — 接入 useReaderTTS（最大改动）

useReaderTTS.ts 现在 2699 行，需要拆：

- [ ] 抽 `useTTSEngine`：只管 player 生命周期、speak/pause/replay。
- [ ] 抽 `useTTSFoliateBridge`：拿 SSML、转发 mark、续播。
- [ ] 抽 `useTTSContinuous`：跨 section/页 的衔接（foliate.tts 绑单 doc，section 切换需 re-init）。
- [ ] 抽 `useTTSSleepTimer`、`useTTSSelection`、`useTTSDebug`。
- [ ] **删掉** `chunkOffset` / `localTTSChunkIndex` / `setTTSHighlight(cfi, ...)` 直接调用、`didForceReapplyTTSHighlightRef` 这套补丁。
  - 这些都是 chunkIndex→cfi 映射的伪同步，迁到 mark 事件后自然消失。

### Phase 4 — Browser TTS fallback

- [ ] SSML → 按 mark 切 utterance 数组，每 utterance `onend` 触发对应 mark。
- [ ] DashScope：先按相同策略走（每 chunk 结束 = 一个 mark），后续如 API 支持 SSML 再升级。

### Phase 5 — Web 端对齐

- [ ] `app/src/components/reader/FoliateViewer.tsx` 走同协议（无桥，直接同 frame 内调）。
- [ ] 把 web/mobile 共享的 store/hook 抽到 `core` 或新建 `packages/tts-react`。

### Phase 6 — 清理

- [ ] 删 `splitNarrationText`、`tts-debug-utils.ts` 里 chunk 相关、`ReaderView.tsx` 8 处 `setTTSHighlight(null)`。
- [ ] 删 feature flag。
- [ ] 删 foliate 之外的句子切分实现。

## 不做（保留）

- 三个 player 引擎的连接/缓冲/AudioContext 实现都保留，只换"事件颗粒度"。
- foliate 的 `granularity` 选 **"sentence"**（与现状一致），不切到 word，避免 UX 跳变。

## 风险点

1. **Edge TTS 的标记语法**：标准 SSML 是 `<mark name="...">`，Microsoft Azure 是 `<bookmark mark="..."/>`。Edge TTS 走的是 readaloud 端点，需在 Phase 1 实测。
2. **section 切换**：foliate 的 `view.tts` 绑当前 doc，翻到下一 section 时 `tts` 实例需重建；播放队列要在重建前 drain。
3. **DashScope 不支持 SSML**：可能需要保留 chunk-style 接口作为兼容路径。
4. **预取与 mark 时序**：Edge 引擎现在是"先取 N 段音频再连续播"，每段 mark 时间戳是相对该段的，需在播放层做累加偏移。

## 第一步执行（Phase 0 + Phase 1 调研）

1. 写 `EdgeTTSMetadata` 解析 spike，确认 mark 事件能稳定到手。
2. 写 `<bookmark>` vs `<mark>` 试探，确认 Edge 端语法。
3. 没问题再开 Phase 0 的接口扩展。

---

## Phase 1 spike 结论（已验证）

`scripts/edge-tts-bookmark-spike.mjs` 测了 4 个 SSML 变体，结果：

| Variant | Audio | Events | Close |
|---|---|---|---|
| baseline（纯文本） | ✅ 62KB | 23 WordBoundary + 3 SentenceBoundary | 正常 |
| `<mark name="..."/>` | ❌ 0 | 0 | 1007 SSML invalid |
| `<bookmark mark="..."/>` | ❌ 0 | 0 | 1007 SSML invalid |
| `<mstts:bookmark mark="..."/>` | ❌ 0 | 0 | 1007 SSML invalid |

**Edge consumer readaloud 端点（`speech.platform.bing.com/.../readaloud/edge/v1`）不接受任何 mark 元素**。
但它**默认发 SentenceBoundary 事件**——这正是我们需要的句子级颗粒度。

### 方案修订

原计划 Phase 1 想用 `<bookmark>` SSML 做引擎层的 cursor 同步——**作废**。
新方案：放弃 SSML 内嵌 mark，改用现有"逐句拆分送 WS"+foliate.tts 内部 `setMark` 的组合：

```
React 侧 useReaderTTS                    WebView 侧 foliate.view.tts
─────────────────────────────────        ──────────────────────────────
foliate.tts.collectDetails(N)
  ↓ → [{text, cfi}, …]
EdgeTTSPlayer.speak([texts])
  播放第 i 段开始
  ↓ onChunkChange(i)
                                  ───→  foliate.view.tts.highlightCfi(cfi[i])
                                          ↓ 内部 highlight(range) 自动渲染
```

关键变化：**砍掉 React 侧的 chunkIndex→cfi→setTTSHighlight 链路**，
让 foliate 的 `highlightCfi` 直接消费 cfi。这就是 Phase 5（"web 端对齐"）的实质，
但因为 Phase 1 不需要任何引擎改造，可以**直接跳到 Phase 3 的 hook 拆分 + 这个 highlight 路径替换**。

### 新执行顺序（替代原 Phase 1 / 2 / 4）

- [ ] **Phase A**：替换高亮渲染路径——Web 端先做
  - [ ] 在 FoliateViewer.tsx 用 foliate `view.tts.highlightCfi(cfi)` 取代当前 `setTTSHighlight(cfi)` 的 overlayer 自管理
  - [ ] 实测高亮效果与现状一致
- [ ] **Phase B**：删除 chunkIndex→cfi 的 React 中介逻辑
  - [ ] useReaderTTS 里 `setTTSHighlight` 调用点全部改走 `view.tts.highlightCfi`
  - [ ] `didForceReapplyTTSHighlightRef` 等补丁可以一并删
- [ ] **Phase C**：mobile 端跟进
  - [ ] use-reader-bridge 的 `setTTSHighlight` 内部 JS 改成调 `view.tts.highlightCfi(cfi)`，对外接口不变
- [ ] **Phase D**：拆 useReaderTTS（仍是 2699 行的 God hook，但现在能拆得更干净）

引擎改造（原 Phase 1）和 SSML 重构（原 Phase 2）**都不需要做**了。
保留 `edge-tts-metadata.ts` 解析器以备将来要消费 WordBoundary/SentenceBoundary 时直接用。

