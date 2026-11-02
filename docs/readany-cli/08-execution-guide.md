# ReadAny CLI 执行总纲

这份文档把 ReadAny 的外部 AI 访问能力一次讲清楚：

- 我们要做什么。
- 能力放在哪一层做。
- 怎么实现。
- 怎么测试。
- 到什么程度算完成。

如果只读一份文档，就读这一份。

更严格的交付合同、验收停止线和 issue 拆分见 [09-delivery-acceptance-contract.md](09-delivery-acceptance-contract.md)。

## 1. 这件事的目标

ReadAny CLI 不是给人手敲命令玩的独立小工具，而是 ReadAny 的本地能力网关。

它要把本地书库、笔记、高亮、知识检索、EPUB 精排、导出等能力，安全地开放给外部 AI 和高级用户。

核心原则只有一句话：

> 开放能力，不开放裸数据库、任意文件系统、任意 shell。

## 2. 我们需要什么功能

### 第一类：CLI 自身

- `readany --version`
- `readany doctor`
- `readany install`
- `readany uninstall`
- `readany tools list`
- `readany skill install`
- `readany skill uninstall`
- `readany skill status`

### 第二类：只读数据能力

- 书籍列表和搜索
- 单本书元数据
- indexed chunks 章节读取和范围读取
- 未索引 EPUB fallback 章节读取
- 未索引 PDF fallback 页级读取
- 笔记搜索
- 高亮搜索
- 书签列表
- skills 列表
- BM25 RAG 检索

### 第三类：外部 AI 入口

- `readany mcp serve --profile readonly`
- `tools/list`
- `tools/call`
- 审计日志
- profile 权限控制
- Skill 安装到通用 agent 目录
- MCP 配置片段复制和连接测试

### 第四类：后续编辑能力

- vector / hybrid RAG 检索
- AI 自动修本章
- AI 自动修全书
- 用户手动编辑 draft
- 封面 / 见解 / 元数据 / 目录建议
- draft 创建
- 章节 patch
- 元数据 patch
- TOC 重建
- diff / history / undo
- 校验
- 导出

精排不是一个单独按钮，而是一组能力：

```text
inspect -> draft create -> chapter read -> patch -> metadata patch -> toc rebuild -> diff -> validate -> export
```

AI 编辑和用户编辑都必须使用这组能力。区别只在入口不同：AI 通过 MCP / CLI 调工具，用户通过桌面端 draft 工作区操作。

### 第五类：客户端入口

- 桌面端 `设置 -> 外部 AI 访问`
- CLI 安装 / 卸载 / 修复
- Skill 安装 / 卸载
- readonly MCP 配置复制
- doctor 诊断展示
- 书籍详情里的 `创建精排草稿`
- draft 工作区里的章节编辑、AI 修改、diff、history、validate、export

入口分工：

```text
设置 -> 外部 AI 访问：管 CLI、Skill、MCP、profile、doctor、审计。
书籍详情 -> 精排：创建 draft、查看结构、进入编辑。
Reader AI：对当前章 / 当前书发起建议或自动修改。
Draft 工作区：用户手动编辑、看 diff、撤销、导出。
```

## 3. 这些能力放在哪一层做

### `@readany/core`

放真正的业务能力：

- 数据查询
- RAG
- EPUB 解析
- draft 规则
- 导出规则
- 审计结构

### `@readany/cli`

放命令入口和协议层：

- 参数解析
- profile 解析
- tool registry
- MCP server
- 命令输出格式
- 安装器
- skill 管理
- 审计写入

### 桌面客户端

只做图形化管理，不直接造新能力：

- 调 CLI
- 展示状态
- 复制 MCP 配置
- 处理用户确认

### Skill

只做说明书和调用模板，不存业务数据。

## 4. 推荐实现顺序

### M1

先把外部 AI 的只读入口做稳：

- CLI package
- doctor
- install / uninstall
- skill 管理
- books / notes / highlights / bookmarks / skills 查询
- BM25 RAG 检索
- indexed chapters
- EPUB inspect / draft create / draft chapter read
- readonly MCP
- 审计日志最小闭环

### M2

再补内容理解能力：

- 原始 EPUB fallback 章节目录和正文
- PDF 页级或章节级读取
- 当前书 / 当前章 / 选区上下文资源
- vector / hybrid RAG
- 引用回跳到 book / chapter / chunk / page / cfi

### M3

再做精排编辑：

- epub inspect
- draft create
- chapter patch
- metadata patch
- history read
- diff read
- toc rebuild
- diff / history / undo
- AI 建议：封面、元数据、目录、章节结构、全书修复计划
- 用户 draft 编辑入口

### M4

再做导出和客户端整合：

- validate
- export
- 设置页完整管理入口
- profile 切换
- 审计日志浏览
- 外部 agent smoke 验收

### M5

最后做完整闭环：

- 读
- 搜
- 整理
- 精排
- 导出
- 审计

## 5. 怎么实现

### 实现原则

- 先有 core，再有 CLI。
- 先有真实能力，再进 registry。
- 先有测试，再放到 `tools/list`。
- 默认只读。
- 写操作必须落到 draft。
- 未实现工具绝不提前注册。
- 所有大正文读取必须有 limit、cursor、chunk range 或等价限制。
- 所有写入能力必须记录 operation history。
- 所有导出能力默认生成新文件，不覆盖原文件。

### 命令实现方式

每个命令都走同一条链路：

```text
CLI 参数 -> 命令分发 -> data / service 层 -> core -> 结构化结果
```

新增命令最少要定义：

- 命令名和参数。
- JSON 输出结构。
- text 输出摘要。
- profile / scope。
- 错误码。
- 审计日志字段。
- 对应 MCP tool，或者明确说明为什么只提供 CLI。

### MCP 实现方式

MCP 只做三件事：

- 返回工具列表
- 校验 profile
- 调用已经真实实现的能力

MCP 的 `tools/list` 是对外承诺，不能把规划中的工具先放进去。每个 tool 的 `inputSchema` 必须在运行时生效：必填字段、类型、范围、枚举和 `additionalProperties: false` 都要有测试。

### Skill 实现方式

Skill 只负责告诉外部 AI：

- 读什么
- 怎么读
- 能做什么
- 不能做什么
- 该怎么调用 MCP 或 CLI

### 客户端实现方式

设置页不要复制业务逻辑，只调用 CLI：

- `readany doctor --json`
- `readany skill install`
- `readany skill uninstall`
- `readany mcp serve --profile readonly`

精排编辑页也不要绕过 draft 规则。用户手动编辑时，客户端应调用同一套 draft service，把修改写成 operation history，而不是直接改 EPUB 文件。

## 6. 怎么测试

### 单元测试

测这些：

- 命令解析
- profile 解析
- path 解析
- tool registry
- skill 安装
- MCP 权限拒绝
- EPUB inspect / draft / chapter 操作的 hash 和 history
- JSON schema 运行时拒绝非法参数

### 集成测试

测这些：

- CLI 是否能读临时库
- MCP 是否能列出真实工具
- MCP 是否只返回已实现工具
- readonly profile 是否会拒绝写操作
- editor profile 是否只能写 draft
- 原始 EPUB hash 是否保持不变
- MCP stdio 是否只输出 JSON-RPC 行

### E2E 测试

测这些：

- 安装
- 卸载
- doctor
- skill 管理
- MCP 启动
- 只读查询
- 创建 draft
- patch draft
- validate draft
- export 新 EPUB

### 手工验收

测这些：

- 桌面端设置页
- 桌面端 draft 工作区
- 外部 AI 客户端接入
- Mac / Windows / Linux 的基本行为

## 7. 怎么验收

每个功能进入“已完成”前，必须满足：

```text
[ ] core 或领域服务有真实实现
[ ] CLI 命令能跑通
[ ] JSON 输出稳定
[ ] text 输出可读
[ ] MCP tool 已注册，或明确不需要 MCP
[ ] profile / scope 正确
[ ] readonly 拒绝写入
[ ] 测试使用临时 READANY_HOME / AGENT_HOME
[ ] 文档和 tools/list 一致
[ ] 审计日志不记录完整大正文和敏感参数
```

写入类功能还要满足：

```text
[ ] 写入 draft 或受控对象
[ ] 原始文件 hash 不变
[ ] history 有 operation 记录
[ ] 失败不会留下半写状态
[ ] 返回 diff、summary 或可追踪的 operationId
```

导出类功能还要满足：

```text
[ ] 导出前 validate
[ ] 默认不覆盖原文件
[ ] 导出路径受控或由用户明确授权
[ ] 导出产物能被 ReadAny 重新导入或至少能被 EPUB 工具打开
[ ] publisher profile 或确认机制生效
```

阶段完成标准：

```text
M1：外部 AI 能发现 ReadAny 并做只读查询；未实现工具不出现在 tools/list。
M2：未索引书籍也能被读取，RAG 能返回可靠引用。
M3：AI 和用户都能在 draft 上编辑 EPUB，原书不变。
M4：draft 能 validate 并导出新 EPUB，桌面设置页能完成接入管理。
M5：普通用户能通过桌面端完成接入，高级用户能通过 CLI/MCP 跑完整闭环。
```

### 测试硬要求

- 必须使用临时 `READANY_HOME`
- 必须使用临时 `AGENT_HOME`
- 不能读写开发者真实书库
- 不能把规划中的工具写进 `tools/list`

## 7. 怎么验收

### M1 验收

满足下面这些就算 M1 通过：

- `readany --version`
- `readany doctor --json`
- `readany skill status --json`
- `readany tools list --json`
- `readany books list --json`
- `readany books search "keyword" --json`
- `readany notes search "keyword" --json`
- `readany highlights search "keyword" --json`
- `readany rag search "keyword" --book <book-id> --json`
- `readany mcp serve --profile readonly`
- `tools/list` 只返回真实实现的工具

### M2 验收

- `readany chapters list <book-id> --json`
- `readany chapter get <book-id> <chapter-id> --chunk-start 1 --chunk-count 20 --json`
- `readany rag search "keyword" --book <book-id> --json`

### M3 验收

- `readany epub draft create <book-id> --profile editor --json`
- `readany epub chapter read <draft-id> <chapter-id> --profile editor --json`
- `readany epub chapter patch ... --json`
- `readany epub metadata patch ... --json`
- `readany epub history <draft-id> --profile editor --json`
- `readany epub diff <draft-id> --profile editor --json`
- `readany epub undo <draft-id> <operation-id> --profile editor --json`
- `readany epub toc rebuild ... --json`
- AI 能修本章，也能修全书
- 用户能查看 operation history、source/draft EPUB entry diff，并撤销可回滚的 patch
- 原始 EPUB hash 不变

### M4 验收

- `readany epub validate <draft-id> --json`
- `readany epub export <draft-id> --output <path> --json`
- 桌面端设置页能完整管理 CLI / Skill / MCP

### 完整验收

只有当下面这条闭环跑通，才能说 ReadAny CLI 完整可用：

```text
找书 -> 读内容 -> 读笔记/高亮 -> 检索知识 -> 创建 draft -> 修改 -> 校验 -> 导出 -> 审计
```

## 8. 到什么程度为止

### 现在能对外说什么

- ReadAny 已经有独立 CLI。
- ReadAny 已经有 readonly MCP。
- ReadAny 已经能让外部 AI 读书库、笔记、高亮和已索引 chunks。
- ReadAny 已经能让外部 AI 在 editor profile 下读取 draft operation history。
- ReadAny 已经能让外部 AI 在 editor profile 下查看 source/draft EPUB entry diff。
- ReadAny 已经能让外部 AI 在 publisher profile 下 validate 并 export active draft 为新 EPUB。
- ReadAny 已经有桌面端外部 AI 访问入口。

### 现在不能对外说什么

- 不能说已经支持 undo 的完整精排闭环。
- 不能说当前书、当前章、选区上下文资源已经完整开放。
- 不能说 MCP 已经暴露全部计划中的工具。

### 完成标准

只有同时满足下面这些，才算这条线完成：

- 文档、代码、测试口径一致
- `tools/list` 只展示真实工具
- 默认只读
- 写操作都在 draft 上
- 测试全隔离
- 桌面端可管理
- 外部 AI 可安全接入

具体到每个工具的 Definition of Done，以 [09-delivery-acceptance-contract.md](09-delivery-acceptance-contract.md) 为准。
