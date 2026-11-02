# ReadAny CLI Product Scope

## 目标

ReadAny CLI 的目标不是“给人类敲命令用的小工具”，而是把 ReadAny 的本地能力封装成一个可被外部 AI 安全调用的操作面。

外部 AI 通过 ReadAny 可以做的事包括：

- 读书库。
- 搜索书、章节、笔记、标签。
- 读取当前书、当前章、选区、上下文。
- 读取高亮、注释、知识文档、引用关系。
- 发起 RAG 检索。
- 创建和修改草稿。
- 让用户在 draft 工作区直接编辑章节、元数据、目录和样式。
- 执行 EPUB 精排、导出、验证。
- 生成阅读总结、书摘、笔记整理、出版建议。

这意味着 CLI 不是桌面端的附属脚本，而是 ReadAny 的本地能力网关。桌面客户端负责图形化管理，CLI 负责把能力暴露给 shell、脚本、MCP 和外部 AI。

## 核心判断

ReadAny 不是把数据“开放给 AI”，而是把“能力”开放给 AI。

也就是说：

- AI 看到的是工具和资源。
- AI 能操作的是受控对象。
- AI 不能直接接触任意文件系统、任意 SQL、任意进程。

## 能力分层

ReadAny CLI 不是单一命令工具，而是一组逐步开放的本地能力：

| 层级 | 用户价值 | AI 能力 | 默认权限 |
| --- | --- | --- | --- |
| Library | 找书、看元数据、看进度 | 列书、搜书、读书籍元数据 | `readonly` |
| Content | 理解正文和上下文 | 读目录、章节、选区、引用位置 | `readonly` |
| Notes | 整理阅读资产 | 搜笔记、高亮、书签、标签 | `readonly` / `assistant` |
| Knowledge | 做知识整理 | RAG、主题聚合、引用回链 | `readonly` / `assistant` |
| Draft | 改内容但不碰原文件 | 创建草稿、修章、修元数据、修 CSS | `editor` |
| Export | 生成新产物 | 导出 EPUB、Markdown、Obsidian、报告 | `publisher` |
| Admin | 管理本地状态 | 导入、同步、备份、诊断 | `admin` |

## 主要场景

### 1. 读书库

外部 AI 可以：

- 列出所有书。
- 按标题、作者、标签、状态筛选。
- 读取元数据、封面、目录、章节树。
- 读取阅读进度和最近阅读记录。

示例任务：

```text
帮我找出书库里所有关于 AI agent 的书，按最近阅读程度和相关性排序。
```

### 2. 读内容

外部 AI 可以：

- 读取书本文本。
- 读取某一章或某一节。
- 读取选区上下文。
- 读取高亮和笔记。
- 通过 CFI 或内部引用跳回原位。

示例任务：

```text
基于当前阅读章节，解释作者在这里为什么反对上一章的观点。
```

### 3. 整理知识

外部 AI 可以：

- 归并高亮。
- 整理笔记。
- 建立 backlinks。
- 生成主题卡片、术语表、人物表。
- 导出 Obsidian 风格内容。

示例任务：

```text
把我最近三本书里的高亮整理成一篇关于「注意力」的知识笔记，保留来源链接。
```

### 4. 精排 EPUB

外部 AI 可以：

- 修当前段落。
- 修当前章。
- 修整本书。
- 修目录、元数据、封面、CSS。
- 创建导出草稿。
- 验证后导出新 EPUB。
- 用户可以在 draft 工作区继续手动编辑，再交给 AI 继续修。

示例任务：

```text
把这本 EPUB 精排成中文阅读版，修复目录，统一标题样式，导出一个新文件。
```

精排必须遵守 draft-first：

- 原始 EPUB 不被直接修改。
- AI 修改的是 draft 中的受控资源。
- 用户修改也是 draft 修改，不是直接改源文件。
- 每次修改记录 operation history。
- 导出时生成新文件。
- 覆盖原文件必须是后续高风险能力，且必须用户确认。

### 5. 导入和导出

外部 AI 可以：

- 导入本地书籍文件。
- 触发 WebDAV 导入。
- 导出笔记为 Markdown、HTML、JSON。
- 导出 Obsidian vault。
- 导出阅读报告。

导入能力默认需要用户确认；导出能力需要 `export` 权限。

### 6. 阅读统计和计划

外部 AI 可以：

- 读取阅读时长。
- 读取阅读趋势。
- 读取连续阅读天数。
- 基于历史生成阅读计划。
- 生成周报、月报、年度报告。

### 7. 同步和备份

外部 AI 可以在高级 profile 下：

- 查看同步状态。
- 触发同步。
- 检查冲突。
- 生成备份。

同步配置、远程凭证、删除远端文件等操作不进入默认能力。

## 非目标

- 不做任意 shell 执行器。
- 不做裸数据库管理台。
- 不做默认全权限外部 AI 接入。
- 不允许 AI 直接覆盖原始书籍文件。
- 不要求移动端承担 CLI 安装和 MCP 服务职责。
- 不要求第一阶段支持所有导出格式。
- 不要求把用户编辑入口放进设置页；设置页只做接入和权限管理。

## 默认策略

- 默认只读。
- 默认 draft-first。
- 默认审计。
- 默认 workspace 限制。
- 默认显式授权写入。

## 当前已实现范围

当前代码已经实现：

1. CLI 独立 package：`packages/cli`。
2. `readany doctor`、`readany install`、`readany uninstall`。
3. `readany skill install`、`readany skill uninstall`、`readany skill status`。
4. `readany tools list`。
5. `readany books list/search`、`readany book get`。
6. `readany notes search`、`readany highlights search`。
7. `readany bookmarks list`、`readany skills list`。
8. `readany chapters list`、`readany chapter get` 的章节视图：优先 indexed chunks；未索引 EPUB fallback 到真实 EPUB spine/manifest；未索引 PDF fallback 到 page text。
9. `readany rag search --book <book-id>` 的 BM25 chunk 检索。
10. `readany epub inspect <book-id> --profile editor` 的只读 EPUB 结构检查。
11. `readany epub draft create <book-id> --profile editor` 的受控 EPUB draft workspace 创建。
12. `readany epub chapter read <draft-id> <chapter-id> --profile editor` 的 draft 章节读取。
13. `readany epub chapter patch <draft-id> <chapter-id> --xhtml <file> --profile editor` 的 draft 章节替换。
14. `readany epub metadata patch <draft-id> --patch <file> --profile editor` 的 draft 元数据修改。
15. `readany epub history <draft-id> --profile editor` 的 draft operation history 读取。
16. `readany epub diff <draft-id> --profile editor` 的 draft/source EPUB entry 差异查看。
17. `readany epub validate <draft-id> --profile publisher` 的 active draft 结构和引用校验。
18. `readany epub export <draft-id> --output <path> --profile publisher` 的 active valid draft 新 EPUB 导出。
19. `readany audit list --json` 的 CLI/MCP 审计日志读取。
20. `readany mcp serve --profile readonly` 的 stdio JSON-RPC 最小协议。
21. 桌面客户端设置页里的外部 AI 访问入口与 readonly MCP 配置复制。

当前 MCP 只暴露：

```text
books.list
books.search
books.get
chapters.list
chapters.get
notes.search
notes.export
highlights.search
rag.search
audit.list
epub.inspect
epub.draft.create
epub.draft.discard
epub.chapter.read
epub.chapter.patch
epub.metadata.patch
epub.toc.rebuild
epub.history
epub.diff
epub.validate
epub.export
```

## 第一阶段目标范围

第一阶段只需要跑通：

1. CLI 独立 package。
2. `readany doctor`。
3. `readany mcp serve --profile readonly`。
4. 书库、书籍、笔记、高亮的只读查询。
5. Skill 安装到通用 agent 目录。
6. 桌面客户端设置页能管理 CLI 和 Skill 状态。

同步、备份在后续阶段接入。`chapters.*` 已支持 indexed chunks 优先、未索引 EPUB fallback 和未索引 PDF page fallback。`rag.search` 已支持 BM25、hybrid 和 vector；BM25 总是可用，hybrid 在 embedding 未配置或失败时回退到 BM25，vector 需要桌面端远程向量模型配置或 `READANY_EMBEDDING_MODEL` 环境配置。`audit.list` 只读取最近 CLI/MCP 审计元数据，不返回工具参数正文；`notes.export` 只导出单本书的 notes/highlights 文件，默认不覆盖已有文件；`knowledge.export` 只导出全库知识文件，默认不覆盖已有文件，输出书籍 metadata、notes 和 highlights 的文件级汇总，不进入 MCP `tools/list` 的未实现清单；`epub.inspect` 只是只读结构检查；`epub.draft.create` 只复制原 EPUB 到受控 draft workspace 并写入 manifest/history；`epub.draft.discard` 只标记 draft inactive；`epub.chapter.read` 只读取 draft 章节文本；`epub.chapter.patch` 只替换 draft 内单个 XHTML 章节，不修改原书；`epub.metadata.patch` 只修改 draft OPF metadata；`epub.toc.rebuild` 只重建 EPUB3 nav 目录；`epub.history` 只读取 draft operation history；`epub.diff` 只比较 source/draft EPUB entry 的 hash 和 size，不生成内容级 diff；`epub.undo` 只撤销已记录且资源未被后续改动覆盖的 patch；`epub.validate` 只做 active draft 结构和资源引用校验，不自动修改；`epub.export` 只在 validate 通过后导出新 EPUB，不覆盖原书。其余 EPUB 写入工具接入前不允许伪造实现，不允许在 MCP `tools/list` 里提前出现。

用户精排入口不在设置页，而在书籍详情页和 draft 工作区；AI 精排入口通过 MCP / CLI 工具进入同一套 draft/history/diff 流程。

## 完整可用范围

完整可用指外部 AI 可以完成一个闭环任务：

```text
找书 -> 读内容 -> 读笔记/高亮 -> 检索知识 -> 创建 draft -> 修改章节/元数据/CSS -> 验证 -> 导出新文件 -> 写入审计
```

这条闭环跑通前，ReadAny CLI 只能称为外部 AI 只读入口；跑通后，才称为外部 AI 编辑和出版入口。
