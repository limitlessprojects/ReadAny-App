# ReadAny CLI Acceptance Record Template

## 基本信息

- 日期：
- Milestone：
- 分支：
- Commit：
- 验收人：
- 操作系统：
- Node 版本：
- pnpm 版本：
- ReadAny CLI 版本：
- 样本数据位置：
- 样本数据 hash：
- 外部 agent 客户端：
- 桌面包来源：

## 本次验收范围

- [ ] CLI 基础命令
- [ ] Skill 安装 / 卸载
- [ ] readonly MCP
- [ ] 只读书库查询
- [ ] indexed chapters
- [ ] reader context snapshot
- [ ] RAG search
- [ ] EPUB draft
- [ ] EPUB export
- [ ] exported EPUB reimport / open
- [ ] 桌面设置页
- [ ] 外部 agent 接入
- [ ] macOS / Windows / Linux install matrix
- [ ] native binary / runtime bundle

## 本次明确不验收

-

## 执行命令

```bash
pnpm --filter @readany/cli check
pnpm --filter @readany/cli test
pnpm --filter @readany/cli build
pnpm --filter @readany/cli smoke:agent
git diff --check
```

补充命令：

```bash
readany --version
readany doctor --json
readany skill status --json
readany tools list --json
readany mcp serve --profile readonly
```

桌面端 / Tauri bridge 相关：

```bash
cd packages/app/src-tauri && cargo test readany_cli --lib
cd packages/app/src-tauri && cargo check
pnpm --filter app build
```

EPUB draft / export 相关：

```bash
readany epub inspect <book-id> --profile editor --json
readany epub draft create <book-id> --profile editor --json
readany epub chapter read <draft-id> <chapter-id> --profile editor --format xhtml --json
readany epub chapter patch <draft-id> <chapter-id> --xhtml <fixture.xhtml> --profile editor --json
readany epub metadata patch <draft-id> --patch <fixture.json> --profile editor --json
readany epub toc rebuild <draft-id> --profile editor --json
readany epub history <draft-id> --profile editor --json
readany epub diff <draft-id> --profile editor --json
readany epub undo <draft-id> <operation-id> --profile editor --json
readany epub validate <draft-id> --profile publisher --json
readany epub export <draft-id> --profile publisher --output <tmp-output.epub> --json
readany epub draft discard <draft-id> --profile editor --reason "acceptance cleanup" --json
```

真实样本端到端相关：

```bash
readany books search "<sample-title>" --json
readany chapters list <epub-book-id> --json
readany chapter get <epub-book-id> <chapter-id> --json
readany chapters list <pdf-book-id> --json
readany chapter get <pdf-book-id> page-1 --json
readany rag search "<query>" --book <book-id> --mode bm25 --json
readany rag search "<query>" --book <book-id> --mode hybrid --json
readany audit list --source mcp --json
```

可选采证脚本：

```bash
pnpm --filter @readany/cli build
pnpm --filter @readany/cli acceptance:init -- --workspace <acceptance-workspace-dir>
pnpm --filter @readany/cli acceptance:real -- \
  --readany-home <real-readany-home> \
  --book <book-id> \
  --epub-book <epub-book-id> \
  --pdf-book <pdf-book-id> \
  --rag-query "<query>" \
  --draft-export \
  --export-dir <tmp-export-dir> \
  --evidence <evidence-json>
pnpm --filter @readany/cli acceptance:packaged -- \
  --cli <installed-or-bundled-readany> \
  --package-source <artifact-label> \
  --platform <macOS|Windows|Linux> \
  --readany-home <real-readany-home> \
  --repair-bin-dir <tmp-bin-dir> \
  --agent-home <tmp-agent-home> \
  --with-skill-install \
  --draft-export \
  --book <epub-book-id> \
  --export-dir <tmp-export-dir> \
  --evidence <packaged-evidence-json>
pnpm --filter @readany/cli acceptance:agent -- \
  --client <Codex|Claude Desktop|Cursor> \
  --client-version <version> \
  --profile <readonly/editor/publisher> \
  --uses-mcp \
  --mcp-config <redacted-mcp-config-file> \
  --tools-list-summary "<tools/list summary>" \
  --tool-count <tool-count> \
  --read-flow "<read/search/RAG summary>" \
  --readonly-denial "<readonly write denial summary>" \
  --draft-export-flow "<draft/edit/export summary>" \
  --audit-summary "<audit summary>" \
  --evidence <agent-evidence-json>
pnpm --filter @readany/cli acceptance:desktop -- \
  --snapshot <copied-settings-snapshot.json> \
  --screenshot <screenshot-or-recording-path> \
  --reviewer <name> \
  --notes "<short note>" \
  --evidence <desktop-evidence-json>
pnpm --filter @readany/cli acceptance:scaffold -- \
  --evidence <evidence-json> \
  --agent-evidence <agent-evidence-json> \
  --desktop-evidence <desktop-evidence-json> \
  --packaged-evidence <packaged-evidence-json> \
  --output <acceptance-record.md>
pnpm --filter @readany/cli acceptance:status -- \
  --record <acceptance-record.md> \
  --evidence <evidence-json> \
  --evidence <agent-evidence-json> \
  --evidence <desktop-evidence-json> \
  --evidence <macos-packaged-evidence-json> \
  --evidence <windows-packaged-evidence-json> \
  --evidence <linux-packaged-evidence-json>
pnpm --filter @readany/cli acceptance:validate -- \
  --record <acceptance-record.md> \
  --evidence <evidence-json> \
  --evidence <agent-evidence-json> \
  --evidence <desktop-evidence-json> \
  --evidence <macos-packaged-evidence-json> \
  --evidence <windows-packaged-evidence-json> \
  --evidence <linux-packaged-evidence-json> \
  --strict-m5
pnpm --filter @readany/cli acceptance:finalize -- \
  --record <acceptance-record.md> \
  --evidence <evidence-json> \
  --evidence <agent-evidence-json> \
  --evidence <desktop-evidence-json> \
  --evidence <macos-packaged-evidence-json> \
  --evidence <windows-packaged-evidence-json> \
  --evidence <linux-packaged-evidence-json> \
  --release <release-label> \
  --reviewer <name> \
  --output <final-manifest.json>
pnpm --filter @readany/cli acceptance:bundle -- \
  --record <acceptance-record.md> \
  --manifest <final-manifest.json> \
  --evidence <evidence-json> \
  --evidence <agent-evidence-json> \
  --evidence <desktop-evidence-json> \
  --evidence <macos-packaged-evidence-json> \
  --evidence <windows-packaged-evidence-json> \
  --evidence <linux-packaged-evidence-json> \
  --release <release-label> \
  --output-dir <acceptance-bundle-dir>
pnpm --filter @readany/cli acceptance:verify-bundle -- \
  --bundle-dir <acceptance-bundle-dir>
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

`acceptance:real` 默认只读；只有加 `--draft-export --export-dir <dir>` 才会创建 EPUB draft、validate、export、inspect 导出 EPUB，并默认 discard draft 清理验收工作区。需要保留 draft 手工检查时可额外传 `--keep-draft`。该脚本会在 stdout 输出脱敏摘要，并写入完整 JSON 证据；证据会自动记录 environment（平台、Node、pnpm、CLI version、git commit/branch）、`doctor --json` 诊断、样本书文件路径、字节数、SHA-256、可回跳 citation targets 和 `manualAcceptanceRequired` 清单。每个 `manualAcceptanceRequired` 项都带 `evidence` 和 `commands`，用于指导后续人工补证，但不能替代样本来源、真实外部 agent 和打包产物记录。

`acceptance:packaged` 用来给 macOS / Windows / Linux 打包矩阵逐个平台采证。默认只读，记录 version、doctor runtime/distribution、tools list、MCP config、readonly MCP initialize/tools/list 和 skill status；只有显式 `--repair-bin-dir <tmp-bin-dir>` 才会运行 `readany repair --user` 并把 shim 写入临时 bin 目录；只有显式 `--with-skill-install` 才会执行 skill install/status/uninstall，建议搭配临时 `--agent-home`；只有显式 `--draft-export --book <epub-book-id> --export-dir <dir>` 才会创建 draft、validate、export、检查导出 EPUB 结构并默认 discard draft 清理工作区。该 evidence 只证明单平台安装/运行状态，不能替代真实样本、真实外部 agent 或最终 M5 记录。

`acceptance:init` 用来创建一套本地 acceptance workspace，包含 `record.md`、`evidence/`、`bundle/`、`exports/`、`logs/` 以及一个说明 README。文档里引用的 `docs/readany-cli/acceptance/evidence/*.json` 结构可以直接映射到这套 workspace，用它起手能少掉不少手工搭目录和改路径。

`acceptance:agent` 用来记录 Codex / Claude Desktop / Cursor 等真实外部客户端的人工验收事实，包括 read/search/RAG、readonly 写入拒绝、draft/export 和 audit 摘要。使用 MCP 的客户端必须传 `--uses-mcp`、脱敏 MCP config、tools/list 摘要和 tool count；脚本会拦截明显未脱敏密钥。每个 evidence 只代表一个真实客户端，不能替代至少两个外部 agent、其中一个使用 MCP 的 strict M5 要求。

`acceptance:desktop` 用来把设置页“复制证据”快照整理成结构化 evidence。它要求 snapshot 里能看到 CLI 可用、doctor distribution、Skill 状态、MCP 配置、tools、audit 和 last action 摘要；它不会去执行桌面 UI 自动化，因此需要人工先在设置页点一次复制证据再采证。

`acceptance:scaffold` 可以从 evidence 生成验收记录草稿，自动填入样本 SHA-256、citation target、doctor distribution 和 `Manual Acceptance Closure` 待办项；也可以重复传 `--agent-evidence <json>`、`--desktop-evidence <json>` 和 `--packaged-evidence <json>`，用单客户端 agent 证据、桌面设置页证据和单平台 packaged 证据预填对应表格。它只生成 partial 草稿，不会把 pending/TBD 项伪装成通过；agent / desktop / packaged 矩阵行也只代表已补证的客户端或平台，缺失客户端、draft export、真实安装器和跨平台完整矩阵仍要人工关闭。

`acceptance:status` 用来在 strict M5 前做 readiness 检查。它会汇总当前传入的 evidence 类型、外部 agent 客户端、MCP 覆盖和打包平台覆盖，指出离 strict M5 还缺哪些证据，并给出建议下一步命令。它不会替代 `acceptance:validate`，但很适合在补证过程中快速扫缺口。

`acceptance:validate` 用来检查验收记录、`acceptance:real` evidence、单客户端 agent evidence、桌面设置页 evidence 和单平台 packaged evidence 的结构，`--evidence` 可重复传入多份证据。最终 M5 记录必须使用 `--strict-m5` 并传完整组合 evidence，确保没有未勾选验收范围、结果不是“部分通过”，没有仍不能对外宣称的能力，外部 agent 表格至少有 Codex + Claude/Cursor 两个不同客户端的完整记录，其中至少一条使用 MCP，打包矩阵包含 macOS / Windows / Linux 三平台完整记录，有桌面设置页证据，并且 `Manual Acceptance Closure` 逐项关闭 `acceptance:real` 列出的人工补证项。packaged 平台名支持 `darwin` / `macOS` / `win32` / `Windows` / `linux` 归一。若同时传 `--record` 和真实样本 `--evidence`，strict 模式还会要求验收记录引用 evidence 中的样本 SHA-256、citation target 和 doctor distribution 标记；agent / desktop / packaged evidence 是补充证据，不触发真实样本锚点检查。

`acceptance:finalize` 用来生成最终验收 manifest。它会先执行 strict M5 组合证据校验，失败时不会写 manifest；通过后会记录验收 record、每份 evidence 的 SHA-256、git commit/branch、验证结果和证据类型摘要，作为发布归档锚点。

`acceptance:bundle` 用来把最终验收 record、manifest 和 evidence 复制到一个 bundle 目录，并生成 `index.json`。它不替代 `acceptance:finalize`；推荐在 manifest 生成后执行，用于归档、交接和上传发布证据。

`acceptance:verify-bundle` 用来独立复验 bundle 目录里的 `index.json`、`record.md`、`manifest.json` 和 evidence 文件是否彼此匹配，并重跑 strict M5；如果 bundle manifest 已经写回复验元数据，也会一并核对。它适合在交接、上传发布证据或 CI 下载归档包后做二次校验。

`acceptance:assemble` 是 `acceptance:finalize + acceptance:bundle + acceptance:verify-bundle` 的一键入口。它会先执行 strict M5 校验并写出 `<output-dir>/final-manifest.json`，然后把对外交付使用的 `record.md`、`manifest.json`、`index.json` 和全部 evidence 整理到同一个 bundle 目录，最后自动复验整个 bundle。适合在证据都齐全后作为最后一步执行。

## 验收结果

```text
通过 / 不通过：
```

## 证据摘要

- CLI check：
- CLI test：
- CLI build：
- MCP tools/list：
- reader context snapshot：
- readonly 权限拒绝：
- draft discard / rollback：
- 原始 EPUB hash：
- audit log：
- 外部 agent：
- 桌面设置页：
- exported EPUB reimport/open：
- PDF fallback：
- RAG 引用回跳：
- packaged app install：
- runtime / native bundle：

## 安全边界证据

- readonly 写入拒绝：
- 原始 EPUB hash 不变：
- export 不覆盖源文件：
- export 不覆盖已有文件：
- Tauri allowlist：
- MCP tools/list 与真实实现一致：
- audit 不含完整正文 / 密钥 / 同步凭证：

## 真实样本证据

样本清单：

| 类型 | 标题 / 文件 | 来源 | SHA-256 | 是否可公开 | 用途 |
| --- | --- | --- | --- | --- | --- |
| EPUB |  |  |  |  | inspect / draft / export |
| PDF |  |  |  |  | page fallback / citation |
| RAG index |  |  |  |  | bm25 / hybrid / vector |

端到端结果：

- EPUB inspect：
- EPUB draft edit：
- EPUB validate：
- EPUB export：
- 导出 EPUB 重新导入或标准 EPUB 工具打开：
- PDF `chapters.list/get` fallback：
- RAG result 引用字段：
- 桌面端引用点击回跳：

## 外部 Agent 证据

| 客户端 | 版本 | MCP 配置 profile | tools/list | read flow | draft/export flow | 结果 |
| --- | --- | --- | --- | --- | --- | --- |
| Codex |  |  |  |  |  |  |
| Claude Desktop / Cursor |  |  |  |  |  |  |

必须附：

- MCP config 片段，不含密钥。
- `tools/list` 是否只包含真实实现工具。
- readonly 写入拒绝截图或日志摘要。
- editor draft 修改摘要。
- publisher validate/export 摘要。
- audit 摘要。

## 打包 / 安装矩阵

| 平台 | 包来源 | 安装 | `readany doctor --json` | Skill install/status | MCP initialize/tools/list | Draft export | 结果 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| macOS |  |  |  |  |  |  |  |
| Windows |  |  |  |  |  |  |  |
| Linux |  |  |  |  |  |  |  |

## Manual Acceptance Closure

| id | status | evidence | owner |
| --- | --- | --- | --- |
| sample-source |  |  |  |
| external-agent-clients |  |  |  |
| desktop-settings |  |  |  |
| packaged-app-matrix |  |  |  |
| reader-jumpback |  |  |  |
| runtime-bundle |  |  |  |

## 当前可对外说明

-

## 当前不能对外宣称

-

## 已知问题

-

## 是否允许进入下一阶段

- [ ] 是
- [ ] 否

原因：
