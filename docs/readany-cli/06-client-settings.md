# ReadAny CLI Client Settings

## 入口位置

桌面客户端新增：

```text
设置 -> 外部 AI 访问
```

移动端不作为主入口。移动端后续可以查看状态或确认高风险操作，但不负责安装 CLI、启动 MCP、安装 skill。

## 页面职责

设置页负责图形化管理：

- CLI 安装状态。
- Skill 安装状态。
- MCP 可用状态。
- 当前权限 profile。
- 最近 doctor 结果。
- 最近 agent 操作记录。

设置页只负责接入和权限管理，不承担正文编辑。用户精排入口放在书籍详情页或 draft 工作区。

设置页不直接实现底层安装逻辑，而是调用 CLI 自身能力：

```bash
readany install
readany uninstall
readany agent setup --user --client codex --profile readonly --json
readany agent uninstall --user --json
readany doctor --json
readany skill install
readany skill uninstall
readany skill status --json
```

设置页是客户端功能，不做在移动端第一版。移动端后续可以做查看、确认、撤销，但不负责安装 CLI 或注册外部 agent。

## 状态卡片

建议分成四块：

### 1. ReadAny CLI

状态：

- 未安装。
- 已安装。
- 版本不匹配。
- PATH 不可用。
- 需要修复。

操作：

- 安装。
- 卸载。
- 修复。
- 诊断。
- 复制给外部 AI 的一键安装命令。
- 复制诊断证据快照。

### 2. External AI Skill

状态：

- 未安装。
- 已安装。
- 需要更新。

操作：

- 安装到通用 agent 目录。
- 卸载。
- 更新。
- 打开所在目录。

### 3. MCP Access

状态：

- 未启用。
- readonly 可用。
- profile 已配置。

操作：

- 复制 MCP 配置。
- 复制外部 AI bootstrap 命令。
- 测试连接。
- 切换 profile。

给外部 AI 的推荐命令由 CLI 自己执行和返回，设置页不要手拼多步流程：

```bash
readany agent setup --user --client codex --profile readonly --json
```

返回值包含 `install`、`skill`、`mcp.snippet`、`nextSteps`。设置页可以把整条命令复制给用户，也可以在高级区域展示 JSON 结果；外部客户端配置仍必须由用户或外部 agent 显式写入，不做静默注册。

复制配置时给外部 agent 的最小片段可由 CLI 生成：

```bash
readany mcp config --profile readonly --client generic --json
```

输出中的核心配置为：

```json
{
  "mcpServers": {
    "readany": {
      "command": "readany",
      "args": ["mcp", "serve", "--profile", "readonly"]
    }
  }
}
```

设置页需要提供目标客户端选择，第一批固定为：

- `generic`：通用 JSON `mcpServers` 片段。
- `claude`：Claude Desktop / Claude Code 可用的 JSON `mcpServers` 片段；`agent setup` 还会把 ReadAny skill 链接到 `~/.claude/skills/readany`。
- `cursor`：Cursor 可用的 JSON `mcpServers` 片段；`agent setup` 还会把 ReadAny skill 链接到 `~/.cursor/skills/readany`。
- `codex`：Codex `config.toml` 可粘贴的 `[mcp_servers.readany]` 片段；`agent setup` 还会把 ReadAny skill 链接到 `~/.codex/skills/readany`。
- `opencode`：OpenCode `opencode.json` 可粘贴的 JSON `mcp.readany` 片段；`agent setup` 还会把 ReadAny skill 链接到 `~/.config/opencode/skills/readany`。
- `all`：只用于 Agent bootstrap，一次性安装所有已知客户端 skill 链接，并额外写入 `~/.agents/skills/readany` 兼容目录；MCP 配置仍然按具体客户端复制。

默认提供 readonly 配置。更高 profile 需要用户在设置页明确开启，并在复制配置前确认风险。

### 4. Activity Log

展示最近：

- Agent 调用。
- 写入 draft。
- 导出。
- 失败。
- 权限拒绝。

## 用户编辑入口

用户要做章节编辑、元数据编辑、目录调整、diff 查看和撤销，不应该从 `设置 -> 外部 AI 访问` 进入，而应该从书籍详情页进入 `创建精排草稿`，再进入 draft 工作区。

draft 工作区至少要提供：

- 章节编辑。
- 元数据编辑。
- AI 修改建议。
- diff 和 history。
- validate。
- export。

用户保存的所有修改都必须落在 draft history 里，不能直接修改源 EPUB。

## 权限文案

设置页必须清楚区分：

```text
安装 CLI 不等于授权外部 AI。
安装 Skill 不等于开放写权限。
开启 MCP readonly 只允许读取和搜索。
写入、导出、同步需要更高 profile。
```

## 第一阶段客户端验收

第一阶段设置页只需要：

- 能检测 CLI。已落地：通过受限 Tauri command 调用 allowlist 中的 ReadAny CLI 动作。
- 能安装 / 更新 / 卸载 skill。已落地：设置页调用 `readany skill install/update/uninstall/status --json`。
- 能展示 MCP 启动命令。已落地：默认 readonly，editor / publisher 需要用户显式确认后才可复制配置。
- 能复制 MCP 配置。已落地：设置页通过受限 `mcp_config` action 调用 `readany mcp config --profile <profile> --client <generic|claude|cursor|codex|opencode> --json`，前端不拼任意 CLI args。
- 能跑 `doctor --json` 并展示结果。已落地。

第一阶段不需要：

- 常驻 daemon。
- 后台自动启动 MCP。
- 移动端管理页。
- 高风险操作远程确认。

当前限制：

- 桌面设置页当前通过受限 Tauri command 调用 ReadAny CLI allowlist 动作。
- `version`、`doctor`、`mcp_config`、`tools_list`、`skill_status`、`skill_install`、`skill_update`、`skill_uninstall`、`install`、`uninstall` 会优先使用桌面安装包资源中的 `readany-cli/bin/readany.js`，开发环境中会回退到 monorepo 的 `packages/cli/dist/bin/readany.js`，最后才回退到 PATH 中的 `readany`。这样用户即使还没安装全局 `readany`，也能在设置页完成诊断、安装 CLI、管理 Skill 和复制 MCP 配置。
- 书库读取、审计读取、EPUB draft/edit/export 等数据动作仍通过 PATH 中已安装的 `readany` 执行，用于验证外部 agent 能访问的同一条 CLI 路径。
- Tauri `beforeBuildCommand` 会先执行 `pnpm --filter @readany/cli build` 再构建 app，避免桌面包资源中缺少或落后于源码的 CLI dist；Rust preflight 测试会校验这个前置命令和资源映射。
- 当前 CLI 是 Node bundle。管理命令已经拆成不加载 `better-sqlite3` 的路径，因此安装、卸载、Skill 管理和基础诊断不需要 SQLite 原生模块；`doctor --json` 会报告 Node runtime、`better-sqlite3` 可解析性和 distribution（built bundle / desktop resource bundle / native binary 标记）。书库读取、MCP 查询等数据能力仍依赖 Node 和 `better-sqlite3` 运行时。后续应把 CLI 打成真正独立的本地 binary，或把运行时依赖完整放进桌面包。
- 设置页默认提供 readonly MCP 配置；editor / publisher profile 需要用户显式选择并确认风险后才可复制。
- 设置页已接入最近审计日志浏览，只显示 CLI/MCP 调用元数据，不显示工具参数、正文、密钥或同步凭证；支持 source / failed / action prefix / date / limit 受限筛选和失败错误码摘要。

## UI 验收细节

设置页必须让用户看懂四件事：

1. CLI 是否安装，版本是否匹配。
2. Skill 是否安装到通用 agent 目录。
3. MCP readonly 如何被外部 agent 调用。
4. 当前 profile 能做什么、不能做什么。

按钮行为：

- 安装 CLI：调用随包 CLI 的 `install`。
- 卸载 CLI：调用 `readany uninstall`。
- 修复 CLI：先跑 `doctor --json`，再根据失败项执行 install 或 path 修复。
- 安装 Skill：调用 `readany skill install`。
- 更新 Skill：调用 `readany skill update`。
- 卸载 Skill：调用 `readany skill uninstall`。
- 测试 MCP：启动一次 `readany mcp serve --profile readonly` 并发送 `initialize` / `tools/list` smoke。

失败态必须展示：

- 命令。
- 错误码。
- 简短错误说明。
- 建议动作。

## 做到什么程度为止

客户端 M1 做到：

- 用户能在桌面客户端安装 CLI。
- 用户能安装、更新或卸载 Skill。
- 用户能复制 readonly MCP 配置。
- 用户能看到 doctor 检查项。
- 用户知道 readonly 不允许写入和导出。

当前代码已经完成 Skill 安装/更新/卸载、MCP 配置复制、doctor 展示和 readonly 边界说明。CLI 安装按钮和 MCP 配置复制都已接入受限 action，并已配置桌面包资源路径；书籍详情页可创建 EPUB draft 并打开 draft 工作区，工作区通过受限 action 查看 history、entry-level diff 和 validate 结果，也可执行章节 XHTML 读取/保存、元数据编辑、toc rebuild、undo、discard 和 export。完整验收还需要在实际打包产物中确认 Node / native module 运行时是否随包可用，并补齐真实样本端到端记录。

客户端 M4 做到：

- 用户能切换 profile。
- 用户能查看最近 agent 调用日志。
- 用户能确认高风险导出。
- 用户能打开 draft、查看 diff、批准导出。
