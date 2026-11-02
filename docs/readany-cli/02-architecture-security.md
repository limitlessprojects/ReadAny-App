# ReadAny CLI Architecture and Security

## 总体结构

建议把外部 AI 访问拆成四层：

```text
core        -> 领域能力
cli         -> 命令行入口
mcp server  -> 外部 AI 访问入口
skill       -> 外部 AI 的使用说明与调用模板
```

实际调用链：

```text
External AI
  -> MCP client
  -> readany mcp serve
  -> packages/cli tool registry
  -> packages/cli command/data adapter
  -> packages/core domain/query layer
  -> ReadAny local database and managed files
```

CLI 命令行调用链：

```text
Human / script
  -> readany <command>
  -> packages/cli command runner
  -> packages/core
```

## 代码组织建议

```text
packages/core
packages/cli
packages/app
packages/app-expo
```

其中：

- `packages/core` 放共享业务能力。
- `packages/cli` 放 `readany` 命令行入口。
- `packages/app` 提供图形设置页和本地管理入口。
- `packages/app-expo` 只做轻量查看或确认，不承担 CLI 安装职责。

`packages/cli` 应该是 monorepo 内的一等 package，有自己的 `package.json`、测试、构建和 `bin` 字段。桌面客户端可以随包携带 CLI，也可以调用同一份构建产物完成安装和卸载。

## CLI 角色

CLI 是人类、脚本和 agent 的统一入口，承担：

- 安装和卸载自身。
- 启动本地 MCP server。
- 诊断本地环境。
- 导入、搜索、读取、导出。
- 创建 draft、应用 patch、执行导出。
- 安装和卸载 skill 到通用 agent 目录。

CLI 不应该直接实现业务逻辑。业务逻辑优先沉到 `@readany/core`，CLI 只做：

- 参数解析。
- 权限检查。
- 平台路径解析。
- 调用 core 能力。
- 输出结构化结果。
- 记录审计日志。

当前实现里，Node 平台适配放在：

```text
packages/cli/src/platform/node-platform.ts
```

它负责在 Node 环境里复用 `@readany/core` 的数据库和查询层。后续新能力优先进入 core，再由 CLI 适配调用；不要把 EPUB 解析、RAG、draft 规则直接堆在命令解析文件里。

## Skill 角色

Skill 不存数据，不持密钥，只描述“如何使用 ReadAny”。

Skill 的职责：

- 告诉 agent 可用能力。
- 告诉 agent 约束。
- 告诉 agent 如何调用 `readany mcp serve` 或 CLI 子命令。

Skill 的存放位置应该是通用 agent home，不属于 ReadAny 私有目录。

建议默认位置：

```text
~/.agent/skills/readany/SKILL.md
```

如果用户设置了 `AGENT_HOME`，优先使用：

```text
$AGENT_HOME/skills/readany/SKILL.md
```

ReadAny 只管理自己安装的 skill，不扫描或修改其他 skill。

为了让具体客户端能自动发现，`agent setup --client codex|claude|cursor|opencode` 会把 canonical skill 链接到已知用户 skill 目录；`agent setup --client all` 还会创建 `~/.agents/skills/readany` 兼容链接。未知客户端仍通过 MCP 配置接入。

## MCP 角色

MCP 是面向外部 AI 的主接口。

它应该：

- 暴露资源和工具。
- 支持只读和可写 profile。
- 支持分页和限流。
- 支持审计日志。

MCP server 默认使用 stdio，便于 Codex、Claude Desktop / Claude Code、Cursor、OpenCode 等本地 agent 启动：

```bash
readany mcp serve --profile readonly
```

第一阶段 MCP 使用 stdio JSON-RPC：

- `initialize`
- `tools/list`
- `tools/call`

返回内容封装为 ReadAny 标准 `CommandResult` JSON，便于外部 agent 做可靠解析。

如果未来需要常驻后台服务，再增加：

```bash
readany daemon start
readany daemon stop
```

## 安全模型

### 默认规则

- 只读优先。
- 不暴露任意 SQL。
- 不暴露任意 shell。
- 不暴露任意文件系统根。
- 只允许 workspace 范围访问。
- 不在默认输出里暴露本地绝对路径。
- 不在 MCP 工具列表中暴露未实现能力。

### 写入规则

写操作必须落到 draft 或受控对象上：

- 先生成 plan。
- 再应用到 draft。
- 最后用户确认导出或提交。

写入链路必须满足：

- 输入经过 schema 校验。
- profile 拥有所需 scope。
- 写入目标是 draft、note、knowledge document 等受控对象。
- 高风险动作进入确认队列，不由外部 AI 静默执行。
- 记录审计日志。

### 参数校验规则

MCP tool 的 input schema 不只是展示用元数据，调用入口必须实际校验：

- `required`
- `additionalProperties: false`
- `string.minLength`
- `number.minimum`
- `number.maximum`
- `enum`

当前实现只接受 tool registry 中已经声明的参数，不接受多余字段，也不接受超出 schema 边界的值。

### 权限分层

建议至少分成：

- `read`
- `analyze`
- `draft`
- `export`
- `admin`

更细的 scope 建议：

```text
book.read
book.import
book.metadata.write
content.read
note.read
note.write
knowledge.read
knowledge.write
rag.search
epub.inspect
epub.draft
epub.export
stats.read
sync.status
sync.run
admin.backup
```

### 高风险操作

以下动作必须确认：

- 删除书籍。
- 覆盖原文件。
- 批量修改书库。
- 修改同步配置。
- 读凭证。
- 导出到用户授权目录之外。
- 执行批量 draft patch。

## 运行模式

建议支持：

```text
readonly
assistant
editor
publisher
admin
```

Profile 到 scope 的映射：

```text
readonly:
  book.read, content.read, note.read, knowledge.read, rag.search, stats.read

assistant:
  readonly + note.write, knowledge.write

editor:
  assistant + epub.inspect, epub.draft, book.metadata.write

publisher:
  editor + epub.export

admin:
  publisher + book.import, sync.status, sync.run, admin.backup
```

默认 profile 必须是 `readonly`。

## 本地状态

CLI 需要能识别：

- 书库根目录。
- 当前配置档案。
- 当前 MCP 监听地址。
- skill 安装状态。
- 审计日志位置。

环境变量约定：

```text
READANY_HOME  ReadAny 本地数据根目录，测试和外部启动时可显式传入。
AGENT_HOME    通用 agent home，用于安装 ~/.agent 风格的 skill。
```

测试必须显式传 `READANY_HOME` / `AGENT_HOME`，避免读写开发者真实书库。

## 审计日志

写操作、导出操作、同步操作必须记录：

- 时间。
- 调用来源。
- profile。
- tool name。
- 输入摘要。
- 输出摘要。
- 影响对象。
- 成功或失败。

日志不应该记录完整正文、API key、同步密码等敏感数据。

## 工具注册规则

每个 MCP tool 都必须先进入 tool registry，并声明：

- tool name。
- description。
- scopes。
- risk。
- input schema。
- output shape。
- 是否已真实接线。

`tools/list` 只能返回真实可调用的工具。规划中的工具可以写入文档，但不能注册到 MCP。

## 错误模型

CLI 和 MCP 都使用统一结果结构：

```ts
type CommandResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; details?: unknown } };
```

错误必须可机器读取。常见错误码：

```text
missing_query
missing_book_id
unknown_tool
permission_denied
not_implemented
invalid_profile
workspace_out_of_bounds
confirmation_required
```
