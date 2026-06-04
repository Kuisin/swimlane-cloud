# @swimlane-cloud/desktop

Thin Electron shell that mounts the shared `@swimlane-cloud/editor` over a
local-filesystem host. Open a folder of `.txt` DSL files, browse the nested
folder tree, edit with live preview, and save back to disk as `.txt` — no
server, no login. (Plan §A5.)

**The desktop app adds zero editor UI.** All editing surfaces (GUI/text modes,
preview, folder tree, document model) live in `@swimlane-cloud/editor` and are
shared verbatim with the web and SaaS targets. This app contributes only:

- Electron main-process OS integration (`electron/main.cjs`)
- A `contextBridge` IPC preload (`electron/preload.cjs`)
- A ~40-line host adapter mapping `window.api` → `EditorHost` (`src/desktop-host.js`)
- A ~10-line mount plus a tiny "Open folder" empty-state (`src/main.jsx`)

## Layout

```
apps/desktop/
  index.html
  vite.config.js               # base "./", aliases workspace pkgs to source, transpiles JSX
  electron/
    main.cjs                   # window, window-state persistence, dialogs, fs, chokidar, IPC
    preload.cjs                # contextBridge → window.api
  scripts/
    dev-port-plugin.js         # writes .dev-port for launch-electron
    launch-electron.mjs        # waits on dev server, spawns Electron --dev
  src/
    main.jsx                   # mounts <DslEditor host={desktopHost} /> + open-folder wrapper
    desktop-host.js            # window.api → EditorHost
    app.css                    # minimal empty-state styling (no Tailwind)
```

## Module format

`package.json` has `"type": "module"`, so Electron main/preload use the `.cjs`
extension to force CommonJS. `package.json` `"main"` points at
`electron/main.cjs`; `main.cjs` loads `preload.cjs` from the same dir.

## Host adapter (`EditorHost`)

`desktopHost` maps the IPC bridge to the storage-agnostic contract:

| EditorHost            | window.api                                  |
|-----------------------|---------------------------------------------|
| `root()`              | `getOpenedFolder()`                         |
| `list()`              | `readTxtFiles()` → `[{ id, name, mtime }]`  |
| `read(id)`            | `readFile(id)`                              |
| `writeDraft(id,dsl)`  | `writeTxtFile(id, dsl)`                      |
| `writeDraftMany(u)`   | `writeTxtFiles(u)` (Save all)               |
| `create(id,dsl)`      | `createTxtFile(id, dsl)`                     |
| `mkdir(dir)`          | `makeDir(dir)`                              |
| `watch(cb)`           | `onFileChanged` → `{ id, dsl, type }` + unsub |

`id` is the POSIX relative path within the opened folder root. The editor builds
the folder tree by splitting ids on `/`.

## Main-process IPC handlers

`select-folder`, `read-txt-files` (recursive walk, skips dotfiles),
`read-file`, `write-txt-file` (guarded, `mkdir -p`), `write-txt-files` (batch),
`create-txt-file` (guarded, `mkdir -p`), `make-dir`, `get-opened-folder`,
`watch-folder` / `stop-watch` (chokidar on the whole tree → `file-changed`
events). All path-based handlers resolve against the opened folder and reject
path-traversal escapes.

## Scripts

```bash
pnpm dev        # vite + Electron (waits on .dev-port, loads dev server URL)
pnpm build      # vite build → dist/
pnpm start      # electron . against a prebuilt dist/
pnpm build:mac  # vite build + electron-builder --mac (dmg, x64 + arm64)
pnpm build:win  # vite build + electron-builder --win (nsis)
```

In dev the main process loads the Vite dev-server URL (port read from
`.dev-port`); in production it loads `dist/index.html` (`base: "./"` for
`file://`).
