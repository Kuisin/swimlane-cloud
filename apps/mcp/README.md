# @swimlane-cloud/mcp

A public, read-only [MCP](https://modelcontextprotocol.io) server for the kai-swimlane DSL. An
LLM (or any MCP client) connects to `/api/mcp` and gets two tools:

- **`get_dsl_syntax`** — the grammar spec (`dsl-rule.md`), by section. Call with no arguments
  first to get the table of contents plus the invariants and a worked example; call again with
  `section` set to one of the returned names for the rest.
- **`validate_dsl`** — parse a draft document and list every syntax error and warning, with line
  numbers, using the same reader (`@swimlane-cloud/diagram-converter`) the editor and every render
  path in this repo use.

No API key. No write access to anything — it never sees a real repository, only whatever text a
tool call passes it, and the bundled copy of `dsl-rule.md`.

## Why its own app, not a route on `apps/saas`

`apps/saas` is authenticated and holds real user repositories; this is deliberately a separate,
much smaller deployment so "public and read-only" is true of the whole app, not just one route.

## Development

```bash
pnpm --filter @swimlane-cloud/mcp dev
```

`predev`/`prebuild` copy the repo-root `dsl-rule.md` into `content/` (gitignored — Vercel only
traces a serverless function's own directory into its bundle, so the copy has to live inside the
app). Edit the spec at the repo root, not the copy.
