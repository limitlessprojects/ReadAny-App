# ReadAny CLI Implementation Issue

这份文档可以直接作为 `feat/readany-cli` 后续工程 issue 的正文使用。它把我们要做什么、怎么做、怎么测试、怎么验收、做到什么程度为止写成执行清单。

总控说明见 [00-overview-and-acceptance.md](00-overview-and-acceptance.md)。本 issue 里的“当前已实现”只描述已经接线的能力；未完成的完整引用回跳验收记录、多平台打包验收和 native binary 安装体验必须继续拆 issue 验收。

## 背景

ReadAny 需要把本地阅读能力开放给外部 AI agent，但开放的是受控业务工具，不是裸数据库、任意文件系统或任意 shell。

目标链路：

```text
安装 CLI
  -> 安装 Skill
  -> 外部 AI 通过 MCP 发现 ReadAny
  -> 读取书库 / 章节 / 笔记 / 高亮 / RAG
  -> 创建 EPUB draft
  -> AI 修改本章或全书
  -> 用户在 draft 工作区继续编辑
  -> 查看 history / diff
  -> validate
  -> export 新 EPUB
  -> 审计可追踪
```

核心原则：

- 默认 readonly。
- 写入必须 draft-first。
- 导出默认生成新文件，不覆盖原书。
- MCP `tools/list` 只暴露真实实现、测试通过、文档同步的工具。
- Skill 安装到通用 agent 目录：`$AGENT_HOME/skills/readany` 或 `~/.agent/skills/readany`；Codex / Claude / Cursor / OpenCode 通过 managed symlink 自动发现，`--client all` 额外写入 `~/.agents/skills/readany` 兼容链接。
- 桌面设置页只管 CLI、Skill、MCP、profile 和诊断；用户精排入口在书籍详情、Reader AI 和 draft 工作区。

## 当前已实现

当前分支：`feat/readany-cli`。

已实现能力：

- `packages/cli` 独立 package。
- `readany doctor/install/uninstall/tools list`。
- `readany skill install/uninstall/status`。
- 只读书库、笔记、高亮、书签、skills 查询。
- indexed chunks 章节读取和未索引 EPUB/PDF fallback。
- BM25 RAG over chunks。
- stdio MCP：`initialize`、`tools/list`、`tools/call`。
- 审计日志读取：`readany audit list --json` 和 MCP `audit.list` 可读取最近 CLI/MCP 调用元数据。
- EPUB draft 链路：`inspect`、`draft create`、`draft discard`、`chapter read`、`chapter patch`、`metadata patch`、`toc rebuild`、`history`、`diff`、`validate`、`export`。
- notes export：单本书 notes/highlights 导出为 Markdown、JSON、Obsidian 或 Notion 文件。
- 桌面端 `设置 -> 外部 AI 访问` 入口，可管理 CLI / Skill / readonly MCP 配置。
- `context.get` 已可用，且只读桌面端写入的 reader context snapshot，不读裸 UI 内存。

当前 MCP 可以暴露：

```text
books.list
books.search
books.get
chapters.list
chapters.get
context.get
bookmarks.list
skills.list
notes.search
notes.export
knowledge.export
knowledge.search
highlights.search
rag.search
audit.list
epub.inspect
epub.draft.create
epub.draft.discard
epub.chapter.read
epub.chapter.patch
epub.chapters.patch
epub.metadata.patch
epub.toc.rebuild
epub.history
epub.diff
epub.undo
epub.validate
epub.export
```

当前还不能对外宣称：

- 引用回跳完整验收已经完成。`context.get` 已可用，桌面端会写入 reader context snapshot，Reader AI 侧栏也会显示当前上下文摘要；桌面端 Chat 引用点击已可打开书籍并回跳 EPUB CFI、PDF `page:<n>` 或章节 fallback，但完整验收仍需真实 EPUB/PDF/RAG 样本证据。
- 用户 draft 工作区已经完成真实样本和打包产物验收。书籍详情页已经提供精排草稿入口并可通过受限 CLI bridge 创建 draft；工作区已能查看 history、entry-level diff 和 validate 结果，并能通过受限 action 执行章节 XHTML 读取/保存、元数据编辑、toc rebuild、undo、discard 和 export，但真实样本和打包产物中的端到端验收记录仍需继续补齐。
- CLI 已经是完全无 Node/runtime 依赖的 native binary。

## 功能范围

每个子 issue 都必须写清楚：

- 背景和用户任务。
- 本次要做什么。
- 本次明确不做什么。
- 所属 profile / scope / risk。
- 是否写入，是否影响原始 EPUB。
- CLI 命令、MCP tool、桌面入口分别是什么。
- 需要哪些测试命令和验收证据。
- 做到什么程度就停下来进入验收。

最终 M5 收口时，验收记录除了 `acceptance:validate --strict-m5` 和 `acceptance:finalize` 外，也可以直接使用 `acceptance:assemble` 一步产出 `final-manifest.json` 与最终 bundle；issue 中的交付物说明需要明确采用哪条链路。

### 1. CLI 和安装能力

需要：

- `readany --version`
- `readany doctor --json`
- `readany install`
- `readany uninstall`
- `readany tools list --json`
- 用户安装桌面客户端后，客户端能安装、卸载或修复 CLI。
- CLI 自己可以安装自己、卸载自己，桌面端只是调用入口。
- `bookmarks.list` 和 `skills.list` 已同步进入 CLI help、MCP registry、MCP tools/call 和单测。

不做：

- 不把 CLI 绑定成只能由桌面端启动。
- 不自动授权 editor / publisher profile。
- 不让外部 AI 直接执行任意 shell。

验收：

```bash
pnpm --filter @readany/cli check
pnpm --filter @readany/cli test
pnpm --filter @readany/cli build
node packages/cli/dist/bin/readany.js --version
node packages/cli/dist/bin/readany.js doctor --json
node packages/cli/dist/bin/readany.js tools list --json
```

### 2. Skill 和 MCP 发现能力

需要：

- `readany skill install`
- `readany skill uninstall`
- `readany skill status --json`
- `readany mcp serve --profile readonly`
- Skill 明确告诉外部 AI：默认 readonly、写入走 draft、不要请求任意 SQL/shell/path。
- 设置页能复制 readonly MCP 配置。

不做：

- 不把 Skill 安装到项目目录。
- 不让安装 Skill 等于授权写入。
- 不在 Skill 里暗示外部 AI 可以访问裸数据库。

验收：

```bash
AGENT_HOME="$(mktemp -d)" node packages/cli/dist/bin/readany.js skill install --json
AGENT_HOME="$(mktemp -d)" node packages/cli/dist/bin/readany.js skill status --json
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n' \
  | node packages/cli/dist/bin/readany.js mcp serve --profile readonly
printf '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}\n' \
  | node packages/cli/dist/bin/readany.js mcp serve --profile readonly
```

### 3. 只读数据能力

需要：

- 书籍列表、搜索、详情。
- 章节目录和范围读取。
- 笔记、高亮、书签、skills 查询。
- 全库 knowledge search，聚合搜索书籍 metadata、notes 和 highlights，返回有限 snippet 和引用。
- BM25 / vector / hybrid RAG。
- 当前书、当前章、选区上下文资源。

当前边界：

- `chapters.*` 当前是 indexed chunks 优先，未索引 EPUB/PDF fallback。
- `context.get` 当前只读取桌面端写入的 reader context snapshot，返回当前书、当前章、位置、选区、可见正文和最近高亮，不修改阅读状态、不读取裸 UI 内存。
- `rag.search` 当前支持 BM25、hybrid 和 vector。BM25 总是可用；hybrid 在 embedding 未配置或失败时回退 BM25；vector 需要桌面端远程向量模型配置或 `READANY_EMBEDDING_MODEL` 环境配置。

验收：

```bash
node packages/cli/dist/bin/readany.js books list --json
node packages/cli/dist/bin/readany.js books search "keyword" --json
node packages/cli/dist/bin/readany.js book get <book-id> --json
node packages/cli/dist/bin/readany.js chapters list <book-id> --json
node packages/cli/dist/bin/readany.js chapter get <book-id> <chapter-id> --chunk-start 1 --chunk-count 20 --json
node packages/cli/dist/bin/readany.js notes search "keyword" --json
node packages/cli/dist/bin/readany.js highlights search "keyword" --json
node packages/cli/dist/bin/readany.js knowledge search "keyword" --json
node packages/cli/dist/bin/readany.js rag search "keyword" --book <book-id> --json
```

### 4. EPUB draft 和精排能力

需要：

- `epub.inspect`
- `epub.draft.create`
- `epub.draft.discard`
- `epub.chapter.read`
- `epub.chapter.patch`
- `epub.metadata.patch`
- `epub.toc.rebuild`
- `epub.history`
- `epub.diff`
- `epub.draft.discard` 作为当前可回滚路径。
- `epub.undo` 作为单操作撤销路径。
- AI 可以修本章、指定章节范围或全书。
- Reader AI 可以生成封面、见解、元数据、目录、全书修复建议。
- 用户可以在 draft 工作区手动编辑，并继续交给 AI 修改。

当前边界：

- `epub.toc.rebuild` 只重建 EPUB3 nav 目录，不重建 NCX，也不生成内容级 diff。
- `epub.chapter.patch` 当前只替换 draft 内单个 XHTML 章节资源。
- `epub.diff` 当前只比较 EPUB entry 的 hash 和 size，不返回完整正文。
- `epub.undo` 当前只撤销已记录且资源未被后续改动覆盖的 chapter / metadata / toc patch。

验收：

```bash
ORIGINAL_HASH="$(shasum -a 256 sample.epub | awk '{print $1}')"
node packages/cli/dist/bin/readany.js epub draft create <book-id> --profile editor --json
node packages/cli/dist/bin/readany.js epub chapter read <draft-id> <chapter-id> --profile editor --json
node packages/cli/dist/bin/readany.js epub chapter patch <draft-id> <chapter-id> --xhtml chapter.xhtml --profile editor --json
node packages/cli/dist/bin/readany.js epub metadata patch <draft-id> --patch metadata.json --profile editor --json
node packages/cli/dist/bin/readany.js epub history <draft-id> --profile editor --json
node packages/cli/dist/bin/readany.js epub diff <draft-id> --profile editor --json
test "$ORIGINAL_HASH" = "$(shasum -a 256 sample.epub | awk '{print $1}')"
```

### 5. Validate 和 Export

需要：

- `epub.validate`
- `epub.export`
- `notes.export`
- knowledge export。
- 导出审计。
- audit list 不返回完整正文、工具参数、密钥或同步凭证。
- publisher profile 或等价明确授权。

当前边界：

- `epub.validate` 已实现为结构和资源引用校验，不自动修复。
- `epub.export` 已实现为 validate 后导出新 EPUB，默认不覆盖已有文件、不覆盖原书。
- `notes.export` 已实现为单本书 notes/highlights 文件导出，默认不覆盖已有文件。
- `knowledge.export` 已实现为全库知识文件导出，默认不覆盖已有文件，CLI/MCP 响应只返回输出元数据。
- `knowledge.search` 已实现为全库聚合搜索，默认只返回有界 snippet 和 book/note/highlight/cfi 引用，不返回完整导出正文或任意文件内容。

验收：

```bash
node packages/cli/dist/bin/readany.js epub validate <draft-id> --profile publisher --json
node packages/cli/dist/bin/readany.js epub export <draft-id> --output exported.epub --profile publisher --json
node packages/cli/dist/bin/readany.js notes export <book-id> --output notes.md --profile publisher --json
test -f exported.epub
```

必须确认：

- validate 失败时 export 失败。
- export 默认不覆盖已有文件。
- readonly / editor profile 不能 export。
- 导出不修改原始 EPUB。
- 导出产物能重新导入 ReadAny，或至少能被标准 EPUB 工具打开。

### 6. 桌面端入口

设置页：

```text
设置 -> 外部 AI 访问
```

负责：

- CLI 安装 / 卸载 / 修复。
- Skill 安装 / 卸载 / 状态。
- readonly MCP 配置复制。
- doctor 诊断展示。
- profile 状态展示。
- 审计日志浏览。

精排入口：

```text
书籍详情 -> 创建精排草稿
Reader AI -> 修本章 / 修全书 / 生成建议
Draft 工作区 -> 用户编辑 / diff / history / validate / export
```

验收：

- 用户不用命令行也能安装 CLI 和 Skill。
- 用户能复制 readonly MCP 配置给外部 agent。
- 设置页明确说明：安装 CLI 不等于授权写入。
- 设置页明确说明：安装 Skill 不等于开放 editor / publisher。
- 正文编辑不放在设置页。

## 工程落点

`packages/core`：

- 数据查询。
- RAG。
- EPUB 解析。
- draft workspace。
- history / diff。
- validate / export。

`packages/cli`：

- 命令解析。
- profile / scope。
- tool registry。
- MCP server。
- Skill 安装器。
- JSON / text 输出。
- 审计日志写入。

桌面客户端：

- 调 CLI。
- 展示状态。
- 复制配置。
- 发起 draft 编辑动作。
- 展示 diff / history。
- 确认 export。

## 测试要求

提交前基础命令：

```bash
pnpm --filter @readany/cli check
pnpm --filter @readany/cli test
pnpm --filter @readany/cli build
git diff --check
```

触碰 core EPUB 能力时补跑：

```bash
pnpm --filter @readany/core test -- src/epub/inspect.test.ts src/epub/draft.test.ts src/epub/chapter.test.ts src/epub/metadata.test.ts src/epub/diff.test.ts src/epub/validate.test.ts src/epub/export.test.ts
```

触碰桌面客户端或 Tauri bridge 时补跑：

```bash
cargo test readany_cli --lib
cargo check
pnpm --filter app build
```

测试硬要求：

- 使用临时 `READANY_HOME`。
- 使用临时 `AGENT_HOME`。
- 不读写开发者真实书库。
- MCP `tools/list` 不出现规划中但未实现的工具。
- readonly profile 调写入工具必须失败。
- 写入工具必须证明原始 EPUB hash 不变。

## Definition of Done

每个新增 CLI command / MCP tool 必须满足：

```text
[ ] 有真实实现，不是 mock
[ ] 有 CLI 命令或 MCP tool schema
[ ] 有 JSON 输出
[ ] 有 text 输出或明确说明不需要
[ ] 有 profile / scope
[ ] 有稳定错误码
[ ] 有输出大小控制
[ ] 有成功测试
[ ] 有失败测试
[ ] 有权限测试
[ ] 有文档
[ ] README / help / tools/list 状态一致
[ ] 测试使用临时 READANY_HOME / AGENT_HOME
```

MCP tool 额外要求：

```text
[ ] inputSchema 有 required
[ ] inputSchema 有 additionalProperties: false
[ ] 运行时拒绝未声明参数
[ ] 运行时校验 minLength / minimum / maximum / enum
[ ] tools/list 只展示已实现工具
[ ] 输出不包含密钥、同步配置、任意本地路径
```

写入工具额外要求：

```text
[ ] readonly profile 调用失败
[ ] 写入目标是 draft 或受控对象
[ ] 原始文件 hash 不变
[ ] history 有记录
[ ] diff 或 summary 可查看
[ ] 失败不会留下半写状态
[ ] 有 undo、rollback 或 discard 路径
```

导出工具额外要求：

```text
[ ] validate 先于 export
[ ] 默认不覆盖原文件
[ ] 输出路径受控或用户授权
[ ] publisher profile 或确认机制生效
[ ] 导出产物可重新导入或被标准工具打开
[ ] 审计日志记录导出
```

## Milestone 停止线

M1：

```text
外部 AI 能发现 ReadAny，并在 readonly 下读取书库、笔记、高亮、已索引章节、当前 context 和 RAG。
```

M2：

```text
外部 AI 能读取未索引 EPUB/PDF 内容，并获得可回跳引用；RAG 支持 vector / hybrid。
```

M3：

```text
AI 和用户都可以在 draft 上编辑 EPUB，本章和全书修改都受控可追踪，原书不变。
```

M4：

```text
用户可以 validate 并 export AI / 用户共同编辑后的 EPUB 新文件。
```

M5：

```text
普通用户可以通过桌面端完成外部 AI 接入；高级用户可以通过 CLI/MCP 跑完整读、搜、精排、导出闭环。
```

## 不通过条件

出现任一情况，本阶段不能算完成：

- 文档写了工具，但 registry 没有真实实现。
- MCP `tools/list` 暴露规划中工具。
- readonly profile 能写入、导出或同步。
- 测试读写真实用户目录。
- patch 直接修改原始 EPUB。
- export 默认覆盖原文件。
- Skill 安装后让用户误以为已经授权写入。
- 设置页承担正文编辑入口。
- 审计日志记录完整正文、密钥或同步凭证。

## 验收记录

每个 milestone 完成时，复制模板：

```text
docs/readany-cli/acceptance/TEMPLATE.md
```

保存为：

```text
docs/readany-cli/acceptance/YYYY-MM-DD-Mx.md
```

记录：

- 日期、分支、commit。
- OS、Node、pnpm 版本。
- 执行命令。
- MCP `tools/list` 摘要。
- 权限拒绝证据。
- 原始 EPUB hash 证据。
- 外部 agent 验证结果。
- 已知问题。
- 是否允许进入下一阶段。
