# @swimlane-cloud/web

Standalone web app (plan.md §A6): the shared `@swimlane-cloud/editor` mounted
over a **browser-storage host**. No backend, no login — the simplest delivery
target and proof that web/desktop/SaaS share one editor codebase.

## How it works

- `src/main.jsx` mounts `<DslEditor host={browserHost} />` and imports the
  editor's stylesheet. A compact top bar adds **Import .txt** and
  **Download all** affordances on top of the editor's own actions.
- `src/browser-host.js` implements the `EditorHost` contract (plan.md §A4) over
  `localStorage`. Files are stored as a JSON map under `swimlane-web-files`:

  ```jsonc
  { "ops/onboarding/flow.txt": { "content": "@kai-swimlane ... @end", "mtime": 1700000000000 } }
  ```

  `id` is always a POSIX relative path, so the editor builds the folder tree by
  splitting ids on `/`. Empty folders created via `mkdir` are tracked in a
  separate `swimlane-web-dirs` set and surfaced in `list()` as a hidden
  `<dir>/.keep` placeholder so they still appear in the tree.

- On first load (empty storage), three sample `.txt` diagrams are seeded in
  nested folders (`ops/onboarding/`, `ops/expenses/`, `hr/`) so the app isn't
  blank. Each is a minimal valid `@kai-swimlane ... @end` doc.

- Cross-tab sync: a `storage` event listener notifies `watch()` subscribers when
  another tab mutates storage.

- `capabilities: { readOnly: false, versioning: false }` — no checkpoints or
  versions on the browser host.

### EditorHost methods implemented

`root`, `list`, `read`, `writeDraft`, `writeDraftMany`, `create`, `mkdir`,
`watch`. (`checkpoint` / `flagNewVersion` are SaaS-only and intentionally
omitted.)

## Develop

```bash
pnpm --filter @swimlane-cloud/web dev      # vite dev server
pnpm --filter @swimlane-cloud/web build    # production build to dist/
```

Vite is configured (`vite.config.js`) with `@vitejs/plugin-react`, Tailwind,
`base: "./"`, and `server.fs.allow` set to the repo root so the workspace
packages (`@swimlane-cloud/editor`, `@swimlane-cloud/diagram-converter`), which
ship raw ESM source, are served directly. `react`/`react-dom` are deduped to a
single copy.

## Import / export

- **Import .txt** — `<input type=file accept=".txt" multiple>` reads each file's
  text and calls `host.create(file.name, text)`.
- **Download all** — downloads every stored file (nested paths flattened to
  `dir__file.txt` filenames). The editor also provides its own per-file Export.

## Files

```
apps/web/
  index.html            # <div id="root"> + module script to src/main.jsx
  vite.config.js        # @vitejs/plugin-react + tailwind; serves workspace pkg source
  src/main.jsx          # mounts <DslEditor host={browserHost} /> + import/export top bar
  src/browser-host.js   # EditorHost over localStorage
  src/app.css           # top-bar + full-height layout styles
```
