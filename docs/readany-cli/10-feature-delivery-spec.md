# ReadAny CLI Feature Delivery Spec

这份文档把 ReadAny CLI、外部 AI 访问、EPUB 精排、用户编辑和导出能力拆成可以直接开发、测试和验收的工作项。

它回答：

- 我们到底需要哪些功能。
- 每个功能应该怎么做。
- 每个功能应该怎么测。
- 验收要看什么证据。
- 做到什么程度才算完成，什么时候不能继续往下说“完成了”。

## 1. 产品目标

ReadAny CLI 要成为 ReadAny 的本地能力网关。它不是一个普通命令行附属品，而是外部 AI、脚本、高级用户和桌面客户端共同访问本地能力的统一入口。

完整目标链路：

```text
安装 CLI
  -> 安装 Skill
  -> 外部 AI 发现 ReadAny
  -> 读取书库 / 内容 / 笔记 / 高亮
  -> 检索知识
  -> 创建 EPUB draft
  -> AI 修改本章或全书
  -> 用户手动编辑 draft
  -> 查看 history / diff
  -> validate
  -> export 新文件
  -> 审计可追踪
```

核心原则：

- 开放业务能力，不开放裸数据库。
- 开放受控文件操作，不开放任意文件系统。
- 开放工具调用，不开放任意 shell。
- 默认 readonly。
- 写入必须 draft-first。
- 导出默认生成新文件，不覆盖原书。
- MCP `tools/list` 只展示已经真实实现、测试通过、文档同步的能力。

## 2. 功能清单

### 2.1 CLI 基础能力

必须提供：

```bash
readany --version
readany doctor --json
readany install
readany uninstall
readany tools list --json
```

完成标准：

- CLI 是独立 package。
- 构建产物能独立启动。
- `doctor --json` 能输出机器可读诊断。
- `install` / `uninstall` 可逆。
- 桌面客户端可以调用 CLI 自身完成安装、卸载、修复。

不做：

- 不把 CLI 做成必须依赖桌面 UI 才能运行。
- 不让 install 直接修改 agent 配置里的高风险 profile。

### 2.2 Skill 能力

必须提供：

```bash
readany skill install
readany skill uninstall
readany skill status --json
```

Skill 安装位置：

```text
$AGENT_HOME/skills/readany
~/.agent/skills/readany
```

客户端自动发现由 `agent setup --client codex|claude|cursor|opencode` 通过 managed symlink 完成；`agent setup --client all` 会一次性写入所有已知客户端目录和 `~/.agents` 兼容目录。

Skill 内容必须说明：

- 如何启动 `readany mcp serve --profile readonly`。
- ReadAny 默认 readonly。
- 写入必须通过 draft。
- 不能要求任意 shell、任意 SQL、任意本地路径。
- editor / publisher profile 的风险边界。

完成标准：

- 安装、卸载、状态查询都能在临时 `AGENT_HOME` 中测试。
- 卸载只删除 ReadAny 管理的文件。
- 已存在的非 ReadAny 文件不会被误删。

### 2.3 只读数据能力

CLI 命令：

```bash
readany books list --json
readany books search <query> --json
readany book get <book-id> --json
readany chapters list <book-id> --json
readany chapter get <book-id> <chapter-id> --chunk-start 1 --chunk-count 20 --json
readany context get --json
readany notes search <query> --json
readany highlights search <query> --json
readany bookmarks list <book-id> --json
readany skills list --json
readany rag search <query> --book <book-id> --mode bm25 --json
readany rag search <query> --book <book-id> --mode hybrid --json
readany rag search <query> --book <book-id> --mode vector --json
```

MCP tools：

```text
books.list
books.search
books.get
chapters.list
chapters.get
context.get
notes.search
highlights.search
rag.search
audit.list
```

完成标准：

- 所有工具默认 profile 为 `readonly`。
- 大结果有 `limit`、`cursor`、`chunk-start`、`chunk-count` 或等价限制。
- 结果不暴露本地绝对路径、同步凭证、数据库路径。
- RAG 结果包含可回跳引用，例如 book / chapter / chunk / page / cfi 中至少一种。

当前边界：

- `chapters.*` 当前是 indexed chunks 优先，未索引 EPUB/PDF fallback。
- `context.get` 当前只读取桌面端写入的 reader context snapshot，返回当前书、当前章、位置、选区、可见正文和最近高亮，不读取 UI 内存。
- `rag.search` 当前支持 BM25、hybrid 和 vector。BM25 总是可用；hybrid 在 embedding 未配置或失败时回退 BM25；vector 需要桌面端远程向量模型配置或 `READANY_EMBEDDING_MODEL` 环境配置。

### 2.4 MCP 能力

必须提供：

```bash
readany mcp serve --profile readonly
readany mcp serve --profile editor
readany mcp serve --profile publisher
readany mcp config --profile readonly --client generic --json
```

第一阶段实际开放 readonly 配置，editor / publisher 只能在用户明确开启后使用。
`mcp config` 只生成外部 agent 配置片段，不启动服务、不增加工具权限。

MCP 必须支持：

- `initialize`
- `tools/list`
- `tools/call`
- profile 权限检查
- inputSchema 运行时校验
- `additionalProperties: false`
- 标准 JSON-RPC 错误
- ReadAny `CommandResult` JSON 输出

完成标准：

- `tools/list` 不出现规划中但未实现的工具。
- readonly 调写工具返回 `permission_denied`。
- 未声明参数被拒绝。
- 超出 schema 边界的参数被拒绝。
- MCP stdio smoke 使用构建后的 CLI 运行。

### 2.5 EPUB Draft 和精排能力

精排不是一个单点功能，而是一组 draft-first 工具。

基础工具：

```bash
readany epub inspect <book-id> --profile editor --json
readany epub draft create <book-id> --profile editor --json
readany epub draft discard <draft-id> --profile editor --reason "..." --json
readany epub chapter read <draft-id> <chapter-id> --profile editor --json
readany epub chapter patch <draft-id> <chapter-id> --xhtml <file> --profile editor --json
readany epub metadata patch <draft-id> --patch <file> --profile editor --json
readany epub toc rebuild <draft-id> --profile editor --json
readany epub history <draft-id> --profile editor --json
readany epub diff <draft-id> --profile editor --json
readany epub undo <draft-id> <operation-id> --profile editor --json
```

`epub.draft.discard` 用于丢弃整个 draft；`epub.undo` 用于撤销已记录且资源未被后续改动覆盖的 chapter / metadata / toc patch。

AI 编辑能力必须覆盖：

- 修改当前章。
- 修改指定章节范围。
- 修改全书。
- 修 metadata。
- 修 toc。
- 修 CSS / 样式。
- 给封面、元数据、目录、章节结构、全书修复方案提出建议。

用户编辑能力必须覆盖：

- 从书籍详情创建 draft。
- 在 draft 工作区编辑章节。
- 编辑 metadata。
- 查看 AI 修改。
- 查看 diff。
- 查看 history。
- 撤销或丢弃 draft。
- validate。
- export。

完成标准：

- 原始 EPUB hash 不变。
- 所有写入只落在 draft workspace。
- 每次写入有 operation history。
- patch 失败不会留下半写状态。
- diff 不返回完整正文。
- readonly profile 不能创建 draft、patch、discard、export。
- 用户编辑和 AI 编辑共用同一套 draft / history / diff。

### 2.6 导出能力

必须提供：

```bash
readany epub validate <draft-id> --profile publisher --json
readany epub export <draft-id> --profile publisher --output <path> --json
readany notes export <book-id> --output <path> --profile publisher --format markdown --json
readany knowledge export --output <path> --profile publisher --format obsidian --json
readany knowledge search "keyword" --json
```

当前已实现 `epub.validate`、`epub.export`、`notes.export`、`knowledge.export` 和 `knowledge.search`；knowledge export 只做文件级全库知识导出，默认不覆盖已有文件，不进入 MCP 未实现清单；knowledge search 只返回有界 snippet 和来源引用。

完成标准：

- export 前必须 validate。
- export 默认不覆盖原文件。
- export 输出新文件。
- 输出路径在 workspace 或用户明确授权目录内。
- 导出 EPUB 可以重新导入 ReadAny，或至少通过标准 EPUB 检查。
- 导出记录进入审计日志。

最终验收交付物还必须能被稳定归档。建议在 evidence 收齐后执行：

```bash
pnpm --filter @readany/cli acceptance:assemble -- \
  --record <acceptance-record.md> \
  --evidence <evidence-json> \
  --evidence <agent-evidence-json> \
  --evidence <desktop-evidence-json> \
  --evidence <macos-packaged-evidence-json> \
  --evidence <windows-packaged-evidence-json> \
  --evidence <linux-packaged-evidence-json> \
  --release <release-label> \
  --reviewer <name> \
  --output-dir <acceptance-bundle-dir>
```

这条命令必须先通过 strict M5，再生成 `final-manifest.json` 和最终 bundle；因此它可以作为“交付物齐全”的最后一道机器闸门。

### 2.7 桌面客户端入口

设置页入口：

```text
设置 -> 外部 AI 访问
```

设置页负责：

- CLI 安装 / 卸载 / 修复。
- Skill 安装 / 卸载 / 状态。
- readonly MCP 配置复制。
- doctor 结果展示。
- profile 状态展示。
- 审计日志浏览。

设置页不负责：

- 正文编辑。
- 精排工作区。
- 移动端安装 CLI。

精排入口：

```text
书籍详情 -> 创建精排草稿
Reader AI -> 修本章 / 修全书 / 生成建议
Draft 工作区 -> 用户编辑 / diff / history / validate / export
```

完成标准：

- 用户不用命令行也能安装 CLI 和 Skill。
- 用户能复制 readonly MCP 配置给外部 agent。
- 用户清楚知道安装 CLI 不等于授权写入。
- 用户清楚知道安装 Skill 不等于开放 editor / publisher。

## 3. 工程落点

### 3.1 `packages/core`

放业务能力：

- 数据查询。
- EPUB 解析。
- draft workspace。
- history / diff。
- validate / export。
- RAG。

规则：

- CLI 不直接实现复杂 EPUB 逻辑。
- 业务状态不要散落在命令解析层。
- core 返回稳定结构，CLI 负责展示。

### 3.2 `packages/cli`

放协议和入口：

- 命令解析。
- profile / scope。
- tool registry。
- MCP server。
- Skill 安装器。
- JSON / text 输出。
- 审计日志写入。

规则：

- 新 MCP tool 必须先进入 registry。
- registry 只放真实工具。
- 每个 tool 有 schema、scope、risk。
- schema 必须运行时校验。

### 3.3 桌面客户端

放 UI 和用户确认：

- 调 CLI。
- 展示状态。
- 复制配置。
- 发起 draft 编辑动作。
- 展示 diff / history。
- 确认 export。

规则：

- 不复制 CLI 的业务逻辑。
- 不绕过 draft service 直接改 EPUB。
- 高风险 profile 必须明确解释影响。

## 4. 实现流程

每个新增功能都按同一套流程：

```text
写需求边界
  -> core 实现
  -> CLI 命令
  -> JSON/text 输出
  -> tool registry
  -> MCP tools/call
  -> 权限和审计
  -> 测试
  -> 文档
  -> tools/list / README 同步
```

新增工具前必须写清：

- 用户任务。
- 输入参数。
- 输出结构。
- profile / scope。
- risk。
- 错误码。
- 分页 / 限流方式。
- 是否写入。
- 是否影响原始文件。
- 是否需要用户确认。

## 5. 测试要求

### 5.1 提交前基础命令

CLI 相关改动必须跑：

```bash
pnpm --filter @readany/cli check
pnpm --filter @readany/cli test
pnpm --filter @readany/cli build
git diff --check
```

触碰 core EPUB 能力时补跑：

```bash
pnpm --filter @readany/core test -- src/epub/inspect.test.ts src/epub/draft.test.ts src/epub/chapter.test.ts src/epub/metadata.test.ts src/epub/diff.test.ts
```

触碰桌面客户端或 Tauri bridge 时补跑：

```bash
cargo test readany_cli --lib
cargo check
pnpm --filter app build
```

### 5.2 单元测试

必须覆盖：

- 命令解析。
- JSON 输出。
- text 输出。
- profile / scope。
- path 解析。
- tool registry。
- input schema 校验。
- skill install / uninstall。
- audit log 摘要。
- `readany audit list --json` 和 MCP `audit.list` 摘要。
- draft history。
- 原始 EPUB hash 不变。

### 5.3 集成测试

必须覆盖：

- 临时 `READANY_HOME` seed 数据。
- 临时 `AGENT_HOME` skill 安装。
- CLI 读书库。
- MCP `initialize`。
- MCP `tools/list`。
- MCP `tools/call`。
- readonly 拒绝写工具。
- editor 只能写 draft。
- 构建后 CLI 的 MCP stdio smoke。

### 5.4 E2E 和手工验收

必须覆盖：

- macOS。
- Windows。
- Linux。
- 至少一个外部 agent。
- 桌面客户端设置页。
- 一条完整 draft 编辑链路。
- 一条 export 链路。

外部 agent 验收至少包括：

```text
复制 MCP 配置
  -> agent 启动 readany mcp serve
  -> tools/list 可见
  -> books.list 成功
  -> readonly 写工具被拒绝
```

## 6. 验收标准

### 6.1 单功能 Definition of Done

每个功能完成前必须满足：

```text
[ ] 有真实实现，不是 mock
[ ] 有 CLI 命令或 MCP tool
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
[ ] inputSchema 声明 required
[ ] inputSchema 声明 additionalProperties: false
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

### 6.2 Milestone 验收

M1 完成：

```text
外部 AI 可以发现 ReadAny，并在 readonly 下读取书库、笔记、高亮、已索引章节和 RAG。
```

验收证据：

- CLI check / test / build 通过。
- MCP smoke 通过。
- `tools/list` 只含真实工具。
- readonly 写工具返回 `permission_denied`。
- Skill 可安装和卸载。
- 设置页能复制 readonly MCP 配置。

M2 完成：

```text
外部 AI 可以读取未索引 EPUB/PDF 内容，并获得可回跳引用；RAG 支持 vector / hybrid。
```

验收证据：

- fallback EPUB 章节读取通过。
- PDF 页级或章节级读取通过。
- vector / hybrid RAG 有测试和回退策略。
- 引用可回跳。

M3 完成：

```text
AI 和用户都可以在 draft 上编辑 EPUB，本章和全书修改都受控可追踪。
```

验收证据：

- draft create 通过。
- chapter patch 通过。
- metadata patch 通过。
- toc rebuild 通过。
- history / diff 通过。
- undo 和 discard 通过。
- 原始 EPUB hash 不变。
- 用户 draft 工作区可编辑。

M4 完成：

```text
用户可以 validate 并 export AI / 用户共同编辑后的 EPUB 新文件。
```

验收证据：

- validate 可发现结构错误。
- export 输出新 EPUB。
- 导出产物可重新导入。
- publisher profile 生效。
- 审计日志记录导出。

M5 完成：

```text
普通用户可以通过桌面端完成外部 AI 接入；高级用户可以通过 CLI/MCP 跑完整读、搜、精排、导出闭环。
```

验收证据：

- macOS / Windows / Linux 基础安装通过。
- 至少两个外部 agent 验证通过，其中一个使用 MCP。
- 设置页可安装、卸载、修复 CLI 和 Skill。
- 审计日志可查看。
- 完整链路验收记录归档。

## 7. 停止线

### 7.1 可以对外说明的状态

当 M1 通过，可以说：

- ReadAny 有独立 CLI package。
- ReadAny 有 readonly MCP 入口。
- 外部 AI 可以读书库、笔记、高亮、已索引章节和 RAG chunks。
- 外部 AI 可以在授权 profile 下操作 EPUB draft 的已实现工具。
- 桌面端有外部 AI 访问设置入口。

必须同时说明：

- indexed chapters 和未索引 EPUB/PDF fallback 都已由 `chapters.*` 覆盖。
- `rag.search` 支持 BM25、hybrid 和 vector；hybrid 可回退，vector 需要 embedding 配置。
- draft patch 不等于 export。
- inspect 不修改文件。
- 已实现工具才会出现在 `tools/list`，后续规划工具不能提前注册。

### 7.2 不能算完成的状态

这些状态不能算完成：

- 文档写了工具，但 registry 没有真实实现。
- MCP 暴露规划中工具。
- readonly profile 能写入。
- 测试读写真实用户目录。
- patch 直接修改原始 EPUB。
- export 默认覆盖原文件。
- Skill 安装后让用户误以为已经授权写入。
- 设置页承担正文编辑入口。

## 8. Issue 拆分

建议按下面拆 issue：

1. CLI 基础命令和安装器。
2. Skill 安装器和通用 agent 目录。
3. readonly MCP server 和 tool registry。
4. 只读书库、笔记、高亮查询。
5. indexed chapters 和 BM25 RAG。
6. EPUB inspect 和 draft create。
7. EPUB chapter read / patch。
8. EPUB metadata patch。
9. EPUB history / diff。
10. EPUB discard / undo。
11. EPUB toc rebuild。
12. EPUB validate / export。
13. 桌面设置页外部 AI 访问。
14. 书籍详情和 draft 工作区用户编辑入口。
15. 审计日志 UI 和 profile 管理。
16. native binary / runtime bundle 安装体验。

每个 issue 必须包含：

- 背景。
- 范围。
- 不做什么。
- 工程落点。
- 安全边界。
- 测试命令。
- 验收证据。
- 停止线。

## 9. 验收记录

每次 milestone 验收后，要在 `docs/readany-cli/acceptance/` 下新增记录，使用：

```text
docs/readany-cli/acceptance/TEMPLATE.md
```

记录至少包含：

- 日期。
- 分支。
- commit。
- 操作系统。
- Node / pnpm 版本。
- 执行命令。
- MCP tools/list 摘要。
- 权限拒绝证据。
- 外部 agent 验证结果。
- 已知问题。
- 是否允许进入下一阶段。

M5 最终收口时还要补：

- `pnpm --filter @readany/cli acceptance:validate -- --record <record.md> --evidence ... --strict-m5`
- `pnpm --filter @readany/cli acceptance:finalize -- --record <record.md> --evidence ... --output <manifest.json>`

其中 strict M5 的组合 evidence 至少包含：

- 1 份 real-sample evidence
- 2 份不同客户端 external-agent evidence，其中 1 份 MCP-backed
- 1 份 desktop-settings evidence
- macOS / Windows / Linux 三平台 packaged evidence

外部 agent smoke 可先用下列命令形成自动化证据：

```bash
pnpm --filter @readany/cli build
pnpm --filter @readany/cli smoke:agent
```

该 smoke 通过 built CLI 的 stdio MCP 跑 readonly 发现/搜索、PDF fallback 章节读取、readonly 写入拒绝、editor draft 批量章节修改和 toc rebuild、publisher validate/export、audit、源 EPUB hash 不变，以及导出 EPUB 重新入库后的 inspect / chapter read 检查；真实 Codex / Claude Desktop / Cursor 客户端仍需单独手工记录。
