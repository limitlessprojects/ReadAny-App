# ReadAny CLI Delivery and Acceptance Contract

这份文档是 ReadAny CLI / External AI Access 的交付合同。它把“需要什么功能、怎么做、怎么测、怎么验收、做到什么程度停下来”写成可执行标准。

如果你要把功能拆成更细的开发项、测试项和验收项，读 [10-feature-delivery-spec.md](10-feature-delivery-spec.md)。

## 1. 交付目标

ReadAny CLI 的目标不是做一个孤立命令行工具，而是做 ReadAny 的本地能力网关：

```text
外部 AI / 高级用户
  -> readany CLI / MCP
  -> ReadAny 受控能力
  -> 本地书库、笔记、RAG、EPUB draft、导出
```

核心边界：

- 开放受控工具，不开放裸数据库。
- 开放受控文件读写，不开放任意文件系统。
- 开放业务动作，不开放任意 shell。
- 默认 readonly，写入必须 draft-first。
- 工具只有真实实现、测试通过、文档同步后才能进 MCP `tools/list`。

## 2. 功能范围

### P0 - CLI 和外部 AI 基础设施

必须有：

- `packages/cli` 独立 package。
- `readany --version`。
- `readany doctor --json`。
- `readany install` / `readany uninstall`。
- `readany agent setup --user --client <client> --profile readonly --json` / `readany agent uninstall --user --json`。
- `readany tools list --json`。
- `readany skill install` / `readany skill update` / `readany skill uninstall` / `readany skill status --json`。
- `readany mcp serve --profile readonly`。
- MCP `initialize`、`tools/list`、`tools/call`。
- profile / scope 权限模型。
- 最小审计日志。
- 审计日志读取：`audit.list` / `readany audit list --json`。

做到这个程度，外部 AI 才能“发现 ReadAny”。

### P1 - 只读书库能力

必须有：

- 书籍列表：`books.list` / `readany books list`。
- 书籍搜索：`books.search` / `readany books search`。
- 书籍元数据：`books.get` / `readany book get`。
- 笔记搜索：`notes.search` / `readany notes search`。
- 高亮搜索：`highlights.search` / `readany highlights search`。
- 书签列表：`readany bookmarks list`。
- skills 列表：`readany skills list`。
- 已索引章节目录：`chapters.list` / `readany chapters list`。
- 已索引章节读取：`chapters.get` / `readany chapter get`。
- 当前书 / 当前章 / 选区上下文：`context.get` / `readany context get`。
- RAG chunks 检索：`rag.search` / `readany rag search --mode bm25|hybrid|vector`。
- EPUB 结构检查：`epub.inspect` / `readany epub inspect --profile editor`。
- EPUB draft 创建：`epub.draft.create` / `readany epub draft create --profile editor`。
- EPUB draft 章节读取：`epub.chapter.read` / `readany epub chapter read --profile editor`。
- EPUB draft 章节替换：`epub.chapter.patch` / `readany epub chapter patch --profile editor`。
- EPUB draft 批量章节替换：`epub.chapters.patch` / `readany epub chapters patch --profile editor`。
- EPUB draft 元数据修改：`epub.metadata.patch` / `readany epub metadata patch --profile editor`。
- EPUB draft 操作历史：`epub.history` / `readany epub history --profile editor`。
- EPUB draft 差异查看：`epub.diff` / `readany epub diff --profile editor`。
- EPUB draft 结构校验：`epub.validate` / `readany epub validate --profile publisher`。
- EPUB draft 导出：`epub.export` / `readany epub export --profile publisher --output <path>`。
- notes 导出：`notes.export` / `readany notes export --profile publisher --output <path> --format markdown`。

当前约束：

- `chapters.*` 优先返回 indexed chunks；未索引 EPUB 会 fallback 到真实 EPUB spine/manifest；未索引 PDF 会 fallback 到 page text。
- `context.get` 只读取桌面端写入的 reader context snapshot，返回当前书、当前章、位置、选区、可见正文和最近高亮，不修改阅读状态、不读取裸 UI 内存。
- `rag.search` 当前支持 BM25、hybrid 和 vector。BM25 总是可用；hybrid 在 embedding 未配置或失败时回退 BM25；vector 需要桌面端远程向量模型配置或 `READANY_EMBEDDING_MODEL` 环境配置。
- `epub.inspect` 当前是只读结构检查，不代表已经支持 toc rebuild。
- `epub.draft.create` 当前只创建受控 draft workspace。
- `epub.chapter.read` 当前只读取 draft 章节文本。
- `epub.chapter.patch` 当前只替换 draft 内单个 XHTML 章节资源，不修改原书、不修改 metadata 或 toc、不导出文件。
- `epub.chapters.patch` 当前只接受 1-50 个结构化章节替换计划，并逐章写入普通 `epub.chapter.patch` history，不修改原书、不修改 metadata 或 toc、不导出文件。
- `epub.metadata.patch` 当前只修改 draft OPF metadata，不修改原书、不重建 toc、不导出文件。
- `epub.history` 当前只读取 draft operation history，不撤销、不修改文件。
- `epub.diff` 当前只比较 source/draft EPUB entry 的 hash 和 size，不返回完整正文，不负责执行 undo。
- `epub.validate` 当前只校验 active draft 的结构和资源引用，不自动修改、不导出。
- `epub.export` 当前只在 validate 通过后导出新 EPUB，默认不覆盖已有文件、不覆盖源 EPUB。
- `notes.export` 当前只导出单本书的 notes/highlights 文件，默认不覆盖已有文件。
- 大正文读取必须有 `limit`、`cursor`、`chunk-start`、`chunk-count` 或等价范围控制。

做到这个程度，外部 AI 可以读已索引内容并回答有引用的问题。

### P2 - 内容理解增强

必须有：

- 未索引 EPUB 的 fallback 章节目录。
- 未索引 EPUB 的 fallback 章节正文。
- PDF 可用的章节或页级读取策略。
- 当前书、当前章、选区上下文资源。
- vector / hybrid RAG。
- 引用定位可回跳到 book / chapter / chunk / page / cfi。

做到这个程度，外部 AI 可以处理“还没进入 chunks 索引”的书，也可以拿到当前阅读快照并做更稳定的跨书检索。

### P3 - AI 编辑和 EPUB 精排

必须有：

- `epub.inspect`：检查 EPUB 结构、metadata、toc、资源清单。
- `epub.draft.create`：从原书创建 draft。
- `epub.chapter.read`：读取 draft 或原书章节。
- `epub.chapter.patch`：修改 draft 章节。
- `epub.chapters.patch`：按受限章节计划批量修改 draft 章节。
- `epub.metadata.patch`：修改 draft 元数据。
- `epub.history`：查看操作历史。
- `epub.toc.rebuild`：重建 draft 目录。
- `epub.diff`：查看 draft 与原书差异。
- `epub.draft.discard`：丢弃 draft 作为当前回滚路径。
- `epub.undo`：撤销已记录且资源未被后续改动覆盖的 draft patch。
- AI 建议能力：封面建议、元数据建议、目录建议、章节结构建议、全书修复建议。
- 用户编辑入口：用户可以从书籍详情进入 draft 工作区，查看 AI 修改、手动改、撤销、继续交给 AI。

关键规则：

- AI 可以修本章，也可以修全书。
- 用户自己编辑和 AI 自动编辑必须落在同一套 draft/history/diff 体系里。
- 原始 EPUB hash 必须保持不变。
- readonly profile 不能调用任何 patch / draft / export 工具。

做到这个程度，AI 和用户都能在受控 draft 上做精排编辑，但还不代表可以发布。

### P4 - 校验和导出

必须有：

- `epub.validate`：校验 draft 结构、manifest、spine、toc、metadata、资源引用。
- `epub.export`：导出为新 EPUB。
- `notes.export`：导出单本书 notes/highlights 文件。
- knowledge export。
- 导出审计。
- publisher profile 或等价授权。
- 默认不覆盖原文件。
- 导出前必须 validate。

做到这个程度，用户可以把 AI / 用户共同编辑后的 draft 导出为可复用新文件。

### P5 - 桌面端完整体验

必须有：

- `设置 -> 外部 AI 访问`。
- CLI 安装 / 卸载 / 修复。
- Skill 安装 / 卸载 / 更新。
- readonly MCP 配置复制。
- profile 状态展示。
- doctor 诊断展示。
- 审计日志查看。
- 高风险 profile 的说明和确认。

做到这个程度，普通用户不用读命令行文档也能完成外部 AI 接入。

## 3. 每个功能怎么做

每个新能力按同一条流水线交付：

```text
需求定义
  -> core / domain service
  -> CLI 命令
  -> tool registry
  -> MCP tools/list 和 tools/call
  -> Skill 使用说明
  -> 桌面端入口或状态展示
  -> 测试和验收记录
```

### 需求定义

写清楚：

- 用户或外部 AI 要完成什么任务。
- 输入是什么。
- 输出是什么。
- 权限 profile 是什么。
- 风险是什么。
- 大结果如何分页或限流。
- 错误码是什么。

### core / domain service

业务能力优先放在 `@readany/core` 或清晰领域服务里。CLI 不应该自己解析复杂 EPUB、不应该自己拼业务状态，也不应该绕过 ReadAny 的数据边界。

### CLI 命令

CLI 负责：

- 参数解析。
- JSON / text 输出。
- 统一 `CommandResult`。
- 调用 core / service。
- 写审计日志。

### Tool registry

每个 MCP tool 必须声明：

- `name`
- `description`
- `inputSchema`
- `scopes`
- `risk`
- `minimumProfile`
- 是否 readonly
- 输出大小控制策略
- 运行时校验规则

MCP `tools/list` 必须把 risk / scopes / minimumProfile 放进外部 agent 可见的机器可读元数据，并在 description 中保留人类可读摘要。

未完成的能力只允许出现在设计文档，不允许出现在 registry。

### MCP

MCP 负责：

- `initialize`
- `tools/list`
- `tools/call`
- profile 权限检查
- 参数 schema 校验
- 拒绝未声明参数
- 标准错误响应

MCP 不做隐藏能力，不绕过 CLI / service。

### Skill

Skill 负责告诉外部 AI：

- ReadAny 有什么工具。
- 什么时候用 MCP。
- 什么时候用 CLI。
- 默认 readonly。
- 写入必须 draft-first。
- 不要请求任意 shell、任意 SQL、任意本地路径。

Skill 安装位置固定为通用 agent home：

```text
$AGENT_HOME/skills/readany/SKILL.md
~/.agent/skills/readany/SKILL.md
```

`agent setup --client codex|claude|cursor|opencode` 可以从这个 canonical skill 创建客户端目录链接；`agent setup --client all` 会一次性创建全部已知链接和 `~/.agents/skills/readany` 兼容链接。

### 桌面端

桌面端只做管理入口：

- 调 `readany doctor --json`。
- 调 CLI install / uninstall。
- 复制并可执行 `readany agent setup ... --json` 给外部 AI。
- 调 skill install / uninstall。
- 复制 MCP 配置。
- 展示审计和 profile 状态。

桌面端不复制 CLI 里的业务逻辑。

## 4. 测试策略

### 单元测试

必须覆盖：

- 命令解析。
- path 解析。
- profile / scope 权限。
- tool registry schema。
- JSON 输出结构。
- 错误码。
- skill 安装 / 卸载。
- audit log 写入。

### 集成测试

必须覆盖：

- 临时 `READANY_HOME` 中 seed 数据。
- CLI 从临时库读取数据。
- MCP `tools/list` 只列真实工具。
- MCP `tools/call` 成功路径。
- readonly profile 拒绝写入工具。
- 审计日志写到临时目录。

### E2E 测试

必须覆盖：

- build 后的 `dist/bin/readany.js`。
- `install` / `uninstall`。
- `agent setup` / `agent uninstall`，并检查临时 bin shim、临时 skill 文件和 MCP snippet。
- `doctor`。
- `skill install` / `skill update` / `skill status` / `skill uninstall`。
- MCP stdio smoke。
- draft / patch / validate / export 的完整链路。

### 手工验收

每个 milestone 至少手工验证：

- macOS。
- Windows。
- Linux。
- 一个外部 agent，优先 Codex、Claude Desktop 或 Cursor。
- 桌面客户端设置页。

可自动复现的外部 agent smoke：

```bash
pnpm --filter @readany/cli build
pnpm --filter @readany/cli smoke:agent
```

该 smoke 使用 built CLI 的 stdio MCP 跑 readonly 发现/搜索、PDF fallback 章节读取、readonly 写入拒绝、editor draft 批量章节修改和 toc rebuild、publisher validate/export、audit 摘要、原 EPUB hash 不变，以及导出 EPUB 重新入库后的 inspect / chapter read 检查。它是 M5 外部 agent 验收的自动化前置证据；真实 Codex / Claude Desktop / Cursor 手工验收仍需另外记录。

### 安全测试

必须验证：

- readonly 不能写 draft。
- readonly 不能 export。
- MCP 不暴露任意 SQL。
- MCP 不暴露任意 shell。
- MCP 不返回同步凭证、密钥、敏感本地路径。
- Skill 卸载不会删除非 ReadAny 管理内容。
- export 默认不覆盖原文件。
- patch 不修改原始 EPUB。

## 5. 提交前必须跑什么

CLI 相关改动每次提交前必须跑：

```bash
pnpm --filter @readany/cli check
pnpm --filter @readany/cli test
pnpm --filter @readany/cli build
pnpm --filter @readany/cli smoke:agent
git diff --check
```

CLI release preflight 可以用一个入口跑完整前置检查：

```bash
pnpm cli:preflight
```

该入口顺序执行 CLI check/test/build、built CLI external agent smoke、Tauri CLI bridge tests 和 `cargo check`。它适合本地发布前检查，也适合后续接入 release CI；只想验证 JS/CLI 层时可以运行 `pnpm --filter @readany/cli preflight:release -- --skip-rust`。

触碰桌面设置页、draft 工作区或 app 前端时，使用 full preflight：

```bash
pnpm cli:preflight:full
```

它会在 release preflight 基础上额外执行 `pnpm --filter app build`，用于提前发现 Tauri bridge 类型变化和设置页 UI 编译问题。

触碰桌面客户端或 Tauri bridge 时还要跑：

```bash
cargo test readany_cli --lib
cargo check
pnpm --filter app build
```

触碰打包资源、安装器或设置页时还要确认：

```bash
pnpm --filter @readany/cli build
pnpm --filter app tauri info
```

Release workflow 后续应在 macOS / Windows / Linux Tauri matrix 的 `tauri-action` 打包前执行 `pnpm cli:preflight:full`，用于防止发布包绕过 CLI/MCP、Tauri bridge preflight 和桌面前端构建。当前 OAuth token 没有 GitHub `workflow` scope，推送 `.github/workflows/release.yml` 改动会被远端拒绝；该 CI preflight 仍需由具备 workflow 权限的提交者补上，且不能替代安装后的真实客户端手工验收。

所有测试必须显式使用临时：

```text
READANY_HOME
AGENT_HOME
```

不能依赖开发者真实书库。

## 6. 验收方式

### 单工具验收

每个 CLI command / MCP tool 必须满足：

```text
[ ] 有真实实现，不是 mock
[ ] 有 CLI 命令或 MCP tool schema
[ ] 有 profile / scope
[ ] 有 JSON 输出
[ ] 有稳定错误码
[ ] 有输出大小控制
[ ] MCP 调用拒绝未声明参数
[ ] MCP 调用校验 schema 边界
[ ] 有成功测试
[ ] 有失败测试
[ ] 有权限测试
[ ] 有文档
[ ] README / help / tools/list 状态一致
```

写入类能力还必须满足：

```text
[ ] readonly profile 调用失败
[ ] 写入目标是 draft 或受控对象
[ ] 原始文件 hash 不变
[ ] 有 diff 或 history
[ ] 有 rollback、undo 或 discard 路径
[ ] 审计日志记录动作
[ ] audit list 不返回完整正文、工具参数、密钥或同步凭证
[ ] 高风险动作需要更高 profile 或确认
```

### Milestone 验收

M1 通过条件：

- CLI check / test / build 全过。
- `readany doctor --json` 可解析。
- `readany skill status --json` 可解析。
- `readany tools list --json` 只列真实工具。
- readonly MCP 可 `initialize`、`tools/list`、`tools/call`。
- 构建后 CLI 的 `mcp serve` stdio smoke 通过。
- 可列书、搜书、读书籍元数据、搜笔记、搜高亮。
- 已索引 chunks 可通过 `chapters.*` 和 `rag.search` 读取。
- 审计日志不记录完整正文和敏感参数。
- `audit.list` 可读取最近 CLI/MCP 审计元数据。

M2 通过条件：

- 已索引书籍和未索引 EPUB/PDF 都有可用内容读取路径。
- 大正文支持范围读取。
- RAG 结果包含可回跳引用。
- vector / hybrid 模式有配置、回退和测试。
- MCP 没有提前暴露未完成工具。

M3 通过条件：

- AI 可以创建 draft。
- AI 可以修改本章。
- AI 可以修改全书。
- 用户可以查看 diff、手动编辑、撤销或丢弃。
- `epub.undo` 和 `epub.draft.discard` 都有验收证据。
- 原始 EPUB hash 不变。
- patch 失败不会留下破坏性状态。

M4 通过条件：

- draft validate 可发现结构错误。
- export 默认输出新文件。
- 导出 EPUB 可重新导入 ReadAny。
- publisher profile 或等价授权生效。
- 导出有审计记录。

M5 通过条件：

- 用户从桌面设置页完成 CLI / Skill / MCP 配置。
- 至少两个外部 agent 验证通过，其中一个使用 MCP。
- macOS / Windows / Linux 基本安装和 doctor 行为通过。
- 完整链路跑通：

```text
找书 -> 读内容 -> 查笔记/高亮 -> RAG 检索 -> 创建 draft -> AI 修改 -> 用户编辑 -> 校验 -> 导出 -> 审计
```

最终归档必须能留下机器可校验产物：

- 至少执行 `acceptance:validate --strict-m5`。
- 需要分步留痕时执行 `acceptance:finalize` 后再执行 `acceptance:bundle`。
- 需要一条命令收口时执行 `acceptance:assemble`，它会先卡 strict M5，再写出 `final-manifest.json` 和最终 bundle。

## 7. 停止线

### 当前可以停止并对外说明的程度

可以说：

- ReadAny 有独立 CLI package。
- ReadAny 有 readonly MCP 入口。
- 外部 AI 可以读取书籍、笔记、高亮、书签、技能列表、已索引章节和 RAG chunks 检索结果。
- 外部 AI 在 editor profile 下可以检查 EPUB 结构。
- 外部 AI 在 editor profile 下可以创建受控 EPUB draft workspace。
- 外部 AI 在 editor profile 下可以读取 draft EPUB 章节文本。
- 外部 AI 在 editor profile 下可以替换 draft 内单个 XHTML 章节资源。
- 外部 AI 在 editor profile 下可以修改 draft OPF metadata。
- 外部 AI 在 editor profile 下可以重建 draft EPUB3 nav 目录。
- 外部 AI 在 editor profile 下可以读取 draft operation history。
- 外部 AI 在 editor profile 下可以查看 source/draft EPUB entry diff。
- 桌面端有外部 AI 访问设置入口。

必须同时说明：

- `chapters.*` 当前是 indexed chunks 优先，未索引 EPUB/PDF fallback。
- `rag.search` 支持 BM25、hybrid 和 vector；hybrid 可回退，vector 需要 embedding 配置。
- `epub.inspect` 当前只读，不修改文件。
- `epub.draft.create` 当前只复制源文件和写入 manifest/history，不修改章节。
- `epub.chapter.read` 当前只读取 draft 章节文本，不修改章节。
- `epub.chapter.patch` 当前只替换 draft 内单个 XHTML 章节资源，不修改原书。
- `epub.chapters.patch` 当前只接受 1-50 个结构化章节替换计划，并逐章写入普通 `epub.chapter.patch` history，不修改原书。
- `epub.metadata.patch` 当前只修改 draft OPF metadata，不修改原书。
- `epub.toc.rebuild` 当前只重建 EPUB3 nav 目录，不修改原书、不重建 NCX。
- `epub.history` 当前只读取 draft operation history，不返回 undo snapshot 正文。
- `epub.diff` 当前只比较 source/draft EPUB entry 的 hash 和 size，不返回完整正文。
- `epub.export` 已经接入，但仍然要经过 publisher profile 和 validate，不会覆盖源 EPUB。
- `notes.export` 已经接入，但只导出单本书 notes/highlights，不导出全知识库。

### 不能停止在这些状态

以下状态不能算完成：

- 文档写了工具，但 registry 没有真实实现。
- MCP `tools/list` 暴露规划中工具。
- readonly 可以写入或导出。
- 测试依赖真实用户书库。
- patch 直接修改原始 EPUB。
- export 默认覆盖原文件。
- 设置页让用户误以为安装 Skill 就等于授权写入。

## 8. issue 拆分建议

建议按下面拆，不要把全能力塞进一个 issue：

1. M1 readonly CLI + MCP + Skill。
2. 桌面端外部 AI 访问设置页。
3. 内容读取 fallback + vector / hybrid RAG。
4. EPUB draft editing。
5. EPUB validate / export。
6. 审计日志 UI + profile 管理。
7. native binary / runtime bundle 安装体验。

建议 issue 模板里要额外写清楚：

- 用户编辑入口放在哪里。
- AI 编辑入口放在哪里。
- 是否共用 draft / history / diff。
- 是否会影响原始 EPUB。
- 是否要求 validate 后才能 export。

每个 issue 都必须包含：

- 背景。
- 范围。
- 不做什么。
- 安全边界。
- 测试命令。
- 验收证据。
- 完成停止线。
