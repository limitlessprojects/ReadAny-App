# ReadAny CLI 总说明与验收线

这份文档是 ReadAny CLI / External AI Access / EPUB 精排的总控说明，给产品、工程、测试和后续外部 AI skill 共用。

它回答五个问题：

1. 我们要做哪些功能。
2. 每个功能应该放在哪一层做。
3. 每个阶段怎么实现。
4. 每个阶段怎么测试。
5. 到什么程度算验收通过，什么情况不能说完成。

如果只读一份文档，先读这一份。更细的命令和工具清单见 [05-command-and-tool-spec.md](05-command-and-tool-spec.md)，更严格的交付合同见 [09-delivery-acceptance-contract.md](09-delivery-acceptance-contract.md)，可直接贴 issue 的正文见 [11-implementation-issue.md](11-implementation-issue.md)。

最终 M5 验收归档既可以分两步执行 `acceptance:finalize` + `acceptance:bundle`，也可以一步执行 `acceptance:assemble`。后一种更适合发布前收口，因为它会先卡 strict M5，再把 manifest 和 bundle 一起产出。

## 1. 目标

ReadAny CLI 不是一个给人类敲命令的小工具，而是 ReadAny 的本地能力网关。

它要把本地书库、笔记、高亮、章节、RAG、EPUB 精排、导出和诊断能力，安全地开放给外部 AI 和高级用户。

核心原则只有一句话：

> 开放能力，不开放裸数据库、任意文件系统、任意 shell。

完整链路应该是：

```text
安装 CLI
  -> 安装 Skill
  -> 外部 AI 通过 MCP 发现 ReadAny
  -> 读取书库 / 章节 / 当前上下文 / 笔记 / 高亮 / RAG
  -> 创建 EPUB draft
  -> AI 修改本章、章节范围或全书
  -> 用户在 draft 工作区继续编辑
  -> 查看 history / diff
  -> validate
  -> export 新 EPUB
  -> audit 可追踪
```

安全边界：

- 默认 `readonly`。
- 写入必须 draft-first。
- 导出默认生成新文件，不覆盖源 EPUB。
- MCP `tools/list` 只暴露真实实现、测试通过、文档同步的工具。
- CLI 安装不等于开放外部 AI 写入。
- Skill 安装不等于授权 editor / publisher profile。

## 2. 我们需要什么功能

### 2.1 CLI 基础

- `readany --version`
- `readany doctor --json`
- `readany install`
- `readany uninstall`
- `readany tools list --json`
- `readany skill install`
- `readany skill uninstall`
- `readany skill status --json`

### 2.2 只读数据

- 书籍列表、搜索、详情
- 笔记搜索
- 高亮搜索
- 书签
- skills
- 章节目录和章节内容
- 当前书 / 当前章 / 选区上下文
- RAG 检索

章节读取要支持：

- indexed chunks 优先
- 未索引 EPUB fallback 到 spine / manifest
- 未索引 PDF fallback 到 page text

### 2.3 外部 AI 入口

- `readany mcp serve --profile readonly`
- `readany mcp serve --profile editor`
- `readany mcp serve --profile publisher`
- `initialize`
- `tools/list`
- `tools/call`
- `context.get`
- 审计日志
- profile 权限控制
- Skill 安装到通用 agent 目录
- readonly MCP 配置复制

第一阶段默认只向用户提供 readonly 配置。editor / publisher 必须由用户显式开启并确认风险。

### 2.4 EPUB 精排

精排不是一个按钮，而是一组受控能力：

```text
inspect -> draft create -> chapter read -> patch -> metadata patch -> toc rebuild -> diff -> validate -> export
```

AI 可以：

- 修改当前章
- 修改指定章节范围
- 修改全书
- 修改 metadata
- 修改 toc
- 修改 CSS / 样式
- 生成封面、见解、元数据、目录、章节结构、全书修复建议

用户可以：

- 从书籍详情创建 draft
- 在 draft 工作区手动改章节
- 改 metadata
- 查看 AI 修改
- 看 diff
- 看 history
- undo 或 discard
- validate
- export

AI 编辑和用户编辑必须共用同一套 draft / history / diff，不能各走一套隐藏状态。

### 2.5 桌面端入口

- `设置 -> 外部 AI 访问`
- CLI 安装 / 卸载 / 修复
- Skill 安装 / 卸载 / 状态
- readonly MCP 配置复制
- doctor 诊断展示

用户精排入口不放在设置页，而放在：

- 书籍详情页
- draft 工作区

设置页只负责接入和权限管理。

Reader AI 入口负责当前阅读语境里的“修本章 / 修全书 / 生成建议”。书籍详情入口负责从一本书开始创建精排草稿。Draft 工作区负责用户编辑、diff、history、validate 和 export。

## 3. 怎么做

### 3.1 分层

- `@readany/core` 放真正的领域能力
- `@readany/cli` 放命令入口、权限、协议和安装器
- MCP 放外部 AI 访问面
- Skill 放使用说明和调用模板
- 桌面端放图形化管理入口

分层规则：

- CLI 不直接实现复杂 EPUB 逻辑。
- MCP 不绕过 CLI / domain service。
- 桌面端不复制 CLI 的业务逻辑。
- 设置页不放正文编辑器。
- Draft 工作区不直接改源 EPUB。

每个新增工具都要先写清：

- 用户或外部 AI 要完成什么任务。
- 输入参数和输出结构。
- profile / scope / risk。
- 是否写入，是否影响源文件。
- 大结果如何分页、限流或范围读取。
- 错误码和审计字段。

### 3.2 实现顺序

#### M1

先做只读外部 AI 入口：

- CLI package
- doctor / install / uninstall
- skill 管理
- books / notes / highlights / bookshelves 只读查询
- indexed chapters
- BM25 RAG
- readonly MCP
- 最小审计

做到这里，外部 AI 能发现 ReadAny，并在 readonly 下读取书库、笔记、高亮、已索引章节和 RAG。M1 不能宣称 AI 已经能精排、导出或写入。

#### M2

再补内容理解能力：

- 未索引 EPUB/PDF fallback
- vector / hybrid RAG
- 引用回跳
- reader context snapshot

做到这里，外部 AI 能处理未索引内容，并能拿到当前阅读上下文和可回跳引用。

#### M3

再做精排编辑：

- EPUB inspect
- draft create
- chapter patch
- metadata patch
- toc rebuild
- history / diff
- undo / discard
- 用户 draft 编辑入口

做到这里，AI 和用户能在同一个 draft 上编辑 EPUB，原书不变，但还不能把“发布可用”算完成。

#### M4

再做校验和导出：

- validate
- export
- notes export
- knowledge export
- 客户端完整管理入口

做到这里，用户能 validate 并 export 新 EPUB，导出有权限和审计。

#### M5

最后把闭环跑通：

- 读
- 搜
- 整理
- 精排
- 导出
- 审计

做到这里，普通用户能通过桌面端完成外部 AI 接入；高级用户能通过 CLI/MCP 跑完整读、搜、精排、导出闭环。

## 4. 怎么测试

### 4.1 单元测试

覆盖：

- 命令解析
- JSON / text 输出
- profile 解析
- path 解析
- skill 安装路径
- tool schema
- input schema 运行时校验
- draft 规则
- audit log 摘要

### 4.2 集成测试

覆盖：

- CLI 走 core 能力
- MCP server 启动并响应
- readonly profile 不能写
- editor / publisher profile 只能做各自允许的事
- MCP `tools/list` 只列真实工具
- 构建后 CLI 的 MCP stdio smoke
- 测试必须用临时 `READANY_HOME` / `AGENT_HOME`

### 4.3 Smoke 测试

必须有：

```bash
pnpm --filter @readany/cli check
pnpm --filter @readany/cli test
pnpm --filter @readany/cli build
git diff --check
```

触碰桌面客户端或 Tauri bridge 时还要跑：

```bash
cargo test readany_cli --lib
cargo check
pnpm --filter app build
```

MCP smoke：

```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n' | readany mcp serve --profile readonly
printf '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}\n' | readany mcp serve --profile readonly
```

### 4.4 手工验证

至少要看：

- macOS / Windows / Linux 的安装体验
- 一个外部 agent 是否能发现 ReadAny
- 桌面端是否能管理 CLI / Skill / MCP
- readonly 写工具是否被拒绝
- draft 编辑链路是否保持源 EPUB hash 不变
- export 产物是否能重新导入或被标准 EPUB 工具打开

## 5. 验收标准

### 5.1 单功能 Definition of Done

每个 CLI command / MCP tool 必须满足：

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
[ ] 默认不覆盖源文件或已有文件
[ ] 输出路径受控或用户授权
[ ] publisher profile 或确认机制生效
[ ] 导出产物可重新导入或被标准工具打开
[ ] audit log 记录导出
```

### 5.2 完整完成时必须满足

- 外部 AI 能发现 ReadAny
- 外部 AI 能读书库、笔记、高亮、章节、RAG
- 外部 AI 能在授权 profile 下操作 draft
- 用户能在 draft 工作区手动编辑
- 用户能导出新文件
- 所有写入和导出都有权限、确认和审计

### 5.3 不能算完成的情况

- 文档写了工具，但 registry 没有真实实现
- MCP `tools/list` 暴露规划中工具
- readonly profile 能写入或导出
- 测试读写真实用户书库
- patch 直接改原始 EPUB
- export 默认覆盖原文件
- 设置页把“安装 Skill”误导成“已经开放写权限”
- audit log 记录完整正文、密钥、同步凭证或完整工具参数

## 6. 停止线

### 6.1 Milestone 停止线

M1 可以停下来验收：

- CLI package 存在。
- readonly MCP 可用。
- 只读链路跑通。
- Skill 可安装、卸载、查询状态。
- 设置页能复制 readonly MCP 配置。
- `tools/list` 只包含真实工具。
- 测试不依赖真实用户数据。

M2 可以停下来验收：

- 已索引书籍和未索引 EPUB/PDF 都有可用内容读取路径。
- 大正文支持范围读取。
- reader context snapshot 可读，清理后返回 empty 或被清理。
- RAG 结果包含可回跳引用。
- vector / hybrid 有配置、回退和测试。

M3 可以停下来验收：

- AI 可以创建 draft。
- AI 可以修改本章、章节范围或全书。
- 用户可以从书籍详情创建 draft。
- 用户可以在 draft 工作区查看 diff、history，并手动编辑。
- undo 和 discard 有验收证据。
- 原始 EPUB hash 不变。

M4 可以停下来验收：

- draft validate 可发现结构错误。
- export 默认输出新文件。
- 导出 EPUB 可重新导入 ReadAny，或至少能被标准 EPUB 工具打开。
- publisher profile 或等价授权生效。
- 导出有 audit 记录。

M5 可以停下来验收：

- 用户从桌面设置页完成 CLI / Skill / MCP 配置。
- 至少两个外部 agent 验证通过，其中一个使用 MCP。
- macOS / Windows / Linux 基本安装和 doctor 行为通过。
- 完整链路跑通：

```text
找书 -> 读内容 -> 读笔记/高亮 -> RAG 检索 -> 创建 draft -> AI 修改 -> 用户编辑 -> 校验 -> 导出 -> 审计
```

### 6.2 当前不能对外宣称完整的点

不能说：

- CLI 已经是完全无 Node/runtime 依赖的 native binary。
- 用户 draft 工作区已经完成真实样本和打包产物验收。
- 引用回跳完整验收已经完成。
- `epub.diff` 已经是内容级 diff。
- 安装 Skill 就等于授权写入。

可以说：

- 用户精排入口不放在设置页。
- 书籍详情页已经接入创建精排草稿。
- draft 工作区已经接入章节编辑、metadata 编辑、diff、history、validate、undo、discard 和 export，所有动作都走受限 draft-first 工具。
- 外部 AI 写入必须通过 editor / publisher profile 和 draft-first 工具。

## 7. 建议的 issue 切法

1. CLI 基础命令和安装器
2. Skill 安装器
3. readonly MCP server 和 tool registry
4. 只读书库、笔记、高亮查询
5. 章节 fallback 和 RAG
6. EPUB inspect 和 draft create
7. EPUB chapter patch / metadata patch
8. EPUB history / diff / toc rebuild
9. EPUB validate / export
10. 桌面设置页
11. 书籍详情和 draft 工作区
12. 审计日志和 profile 管理
13. native binary / runtime bundle 安装体验

## 8. 验收记录

每次 milestone 验收后，都要在 `docs/readany-cli/acceptance/` 下补一份记录。

模板见：[acceptance/TEMPLATE.md](acceptance/TEMPLATE.md)

验收记录至少写清：

- 日期、分支、commit。
- OS、Node、pnpm 版本。
- 执行命令和结果。
- MCP `tools/list` 摘要。
- readonly 权限拒绝证据。
- reader context snapshot 证据。
- 原始 EPUB hash 证据。
- export 产物证据。
- 外部 agent 验证结果。
- 已知问题。
- 是否允许进入下一阶段。

M5 最终验收还必须附：

- `acceptance:validate --strict-m5` 的组合 evidence 校验结果。
- `acceptance:finalize` 生成的最终 manifest。
- 真实样本、两个不同外部 agent（其中一个 MCP-backed）、桌面设置页、macOS / Windows / Linux packaged evidence 的 SHA-256 锚点。
