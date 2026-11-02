# @readany/cli

`@readany/cli` is the local command and MCP entry point for external AI access to ReadAny.

Current phase:

- `readany --version`
- `readany doctor`
- `readany install`
- `readany uninstall`
- `readany skill install`
- `readany skill uninstall`
- `readany skill status`
- `readany tools list`
- `readany books list`
- `readany books search`
- `readany book get`
- `readany chapters list`
- `readany chapter get`
- `readany notes search`
- `readany highlights search`
- `readany rag search --book <book-id>`
- `readany mcp serve --profile readonly`

Current MCP tools:

```text
books.list
books.search
books.get
chapters.list
chapters.get
notes.search
highlights.search
rag.search
```

Development:

```bash
pnpm --filter @readany/cli dev -- --version
pnpm --filter @readany/cli check
pnpm --filter @readany/cli test
pnpm --filter @readany/cli build
```

Design docs live in `docs/readany-cli`.
