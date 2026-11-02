# ReadAny CLI Testing and Acceptance

## 测试目标

这套测试不是只看“命令能跑”，而是看：

- 权限边界是否正确。
- 外部 AI 是否只能看到它该看到的内容。
- 写操作是否都落在 draft 上。
- 安装和卸载是否可逆。
- 导出结果是否可复用。
- MCP 工具列表是否只暴露真实能力。
- 测试是否完全隔离开发者真实书库。

## 测试层级

### 1. 单元测试

覆盖：

- 命令解析。
- profile 解析。
- path 解析。
- skill 安装路径。
- 工具 schema 校验。
- draft 操作记录。

建议文件：

```text
packages/cli/src/commands.test.ts
packages/cli/src/profiles.test.ts
packages/cli/src/install.test.ts
packages/cli/src/skill.test.ts
packages/cli/src/tool-registry.test.ts
packages/cli/src/mcp.test.ts
```

### 2. 集成测试

覆盖：

- CLI 调 core 能力。
- MCP server 能启动并响应。
- 只读 profile 不能执行写操作。
- editor profile 可以写 draft，但不能碰原文件。

集成测试必须使用临时 ReadAny 数据目录，不允许读写开发者真实书库。

当前集成重点：

- 使用临时 SQLite 数据库 seed 书籍、笔记、高亮。
- 通过 CLI 命令读出数据。
- 通过 MCP `tools/call` 读出同一批数据。
- 校验 MCP `tools/list` 不包含未实现工具。

### 3. E2E 测试

覆盖：

- 安装。
- 卸载。
- doctor。
- mcp serve。
- 读书库。
- 搜索。
- 创建草稿。
- 导出。

建议增加 fixture：

```text
packages/cli/fixtures/library/
packages/cli/fixtures/books/sample.epub
packages/cli/fixtures/books/sample.pdf
```

### 4. 手工验证

覆盖：

- macOS。
- Windows。
- Linux。
- 一个外部 agent。
- 一个本地图形客户端。

外部 agent 第一阶段至少验证一个，优先 Codex 或 Claude Desktop。

## 推荐测试矩阵

```text
平台     安装   卸载   doctor   MCP   只读   skill   写草稿   导出
macOS    ✓      ✓      ✓        ✓     ✓      ✓       M3       M4
Windows  ✓      ✓      ✓        ✓     ✓      ✓       M3       M4
Linux    ✓      ✓      ✓        ✓     ✓      ✓       M3       M4
```

## 验收标准

### CLI 安装

- `readany install` 成功。
- `readany uninstall` 可逆。
- `readany doctor` 能定位问题。
- 客户端设置页能显示 CLI 已安装。
- 客户端设置页能触发修复。

### 外部 AI 访问

- 能列书、搜书、读内容。
- 能读笔记、读高亮、读知识文档。
- 能创建 draft。
- 能导出新文件。
- MCP tool list 中能看到 ReadAny 工具说明。
- Skill 中能指导 agent 正确调用 ReadAny。

### 安全边界

- 默认只读。
- 不允许任意 shell。
- 不允许任意 SQL。
- 不允许越过 workspace。
- 不允许直接覆盖原始 EPUB。
- `readonly` profile 调写工具必须失败。
- 未授权 export profile 时不能导出文件。

### 可观察性

- 每次写操作都有日志。
- 每次导出都有记录。
- 每次失败都有明确错误信息。
- `readany doctor --json` 能输出 machine-readable 诊断结果。

## 必须通过的命令

每次提交前：

```bash
pnpm --filter @readany/cli check
pnpm --filter @readany/cli test
pnpm --filter @readany/cli build
pnpm --filter @readany/cli smoke:agent
```

同时需要检查：

- `git diff --check` 不报空白错误。
- 测试中显式传入临时 `READANY_HOME` / `AGENT_HOME`。
- `readany tools list --json` 和 MCP `tools/list` 没有出现规划中但未实现的工具。
- 新增命令必须有 text 和 JSON 输出的基础覆盖。
- 新增 MCP tool 必须有 schema、权限拒绝、成功调用三类测试。
- MCP stdio 入口必须通过构建后 CLI smoke：`dist/bin/readany.js mcp serve --profile readonly` 能响应 `initialize`、`tools/list`、`tools/call`。
- 外部 agent 自动 smoke 必须通过：`pnpm --filter @readany/cli smoke:agent` 会使用 built CLI 验证 generic / Claude / Cursor / Codex MCP 配置片段可复制且不混入元数据，并通过 stdio MCP 验证 readonly 发现/搜索、MCP tools/list 安全元数据、PDF fallback 章节读取、readonly 写入拒绝、editor draft 批量章节修改和 toc rebuild、publisher validate/export、audit、源 EPUB hash 不变，以及导出 EPUB 重新入库后的 inspect / chapter read。该 smoke 使用 fixture 数据，只能作为 M5 真实外部 agent 验收的前置证据。
- 如果要开始一轮新的真实 M5 采证，建议先运行 `pnpm --filter @readany/cli acceptance:init -- --workspace <dir>`；它会创建 `record.md`、`evidence/`、`bundle/`、`exports/` 和 `logs/`，把文档里反复引用的 acceptance workspace 先搭好，减少手工建目录和填路径。
- `acceptance:init` 可以额外传 `--milestone <name>`、`--reviewer <name>`、`--release <label>` 和 `--desktop-package <source>`；这些值会写进 `workspace.json` 的 defaults，后续 workspace-driven scaffold/finalize/bundle/assemble 会自动继承，除非命令行显式覆盖。
- 当 `workspace.json` 已经带默认 `reviewer` / `release` 时，`acceptance:finalize` 和 `acceptance:assemble` 的 workspace 命令块可以直接省略这两个参数；只有需要覆盖默认值时才继续显式传参。
- `TBD`、空串或缺失字段不会被当成有效默认值；这种 workspace 仍会在 scaffold/status 的收口命令里提示 `--reviewer <name>` 和 `--release <label>`，避免用占位符生成最终 manifest。
- 真实样本验收可以使用 `pnpm --filter @readany/cli acceptance:real -- --book <book-id> --rag-query <query> --evidence <file>` 采证；如果已经先跑了 `acceptance:init`，也可以直接传 `--workspace <dir>`，它会自动写入 `workspace.json` 的 `real-sample.json`。该脚本默认只读，会在 stdout 输出脱敏摘要，并在 evidence JSON 中记录 `doctor --json` 诊断、样本书文件路径、字节数、SHA-256、可回跳 citation targets 和仍需人工验收的 M5 清单，清单项会附带建议补充的 `evidence` 和 `commands`；只有显式 `--draft-export --export-dir <dir>` 才会创建 EPUB draft、validate、export、inspect 导出 EPUB，并默认 discard draft 清理验收工作区，不替代样本来源说明、真实外部 agent 和打包产物验收。
- 真实外部 agent 验收可以使用 `pnpm --filter @readany/cli acceptance:agent -- --client <Codex|Claude Desktop|Cursor> --client-version <version> --profile <profiles> --read-flow "<summary>" --readonly-denial "<summary>" --draft-export-flow "<summary>" --audit-summary "<summary>" --evidence <file>` 采证；也可以传 `--workspace <dir>`，让它按客户端名自动写到 `agent-codex.json` 或 `agent-second-client.json`。使用 MCP 的客户端必须额外传 `--uses-mcp`、脱敏后的 `--mcp-config` 或 `--mcp-config-text`、`--tools-list-summary` 或 `--tools-list`、以及 `--tool-count`。该脚本只结构化记录人工验收事实，并拦截明显未脱敏密钥；每个 evidence 只代表一个真实客户端，最终 M5 仍必须至少有两条完整外部 agent 表格行，其中一条使用 MCP。
- 桌面设置页验收可以先在 `设置 -> 外部 AI 访问` 点击“复制证据”，保存为本地 JSON，再使用 `pnpm --filter @readany/cli acceptance:desktop -- --snapshot <snapshot.json> --screenshot <screenshot-or-recording> --evidence <file>` 采证；如果已经有 acceptance workspace，也可以传 `--workspace <dir>`，自动写入 `desktop-settings.json`。该脚本校验 CLI 可用、doctor distribution、Skill status、MCP config、tools list、audit list 和 last action 摘要，并拦截明显未脱敏密钥。该 evidence 只关闭桌面设置页人工项，不替代真实外部 agent、真实样本或打包矩阵。
- 单平台打包验收可以使用 `pnpm --filter @readany/cli acceptance:packaged -- --package-source <artifact> --evidence <file>` 采证；如果已经有 acceptance workspace，也可以传 `--workspace <dir>`，它会按 `--platform` 自动写入 `packaged-macos.json`、`packaged-windows.json` 或 `packaged-linux.json`。该脚本默认只读，记录 version、doctor runtime/distribution、tools list、MCP config、readonly MCP initialize/tools/list 和 skill status。只有显式 `--repair-bin-dir <tmp-bin>` 才会把包内 CLI 的 `repair` 作为安装修复证据写入临时 bin 目录；只有显式 `--with-skill-install` 才会写入 agent skill，建议配临时 `--agent-home`；只有显式 `--draft-export --book <epub-book-id> --export-dir <dir>` 才会创建 draft、validate、export、检查导出 EPUB 结构并清理 draft。该 evidence 只能补 macOS / Windows / Linux 矩阵中的单平台记录，不能替代真实样本、真实外部 agent 或最终 strict M5。
- 真实样本 evidence 可以先用 `pnpm --filter @readany/cli acceptance:scaffold -- --evidence <evidence.json> --output <record.md>` 生成 partial 验收草稿；草稿会自动带上 SHA、citation、doctor distribution 和 manual closure 待办。也可以重复传 `--agent-evidence <agent-evidence.json>`、`--desktop-evidence <desktop-evidence.json>` 和 `--packaged-evidence <platform-evidence.json>`，把真实外部客户端、桌面设置页和单平台 packaged 证据预填进对应表格。缺失外部客户端、draft export、真实安装器验收和跨平台完整矩阵仍要人工补齐，最终仍必须通过 strict 校验。
- 如果在补证过程中想先知道“离 strict M5 还差什么”，可以运行 `pnpm --filter @readany/cli acceptance:status -- --record <record.md> --evidence <evidence.json> ...`；它会汇总当前已收集的 evidence 类型、客户端和平台覆盖情况，指出缺失项，并给出下一步建议命令，适合作为 M5 收口前的 readiness 检查。
- 如果已经在使用 acceptance workspace，优先运行 `pnpm --filter @readany/cli acceptance:status -- --workspace <dir>`；它给出的 next steps 会继续沿用同一个 workspace，而不是退回到手工填写一组 `--evidence docs/...` 路径。
- 验收记录、真实样本 evidence、单客户端外部 agent evidence、桌面设置页 evidence 和单平台 packaged evidence 可以使用 `pnpm --filter @readany/cli acceptance:validate -- --record <record.md> --evidence <evidence.json>` 校验结构，`--evidence` 可重复传入多份证据；最终 M5 记录必须加 `--strict-m5` 并传入完整组合证据，用机器闸门阻止“部分通过”、仍有未勾选范围、外部 agent 表格不足两条不同客户端完整记录、缺少 MCP-backed agent、打包矩阵缺平台记录、缺少桌面设置页证据、manual acceptance 未逐项关闭，或验收记录没有引用真实 evidence 锚点的验收被当作完成。packaged 平台会把 `darwin` / `macOS` / `win32` / `Windows` / `linux` 归一后判断。agent / desktop / packaged evidence 是补充证据，strict M5 的 SHA / citation 锚点检查仍需要真实样本 evidence。
- 最终归档必须在 strict M5 通过后使用 `pnpm --filter @readany/cli acceptance:finalize -- --record <record.md> --evidence <evidence.json> ... --output <manifest.json>` 生成 manifest。该脚本不会绕过校验：如果组合证据不完整或 record 未通过 strict M5，manifest 不会写出；通过后会记录 record/evidence SHA-256、git commit、验证结果和证据类型摘要。
- 最终交付建议再执行 `pnpm --filter @readany/cli acceptance:bundle -- --record <record.md> --manifest <manifest.json> --evidence <evidence.json> ... --output-dir <bundle-dir>`，把 record、manifest 和全部 evidence 整理到一个 bundle 目录，便于归档、交接和后续 CI 上传。
- 如果要在交接或上传后复验 bundle，可执行 `pnpm --filter @readany/cli acceptance:verify-bundle -- --bundle-dir <bundle-dir>`；它会独立检查 `index.json`、record、manifest 和 evidence 的 path/SHA-256/bytes 是否一致，并重跑 strict M5；如果 bundle manifest 记录了复验元数据，也会一并核对。
- 如果已经拿到完整 evidence，也可以直接执行 `pnpm --filter @readany/cli acceptance:assemble -- --record <record.md> --evidence <evidence.json> ... --output-dir <bundle-dir>`；它会串联 strict M5 校验、manifest 生成、bundle 导出和 bundle 复验。失败时不会留下“看起来像已归档”的假阳性结果；成功后 bundle 目录里同时保留 `final-manifest.json` 和对外交付用的 `manifest.json`，而且 final manifest 记录了复验结果。
- 发布前本地 preflight 必须通过：`pnpm cli:preflight` 会顺序执行 CLI check/test/build、built CLI external agent smoke、Tauri CLI bridge tests 和 `cargo check`；触碰桌面前端或 release matrix 时使用 `pnpm cli:preflight:full` 额外覆盖 `pnpm --filter app build`。

如果本次改动触碰桌面客户端或 Tauri bridge，还必须执行：

```bash
cargo test readany_cli --lib
cargo check
pnpm --filter app build
```

如果本次改动触碰 Tauri 打包资源、CLI bundle 结构、安装器或客户端设置页，还必须执行：

```bash
pnpm --filter @readany/cli build
pnpm --filter app tauri info
```

M1 验收：

```bash
readany --version
readany doctor --json
readany skill status --json
readany tools list --json
readany books list --json
readany books search "keyword" --json
readany notes search "keyword" --json
readany highlights search "keyword" --json
```

MCP smoke：

```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n' | readany mcp serve --profile readonly
printf '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}\n' | readany mcp serve --profile readonly
```

M2 验收：

```bash
readany chapters list <book-id> --json
readany chapter get <book-id> <chapter-id> --json
readany rag search "keyword" --book <book-id> --json
```

M3 / M4 验收：

```bash
readany epub draft create <book-id> --profile editor --json
readany epub inspect <book-id> --profile editor --json
readany epub chapter read <draft-id> <chapter-id> --profile editor --format xhtml --json
readany epub chapter patch <draft-id> <chapter-id> --xhtml <file> --profile editor --json
readany epub metadata patch <draft-id> --patch <file> --json
readany epub history <draft-id> --profile editor --json
readany epub diff <draft-id> --profile editor --json
readany epub validate <draft-id> --profile publisher --json
readany epub export <draft-id> --output <tmp-output.epub> --profile publisher --json
```

## 阶段验收边界

M1 结束时，不要求：

- 支持 EPUB 精排写入。
- 支持导出 EPUB。
- 支持同步和备份。
- 支持移动端安装 CLI。

M1 必须做到：

- CLI package 存在。
- CLI 能安装和卸载 skill。
- CLI 能启动 readonly MCP。
- 外部 AI 可以发现 ReadAny 工具。
- 只读查询链路跑通。
- MCP 不展示规划中但未实现的工具；已实现的 `rag.search` bm25/hybrid/vector、`knowledge.export` 和 `knowledge.search` 必须有对应测试和文档。
- 测试不依赖真实用户数据。

当前 `feat/readany-cli` 已推进到 M3/M4 能力实现：EPUB draft 章节编辑、metadata、toc rebuild、history、diff、undo、discard、validate 和 export 都已接线。后续不能再用 M1 的“不要求精排写入/导出”作为当前完成线；当前完成线应转为真实样本端到端验收、多平台打包验收和 native/runtime 安装体验。

## 功能验收清单

每个新增功能都必须按下面的清单走完，才允许进入当前阶段完成列表：

```text
[ ] 有命令或 MCP tool 设计
[ ] 有真实实现，不是 mock
[ ] 有权限 scope
[ ] 有 JSON 输出
[ ] 有错误码
[ ] 有单元测试
[ ] 有集成测试或 smoke
[ ] 有文档
[ ] tools/list 和 README 状态一致
[ ] 测试使用临时 READANY_HOME / AGENT_HOME
```

对外部 AI 可见的 MCP tool 还必须额外满足：

```text
[ ] inputSchema 限制额外字段，MCP 调用会拒绝未声明参数
[ ] inputSchema 的 minLength / minimum / maximum / enum 会被运行时校验
[ ] readonly profile 权限路径有测试
[ ] tools/list 对外暴露 risk / scopes / minimumProfile
[ ] 不输出密钥、同步配置、任意本地路径
[ ] 大结果有 limit / cursor / range 中至少一种限制
[ ] 审计日志记录调用名、profile、结果，不记录完整正文参数
```

写入类工具还必须额外满足：

```text
[ ] 写入目标是 draft 或受控对象
[ ] 原始 EPUB hash 不变
[ ] 有 diff 或 operation history
[ ] 有回滚、撤销或可丢弃路径
[ ] readonly profile 调用失败
[ ] 高风险动作有确认或更高 profile
```

每次 milestone 验收建议复制 [acceptance/TEMPLATE.md](acceptance/TEMPLATE.md) 到 `docs/readany-cli/acceptance/YYYY-MM-DD-Mx.md`，记录分支、commit、执行命令、结果摘要和已知问题。更完整的交付停止线见 [09-delivery-acceptance-contract.md](09-delivery-acceptance-contract.md)。

M5 验收记录必须额外包含：

- 真实 EPUB / PDF / RAG 样本的来源、SHA-256 和是否可公开。
- EPUB inspect / draft edit / validate / export / exported EPUB reimport 或标准工具打开证据。
- 未索引 PDF `chapters.list/get` fallback 和 `page:<n>` 引用证据。
- RAG result 引用字段和桌面端点击回跳证据。
- 至少两个真实外部 agent 客户端记录，其中一个通过 MCP。
- macOS / Windows / Linux 安装包矩阵和 `doctor --json` 结果。

自动 fixture smoke 通过不等于 M5 完成；没有上述真实样本、真实 agent 和打包产物证据时，验收记录必须继续标记为 partial。

## 每阶段停止线

### M1 停止线

做到这里就可以暂停进入验收，不继续抢做 M2：

- 外部 AI 能发现 ReadAny。
- 外部 AI 能列书、搜书、读书籍元数据、搜笔记、搜高亮。
- 桌面端能安装/卸载 Skill，复制 readonly MCP 配置。
- `tools/list` 只包含真实实现、测试通过、文档同步的工具。
- 所有测试通过。

### M2 停止线

做到这里就可以暂停进入验收：

- 外部 AI 能读取真实章节目录和章节内容。
- `rag.search` 能基于真实索引返回结果。
- 结果包含可回跳的 book/chapter/chunk 引用。
- 大正文不会一次性无上限返回。
- 未索引 EPUB 能通过 `chapters.list/get` fallback 读取真实 spine 章节。
- 未索引 PDF 能通过 `chapters.list/get` fallback 读取真实 page text，并返回 `page:<n>` 引用。

### M3 停止线

做到这里就可以暂停进入验收：

- AI 能创建 draft。
- AI 能修改当前章或元数据。
- 用户能查看 operation history、source/draft EPUB entry diff，并撤销可回滚的 patch。
- 原始 EPUB 不被修改。

### M4 停止线

做到这里就可以暂停进入验收：

- draft 能 validate。
- draft 能 export 为新 EPUB。
- 导出文件能重新导入。
- 设置页能管理 profile 和查看关键审计记录。

## 验收记录模板

每个 milestone 完成时，在 PR 或验收记录里保留以下信息：

```md
# ReadAny CLI Mx Acceptance

- Date:
- Branch:
- Commit:
- OS:
- Node:
- pnpm:
- READANY_HOME:
- AGENT_HOME:

## Commands

- [ ] pnpm --filter @readany/cli check
- [ ] pnpm --filter @readany/cli test
- [ ] pnpm --filter @readany/cli build
- [ ] readany doctor --json
- [ ] readany tools list --json
- [ ] readany mcp serve --profile readonly smoke

## Evidence

- Tools exposed:
- Audit log path:
- Fixtures used:
- External agent tested:

## Result

- Pass / Fail:
- Known issues:
```

## Done 的定义

这件事做到“M1 可交付”的最低线是：

1. CLI 独立 package 可安装、可卸载。
2. MCP server 可对外提供只读访问。
3. skill 可装到通用 agent 目录。
4. 书、笔记、高亮查询可用。
5. `check` / `test` / `build` 通过。
6. 文档和实际工具列表一致。

做到“M3 编辑可用”的线是：

1. 至少一组 draft 写入工具可用。
2. 原 EPUB hash 不变。
3. draft operation history 可查看。
4. patch 支持 diff 和撤销。
5. readonly 调写工具失败。

做到“M4 发布可用”的线是：

1. 至少一组导出工具可用。
2. 导出文件可重新导入 ReadAny。
3. 导出记录写入审计。
4. 桌面客户端能管理 CLI、Skill、MCP、profile。

做到“完整可用”的线是：

1. 读、搜、整理、精排、导出闭环跑通。
2. 权限 profile 可以切换。
3. 审计日志可追踪。
4. macOS / Windows / Linux 三端安装体验都稳定。

## 不通过条件

出现以下任一情况，不允许合并：

- MCP `tools/list` 暴露未真实实现的工具。
- 测试会读写真实 `READANY_HOME`。
- 写操作可以绕过 draft 直接改原书。
- `readonly` profile 能执行写入或导出。
- `readany uninstall` 会删除非 ReadAny 管理的 skill 或用户文件。
- 文档写了可用，但命令、测试或工具 registry 里没有对应实现。
