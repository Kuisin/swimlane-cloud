# Build Plan: DSL Editor + DSL Management SaaS

## Two Products, One Engine

This plan is split into **two independently shippable products** that share one
open-source engine:

| | **Product A — Online DSL Editor** | **Product B — DSL Management SaaS** |
|---|---|---|
| What it is | The editing surface: **GUI mode + text mode**, live SVG preview, on-device render | Git-backed version control, collaboration, roles, billing for diagrams |
| Who it's for | Anyone editing a diagram (works standalone) | Teams that need history, review, approvals, tenancy |
| Backend needed | **None** — renders + edits locally | Gitea + Supabase + Stripe |
| Ships as | Embeddable React package + standalone web app + desktop (Electron) app | Next.js app that **embeds** the editor |
| Source | Engine open source (MIT); editor UI source-available | Closed source |

**The split is the key idea:** the editor knows how to *edit and live-preview* DSL; it
does **not** know how files are stored or versioned. The SaaS knows how to *store,
version, and collaborate* — using a fixed **branch model** (`main`, `test`, `tmp-*`).
Server-side SVG is created **only** when a user explicitly flags a commit as **new version**
(typically on `test`). **Only** new-version commits may be promoted to `main`. They meet at
one small contract (the **host adapter**, §A4).

**Two rendering roles, one engine:**
- **Live preview → on-device.** Both editor surfaces render DSL→SVG locally as the user
  types: instant, offline, throwaway per-keystroke output.
- **Canonical artifact → SaaS server-side.** The server runs `textToSvg` in Node **only**
  when a commit is explicitly flagged **new version** (not on every checkpoint). Stored
  SVG is deduped by DSL content hash. Commits without the flag have no server SVG — history
  and review use on-device preview of the DSL at that ref.

```
            ┌───────────────────────────────────────────────┐
            │   PRODUCT A — Online DSL Editor (GUI + Text)    │
            │   • GUI mode (forms/inspector, non-technical)   │
            │   • Text mode (Monaco/code)                     │
            │   • LIVE PREVIEW renders DSL→SVG ON-DEVICE      │
            │     (per-keystroke, instant, offline)           │
            └───────────────────────┬───────────────────────┘
                                    │ EditorHost contract (§A4)
                                    │ list / read / write(=commit) / create / watch
              ┌─────────────────────┼─────────────────────────┐
              ▼                     ▼                          ▼
     ┌────────────────┐   ┌──────────────────┐     ┌──────────────────────┐
     │ Local files    │   │ Browser storage  │     │  PRODUCT B — SaaS     │
     │ (Electron/IPC) │   │ (standalone web) │     │  git-backed host      │
     └────────────────┘   └──────────────────┘     └───────────┬──────────┘
                                          draft + checkpoint on tmp-* │ (DSL only)
                                                                ▼
                                          ┌────────────────────────────────┐
                                          │ SaaS API (Node)                 │
                                          │  • branches: main · test · tmp-*│
                                          │  • SVG ONLY on "new version" flag│
                                          │  • main ← only flagged versions │
                                          │  • public share (main versions) │
                                          └───────────────┬────────────────┘
                                                          ▼
                                          ┌────────────────────────────────┐
                                          │ Gitea (git) + Supabase + Stripe │
                                          └────────────────────────────────┘
```

> **Two rendering roles.** *Live preview* is always on-device. *Canonical SVG* is rendered
> server-side **only** when a commit is flagged **new version** (on `test`). Checkpoints on
> `tmp-*` / `test` store DSL in git only. Promotion to `main` requires the new-version flag.
> Public links on `main` can expose SVG only or SVG + DSL. Same open-source engine everywhere.

---

# PART A — Online DSL Editor (GUI + Text)

A self-contained product for editing kai-swimlane DSL with live preview. Usable with no
backend at all. Three delivery targets share one codebase:

- **Embeddable package** — `@swimlane-cloud/editor` (React), what the SaaS mounts.
- **Standalone web app** — the editor + a browser-storage host, no login.
- **Desktop app** — Electron shell + a local-filesystem host (local-first).

## A1 — Engine (Open Source)

- Publish the DSL→SVG engine as a standalone **open-source npm package** (MIT):
  `@swimlane-cloud/diagram-converter`, exporting `textToSvg`, `parseDSL`, `THEMES`.
- Must stay **dependency-free and DOM-free** so it runs identically in the browser, the
  Electron renderer, a web worker, Node, and CI.
- One engine, two callers: the **editor** imports it for on-device live preview, and the
  **SaaS API** imports the same package (in Node) to render canonical SVG when a commit is
  flagged **new version** on `test`. Preview and canonical render use identical code.

```js
import { textToSvg } from "@swimlane-cloud/diagram-converter";
const { svg, model, errors } = textToSvg(src, { themeKey });
```

## A2 — Editing Modes (GUI + Text)

The editor exposes the **same DSL document** through two synchronized modes (ported from
the `swimlane-app/apps/txt-editor` reference: `gui-model.js`, `dsl-document.js`,
`flow-rows.js`, `step-inspector`, `format-dsl.js`):

**Text mode** — for power users.
- Monaco (web/SaaS) or CodeMirror; register the DSL as a custom language for syntax
  highlighting, completion, and inline parse-error markers from `model.errors`.
- `onChange` → debounce ~300ms → `textToSvg(src)` → live preview.

**GUI mode** — for non-technical users.
- Form/inspector UI over a parsed model: flow rows, step inspector, branch inspector,
  parts pickers, **project section templates** (see §B1), color presets.
- When adding or editing `/page/`, `/option/`, `/role/`, `/block/`, or `/prop/` content,
  pick from the **project’s template library** (`dsl-rule.md` §セクション). On SaaS, owners
  can **force** a template per section — GUI locks that section; checkpoint validates match.
- Edits mutate a structured `gui-model`, then **serialize back to canonical DSL** via a
  formatter (`format-dsl.js`) so text and GUI never diverge.

**Shared document model.**
- One source of truth per file: `{ id, src, savedSrc, revision }`; **dirty = `src !== savedSrc`**.
- Switching modes is loss-free: GUI ⇄ text both round-trip through the same DSL string.
- Parse-error policy decides whether GUI mode is available (can't form-edit unparseable
  text) — fall back to text mode and surface the error list.

## A3 — Editor Shell (UI) — One Shared Package

**Everything in §A2–A3 lives in a single package, `@swimlane-cloud/editor`, and is
consumed *identically* by web, desktop, and SaaS.** No target forks or re-implements
editor UI. A target only supplies (1) an `EditorHost` (§A4) and (2) a ~10-line mount.

The package owns the full editor surface:
- **Split-pane:** editor (left, GUI or text) + SVG preview (right), resizable.
- **Mode toggle:** GUI ⇄ Text.
- **Folder tree + tabs:** a collapsible tree that mirrors the real folder structure
  (nested subfolders, not a flat list), built from the path-structured `FileRef.id`s
  returned by the host. Click a file to open; switch tabs (prompt to discard if leaving a
  dirty doc). "New file" / "New folder" create within the selected folder.
- **Action bar:** Save, **Save all** (update folder / batch persist), Checkpoint (SaaS), Flag new
  version (`test`), Promote to main, New file, New folder, Export, Help.
- **Error list & parse-error prompt:** non-blocking, mapped to lines.
- **State + document model:** `FileEditorProvider`, dirty tracking, GUI⇄text sync.
- UI: Mantine + Tailwind. The package is engine-driven and **has no knowledge of git,
  auth, networking, Electron, or the filesystem** — all persistence goes through the host.

```tsx
// The entire public surface every target mounts:
import { DslEditor } from "@swimlane-cloud/editor";
<DslEditor host={host} />   // host = desktop | browser | SaaS
```

This is what makes the desktop app *minimal* and maintenance *cheap*: a fix or feature in
`@swimlane-cloud/editor` ships to web, desktop, and SaaS at once. The only platform code
is the host + shell.

## A4 — The Host Adapter (the split point)

The single contract that decouples the editor from storage/versioning. The editor calls
it; each environment implements it.

```ts
// id = POSIX relative path within the project/folder root, e.g. "ops/onboarding/flow.txt".
// Desktop root = opened directory. SaaS root = project repo tree at branch ref.
// The editor builds the folder TREE by splitting ids on "/"; hosts never flatten to a single file.
interface FileRef { id: string; name: string; mtime?: number }

interface EditorHost {
  root?(): Promise<string | null>;                   // opened folder path or project label
  list(): Promise<FileRef[]>;                         // recursive .txt under root
  read(id: string): Promise<string>;
  writeDraft(id: string, dsl: string): Promise<void>;
  writeDraftMany?(updates: { id: string; dsl: string }[]): Promise<void>;  // Save all
  checkpoint?(opts: { message?: string; files?: { id: string; dsl: string }[] }): Promise<void>;  // SaaS: one git commit, multi-path
  create(id: string, dsl: string): Promise<void>;
  mkdir?(dirPath: string): Promise<void>;
  watch?(cb: (e: { id: string; dsl: string | null; type: "add"|"change"|"unlink" }) => void): () => void;
  capabilities?: { readOnly?: boolean; versioning?: boolean };
}
```

- **Desktop host** → implements it over Electron IPC + `fs` (§A5).
- **Browser host** → implements it over `localStorage` / OPFS for the standalone app.
- **SaaS host** → implements it over the Git translation API (Part B). `write` uploads the
  **draft** on Save, **checkpoint** on `tmp-*` (git only), **flag new version** on `test` (server SVG);
  the host sends DSL only. Extra SaaS-only actions (flag version, branch, request merge)
  are surfaced via an optional capability interface so the core editor stays storage-agnostic.

This is exactly what "splitting the editor from the SaaS" means in code: **the editor
depends on `EditorHost`, not on Gitea.**

## A5 — Desktop App (Electron) — Minimal Shell

**Principle: the desktop app adds zero UI.** It is a thin Electron wrapper around the
*same* `@swimlane-cloud/editor` the web app uses. All editor code is shared; the desktop
app contributes only (1) OS integration in the Electron main process and (2) a tiny host
that adapts the filesystem to `EditorHost`.

**Goal:** open a local folder of `.txt` DSL files, see the **full nested folder structure**
in a tree, edit with live preview, and save every file back to disk **as `.txt`** in its
original subfolder — no server, no login. **Ship criteria:** open folder → browse the
folder tree → edit (GUI or text) → live preview → save (writes `path/to/file.txt`) →
external file changes appear automatically. Create files and subfolders from the tree.
Packaged as `.dmg` / `.exe`.

**Local storage model — folder-first:**
- The user **opens a folder** (directory picker); that path is the workspace **root**. All
  work is scoped to that tree — not single-file open/save dialogs.
- Everything persists as plain UTF-8 `.txt` files under the root; the DSL text *is* the file.
- The on-disk hierarchy is preserved exactly and shown as a tree (arbitrary depth).
- **Per-file save** writes back to the same relative path (`ops/onboarding/flow.txt`),
  `mkdir -p` on parents as needed.
- **Update folder** — **Save all** (or on quit with dirty tabs): persist every changed
  `.txt` under the root in one action; failed paths reported per file, not silent partial loss.
- **New file / new folder** land under the path selected in the tree (same as desktop reference app).
- `chokidar` watches the **whole tree** so external edits (Finder, git CLI, another editor)
  sync into the UI without re-opening the folder.

### A5.1 — What's shared vs. desktop-only

| | Lives in | Reused by web? |
|---|---|---|
| Editor UI, GUI/text modes, preview, state, document model | `@swimlane-cloud/editor` | ✅ identical |
| Engine (parse + render) | `@swimlane-cloud/diagram-converter` | ✅ identical |
| Electron `main.js` (window, dialogs, fs, chokidar watch) | `apps/desktop/electron` | ❌ desktop-only |
| `preload.js` → `window.api` (IPC bridge) | `apps/desktop/electron` | ❌ desktop-only |
| `desktop-host.ts` (adapts `window.api` → `EditorHost`) | `apps/desktop/src` | ❌ desktop-only (~40 lines) |
| Mount (`<DslEditor host={desktopHost} />`) | `apps/desktop/src/main.tsx` | ❌ desktop-only (~10 lines) |

The desktop-only column is the *entire* app-specific surface — a few hundred lines of
Node/IPC, no React components.

### A5.2 — Scaffold (`apps/desktop`)

```
apps/desktop/
  package.json            # main: electron/main.js
  index.html              # <div id="root"> + import src/main.tsx
  vite.config.js
  electron/ main.js preload.js          # OS integration only
  scripts/ launch-electron.mjs
  src/
    main.tsx              # mounts <DslEditor host={desktopHost} /> — that's it
    desktop-host.ts       # window.api → EditorHost
```

Deps: `electron`, `electron-builder`, `chokidar`, `react`, `react-dom`, `vite`,
`@swimlane-cloud/editor`, `@swimlane-cloud/diagram-converter` (the last two are workspace
packages — no editor code is copied in).

```json
"scripts": {
  "dev":   "concurrently -k \"vite\" \"wait-on file:.dev-port && node scripts/launch-electron.mjs\"",
  "build": "vite build",
  "build:mac": "vite build && electron-builder --mac",
  "build:win": "vite build && electron-builder --win"
}
```

The renderer (`main.tsx`) is the whole app-level UI:

```tsx
import { createRoot } from "react-dom/client";
import { DslEditor } from "@swimlane-cloud/editor";
import { desktopHost } from "./desktop-host";

createRoot(document.getElementById("root")!).render(
  <DslEditor host={desktopHost} />
);
```

### A5.3 — Main Process (Node, desktop-only)
- **Window** with `contextIsolation: true`, `nodeIntegration: false`, preload, macOS
  `hiddenInset` title bar.
- **Window-state persistence** to `userData/window-state.json`, clamped to a visible display.
- **Path-traversal guard** — resolve relative paths against the opened folder, reject escapes.
- **Read-only bundled samples** via `extraResources/content` for first-launch content.
- IPC handlers:
  - `select-folder` → open-directory dialog, returns the root.
  - `read-txt-files` → **recursive walk** of the root, skipping dotfiles, returning every
    `.txt` as `{ name: posixRelPath, content, mtime }` so the full nested structure is
    available to build the tree.
  - `write-txt-file` (guarded) → writes UTF-8 to the relative path, `mkdir -p` on parents.
  - `write-txt-files` (guarded, batch) → `[{ relPath, content }]` for **Save all / update folder**.
  - `create-txt-file` (guarded, `mkdir -p`) → relative path may include new subfolders.
  - `make-dir` (guarded, `mkdir -p`) → create an empty folder shown in the tree.
  - `get-opened-folder` → returns root path (restore last folder on launch optional).
  - `watch-folder` / `stop-watch` → chokidar on the whole tree → `file-changed` events
    `{ name: posixRelPath, content, eventType }` (add/change/unlink) for nested files too.
- `preload.js` exposes a minimal `window.api` over `contextBridge` (selectFolder,
  readTxtFiles, writeTxtFile, createTxtFile, makeDir, watchFolder, onFileChanged, …).

### A5.4 — Desktop Host (the only glue)
`desktop-host.ts` maps `window.api` to `EditorHost` so the shared editor never sees IPC:

```ts
export const desktopHost: EditorHost = {
  root:   () => window.api.getOpenedFolder(),
  list:   () => window.api.readTxtFiles(folderPath),  // all .txt under root, nested paths
  read:   (id) => window.api.readFile(id),
  writeDraft: (id, dsl) => window.api.writeTxtFile(id, dsl),
  writeDraftMany: (updates) => window.api.writeTxtFiles(updates),  // Save all — update folder
  create: (id, dsl) => window.api.createTxtFile(id, dsl),
  mkdir:  (dir) => window.api.makeDir(dir),
  watch:  (cb) => { window.api.onFileChanged(cb); return window.api.removeFileChangedListener; },
};
```

The shared editor builds the **folder tree from the `id` paths** this `list()` returns, so
the on-disk hierarchy is shown without any desktop-specific UI. Save and external-change
behavior (dirty tracking, non-destructive sync, ~3s self-save echo guard) is handled
**inside the shared editor** against this interface — not re-implemented per platform.

### A5.5 — Package
`electron-builder`: `appId`, `productName`, `files: [dist/**, electron/**, package.json]`,
`extraResources` for samples, mac `dmg` (x64+arm64), win `nsis`.

## A6 — Standalone Web App (Optional, No Backend)
- Same `@swimlane-cloud/editor` + a **browser-storage host** (localStorage/OPFS) — another
  ~40-line `EditorHost`, same ~10-line mount. No editor code duplicated.
- Import/export `.txt`, same folder-tree view (paths kept in browser storage), live
  preview, on-device render.
- Zero login; the simplest path to the editor and proof the web/desktop UIs are one codebase.

---

# PART B — DSL Management SaaS

A git-backed SaaS for business-process diagrams that **embeds Product A** and adds
storage, history, versioning, collaboration, roles, and billing. Non-technical users get
a clean "Save / Checkpoint / Merge to test / Flag new version / Promote to main" workflow; Gitea is the
invisible backbone. The SaaS implements the `EditorHost` (the **SaaS host**) plus the
versioning/collaboration capabilities.

## B0 — Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Frontend | Next.js App Router | Existing stack |
| Embedded editor | `@swimlane-cloud/editor` (Part A) | One editor everywhere |
| DSL→SVG engine | `@swimlane-cloud/diagram-converter` (open source) | On-device for preview; same package in Node for canonical render |
| SaaS API | Next.js Route Handlers | Git translation + SVG render on "new version" flag only |
| Auth | Supabase Auth | Magic link for MVP, OIDC later |
| Database | Supabase (Postgres) | RLS for tenant isolation |
| File Storage | Supabase Storage | Deduped SVG blobs (one file per unique DSL content hash) |
| Git server | Gitea (Docker, self-hosted VPS) | Full API, lightweight |
| Billing | Stripe | Checkout + Customer Portal |
| Deploy | Vercel (app) + VPS/Fly.io (Gitea) | |

## B1 — Data Model

```sql
-- Tenancy
workspaces        (id, name, slug, gitea_org_name, plan, stripe_customer_id)
workspace_members (workspace_id, user_id, role)  -- role: owner | editor | viewer

-- Content (folder-first: one project = one git repo = one directory tree of .txt files)
projects          (id, workspace_id, name, gitea_repo_name)
                   -- repo mirrors a folder layout, e.g. ops/onboarding/flow.txt, hr/hiring.txt
diagrams          (id, project_id, name, filepath_in_repo UNIQUE per project,
                   created_by)   -- filepath_in_repo = path within repo tree, NOT repo root
diagram_drafts    (project_id, filepath_in_repo, branch, dsl_text, updated_by, updated_at)
                   -- working copies keyed by path + branch; not in git until checkpoint

-- SVG storage (deduped: one blob per unique DSL content; created ONLY on new-version flag)
svg_blobs         (id, dsl_content_hash UNIQUE, svg_storage_path, theme_key, rendered_at)

-- Versions (explicit "new version" flag on a commit — typically on `test`)
versions          (id, diagram_id, name, commit_sha, branch,   -- branch where flagged
                   svg_blob_id, is_new_version DEFAULT true,
                   promoted_to_main BOOLEAN DEFAULT false,
                   public BOOLEAN DEFAULT false,              -- only meaningful on main
                   share_mode,  -- null | 'svg_only' | 'svg_and_dsl' (main + public only)
                   public_slug, note, created_by, created_at)
edit_sessions     (id, project_id, branch_name, created_by, status, created_at)
                   -- branch_name always `tmp-*`; base branch is `test`
merge_requests    (id, project_id, gitea_pr_index, head_branch, base_branch,
                   version_id,  -- required when base=main: must reference flagged version
                   title, status, author_id, reviewer_id, created_at)

-- Audit
audit_log         (id, workspace_id, user_id, action,
                   entity_type, entity_id, commit_sha, created_at)
notifications     (id, user_id, type, payload, read, created_at)

-- Section templates (per project — consistency for page/option/role/block/prop)
project_section_templates (
  id, project_id, section,   -- 'page' | 'option' | 'role' | 'block' | 'prop'
  name, slug, body,          -- body = DSL fragment for that section (see dsl-rule.md)
  is_default BOOLEAN DEFAULT false,  -- at most one default per (project_id, section)
  sort_order INT DEFAULT 0,
  created_by, created_at, updated_at
)
-- UNIQUE (project_id, section, slug)

-- Template enforcement per section (SaaS — project settings)
project_template_policies (
  project_id, section,              -- PK; one policy per section per project
  mode,                             -- 'optional' | 'default' | 'forced'
  forced_template_id,               -- required when mode = 'forced' → FK templates.id
  updated_by, updated_at
)
-- CHECK: mode <> 'forced' OR forced_template_id IS NOT NULL
-- At most one forced template per (project_id, section) via forced_template_id
```

RLS: every tenant-scoped table has a `workspace_id` column. Use `SECURITY DEFINER`
functions for cross-table access.

### Folder-first content (desktop + SaaS)

Same mental model on disk and in git: a **root** contains nested folders of `.txt` DSL files.

| | Desktop | SaaS (Gitea) |
|---|---|---|
| **Root** | User-chosen directory (`select-folder`) | Project repo at branch ref (`main` / `test` / `tmp-*`) |
| **Paths** | Relative POSIX paths from root | Same paths in repo (`filepath_in_repo`) |
| **Listing** | Recursive `read-txt-files` | `GET /repos/.../git/trees/{sha}?recursive=1` → filter `*.txt` |
| **Save one** | `write-txt-file` | `writeDraft` → `diagram_drafts` row for that path |
| **Save all** | `write-txt-files` batch | `writeDraftMany` or loop drafts |
| **Checkpoint** | N/A (direct disk) | **One git commit** can update **multiple paths** (folder-level checkpoint) |
| **New folder** | `make-dir` on disk | commit `.gitkeep` or empty tree entry in git |

On project create, seed an initial folder tree in the repo (e.g. `diagrams/README.md` +
sample `.txt` paths) so SaaS and desktop layouts align. `diagrams` rows are synced from the
repo tree (insert on discover, soft-delete or hide when path removed on `main`).

**Not** one diagram per repo and **not** a flat file list — the **folder tree is the navigator**
in both products (shared `@swimlane-cloud/editor` sidebar).

### Project section templates (consistency)

Per [dsl-rule.md](dsl-rule.md), diagrams use seven sections; **five** are template-eligible
(headers/layout and reusable parts — not `/title/` or `/line/`):

| `section` | DSL marker | What templates standardize |
|---|---|---|
| `page` | `/page/` | Headers, footers, description (図全体のページ枠) |
| `option` | `/option/` | Gutter flags, column titles, display defaults |
| `role` | `/role/` | Lane styles (label, colors, icon) — one `<roleId>` block per insert |
| `block` | `/block/` | Reusable step shapes (`<blockId>` definitions) |
| `prop` | `/prop/` | Reusable prop chips (`<propId>` definitions) |

**Each project** defines **one or more named templates per section** (e.g. "Corporate page",
"Standard gutters", "Sales lane", "Terminal block"). Editors insert or merge fragments into
the active diagram — same pattern as `swimlane-app/apps/txt-editor` (`template-catalog.js`,
template modal), but **scoped to the project**, not global defaults only.

**Storage (two layers, same shape):**
- **SaaS:** `project_section_templates` table (source of truth for cloud projects).
- **Repo mirror (optional, recommended):** `templates/{section}/{slug}.txt` in the project
  repo so desktop open-folder and git history see the same library. Sync on template CRUD
  and include paths in folder checkpoints.

**Desktop (local folder):** if `templates/{section}/` exists under the opened root, load them
as the project library (no login). SaaS project maps the same paths from DB + git.

**Editor UX (shared package):**
- Project **Settings → Templates**: CRUD list grouped by section; preview via `parseDSLParts` /
  parts preview for `block` / `prop`.
- GUI: "Insert template" on section editors; **New diagram** can start from project defaults
  (`is_default` per section) composed into a full `.txt` skeleton.
- Text mode: optional snippet completion from template names.

```ts
// Optional EditorHost extension (SaaS + desktop folder)
listSectionTemplates?(section: 'page'|'option'|'role'|'block'|'prop'): Promise<
  { slug: string; name: string; body: string; isDefault?: boolean }[]
>;
getTemplatePolicies?(): Promise<
  Record<'page'|'option'|'role'|'block'|'prop', {
    mode: 'optional' | 'default' | 'forced';
    forcedTemplateId?: string;
    forcedBody?: string;
  }>
>;
```

### Force templates (SaaS per project)

Owners can **require** a specific template for any of the five sections — not only suggest it.
**Forced policy is SaaS-only** (stored in `project_template_policies`); desktop offline folders
are unaffected unless they sync the same project from the cloud.

| `mode` | Meaning |
|---|---|
| **`optional`** | Template library available; insert is voluntary (default for new projects). |
| **`default`** | New diagrams pre-fill `is_default` template; authors may change the section freely. |
| **`forced`** | Section **must** match the chosen template; edits that diverge are blocked or reverted. |

**When `mode = forced`** (per section, one pinned `forced_template_id`):

1. **New diagrams** — `/page/`, `/option/`, `/role/`, `/block/`, `/prop/` are initialized from
   the forced fragment (same as inserting that template on create).
2. **GUI** — section editor is **read-only** (banner: "Locked by project template: {name}").
   `/line/` and `/title/` stay editable.
3. **Text mode** — authors can type, but **draft save / checkpoint** runs server validation;
   reject with a clear diff hint if a forced section does not match (normalized compare of
   extracted section text vs `template.body`).
4. **Checkpoint & promote** — API validates **every** `.txt` in the batch before git write.
5. **Changing policy** — owner updates policy in Project Settings → Templates; optional
   "Apply to all diagrams on `test`" migration (rebase forced sections, leave `/line/` intact).

```js
function assertForcedSections(dslText, policies, templatesById) {
  for (const [section, policy] of Object.entries(policies)) {
    if (policy.mode !== 'forced') continue
    const expected = templatesById[policy.forced_template_id].body
    const actual = extractSection(dslText, section)  // parser helper
    if (normalizeSection(actual) !== normalizeSection(expected))
      throw new ApiError(422, `/${section}/ must match project template "${policy.name}"`)
  }
}
```

**Owner UI (SaaS):** per-section dropdown — Optional / Default / **Force** + pick which template
to pin. Cannot delete a template that is currently `forced_template_id` until policy is relaxed.

**Desktop:** no force unless connected to a SaaS project (host returns `getTemplatePolicies`).
Local-only folders keep optional templates under `templates/` only.

### Branch model (every project)

| Branch | Purpose | Server SVG? | Can merge into |
|---|---|---|---|
| **`main`** | Production; public sharing lives here | Only via versions promoted from `test` | — |
| **`test`** | Integration / staging | **Yes** — when user flags a commit as **new version** | `main` (flagged versions only) |
| **`tmp-*`** | Active edits (`tmp-{user}-{slug}`) | No — DSL in git only; preview on-device | `test` |

On project create: init repo with `main` and `test` branches (both tracked). Starting an edit
creates `tmp-*` from `test`. Checkpoints commit to the active `tmp-*` branch.

### SVG — only on "new version" flag

| Concern | Behavior |
|---|---|
| **Checkpoints** (`tmp-*`, `test`) | Git commit + optional message. **No** server render, **no** `svg_blobs` row. |
| **Flag new version** | User picks a commit on **`test`** → server renders SVG (deduped by `dsl_content_hash`), inserts `versions` row. |
| **Promote to main** | Merge/cherry-pick **only** if `versions.is_new_version` and commit matches; API rejects otherwise. |
| **History UI** | Commit list: on-device preview at ref. Version gallery: server SVG thumbnails. |
| **Dedup** | Same DSL hash → reuse existing `svg_blobs`; no duplicate Storage bytes. |

```js
// Called ONLY from POST /api/diagrams/[id]/versions  (flag new version on test)
async function resolveSvgBlob({ dslText, themeKey }) { /* same deduped upload as before */ }
```

### Public sharing (main only)

Versions on **`main`** with `public = true` get a stable `public_slug` URL:

| `share_mode` | What visitors see |
|---|---|
| `svg_only` | Read-only rendered diagram (server SVG) |
| `svg_and_dsl` | SVG + read-only DSL source |

Enforce: `public` may only be set when `promoted_to_main = true` (version exists on `main`).

## Phase 1 — Foundation & MVP

**Goal:** Embed the editor → browse project **folder tree** → save → checkpoint → history.
**Ship criteria:** Open project tree, edit multiple `.txt` files, Save all, checkpoint to git, browse history.

### Step 1.1 — SaaS Host (implement `EditorHost`)
The SaaS host mirrors the **desktop folder host**: same `list` / path-shaped `id`s / tree UI.
- `list` → recursive git tree at active branch ref → all `.txt` paths (like `read-txt-files`).
- `read` → draft row for path if present, else `GET .../contents/{path}?ref={branch}`.
- `writeDraft` / `writeDraftMany` → upsert `diagram_drafts` by `(project_id, filepath_in_repo, branch)`.
- `checkpoint` → one commit touching **all changed paths** in the batch (folder-level update).
The editor is unchanged; only the host differs from the desktop app.

### Step 1.2 — Infrastructure
```bash
# Gitea on VPS via Docker Compose
services:
  gitea:
    image: gitea/gitea:latest
    environment:
      - GITEA__server__DOMAIN=git.yourco.com
      - GITEA__security__INSTALL_LOCK=true
    volumes:
      - gitea_data:/data
    ports:
      - "3001:3000"
```
- Create a machine service account in Gitea → store token as `GITEA_ADMIN_TOKEN`
- Set up Next.js project with Supabase client + auth

### Step 1.3 — Workspace Onboarding
```
1. INSERT into workspaces
2. POST /api/v1/orgs → creates Gitea org (name = workspace.slug)
3. Create default project → POST /api/v1/orgs/{org}/repos (auto_init on main)
4. Ensure `test` branch exists (branch from main or empty commit on test)
5. Seed repo with initial **folder tree** (nested `.txt` paths, optional `README.md`)
6. Seed **section templates** — `templates/{page,option,role,block,prop}/*.txt` + rows in
   `project_section_templates` (one default per section for new diagrams)
7. INSERT into projects; sync `diagrams` rows from repo paths
```
Every project repo ships with **`main`** and **`test`** and a **directory of `.txt` files** —
same shape the desktop app expects when you open that folder locally.
Non-technical users see "Create workspace" → under the hood, Gitea is provisioned.

### Step 1.4 — Mount the Editor
- Render `@swimlane-cloud/editor` with the SaaS host.
- The editor provides GUI/text modes + live preview (Part A); the SaaS provides the file
  via `host.read` and persists via `host.writeDraft` / `host.checkpoint`.
- Project view: folder tree sidebar (all `.txt` in repo at active branch). Open any file → tab.
- Load content from draft or git at `filepath_in_repo` for active branch (`tmp-*` / `test` / `main`).
- Pass `projectId` into editor so GUI can load `project_section_templates` (API or local `templates/`).

### Step 1.7 — Project section templates (CRUD + force policy + editor)
**API (SaaS):**
- `GET/POST/PATCH/DELETE /api/projects/[id]/templates?section=role`
- Body: `{ name, slug, body, is_default? }` — validate `section` and parse `body` with
  `parseDSL` / `parseDSLParts` before save (reject invalid fragments).
- On write: upsert DB row + write `templates/{section}/{slug}.txt` in repo (`test` branch or
  direct commit per workspace policy).
- `GET/PATCH /api/projects/[id]/template-policies` — per-section `{ mode, forced_template_id? }`.
  PATCH `forced` requires `forced_template_id` belonging to same `project_id` + `section`.
- **Checkpoint / draft batch:** call `assertForcedSections` before persisting (Step 1.5).

**Editor (port from txt-editor):**
- Template modal / side panel: tabs **Page · Option · Role · Block · Prop**.
- **Insert** merges fragment into model (`mergeRole`, `mergeBlockProp`, or replace `/page/` /
  `/option/` block in serializer) — disabled for **forced** sections in GUI.
- **Apply default** when creating a new `.txt`; **apply forced** when policy `mode = forced`.
- Load `getTemplatePolicies()` on mount; lock forced section UIs; surface validation errors inline.

**Ship criteria:** Owner forces `/option/` to "Standard gutters"; author cannot checkpoint a
diagram with different `/option/` text; new diagrams inherit forced sections automatically.

### Save strategy — draft vs. checkpoint (grouped saves)

**Is commit-per-save too much?** Often yes for SaaS, even with SVG deduplication.

| Downside of commit-per-save | Why it hurts |
|---|---|
| Noisy history | "Updated diagram" every few minutes; hard to spot real milestones |
| Gitea/API load | Each save = git write + DB row; latency and rate limits add up |
| Audit confusion | Non-technical users think Save = "don't lose work", not "permanent history entry" |
| Merge/review noise | PRs accumulate micro-commits (mitigated by multi-file folder checkpoints, still watch volume) |
| Conflict churn | Frequent saves → more stale-SHA / 409 prompts when collaborating |

SVG dedup fixes **storage**, not **history noise** or **API churn**.

**Recommended: two actions (grouped saves)**

| Action | User label | What happens | In git history? |
|---|---|---|---|
| **Draft save** | Save | Persist current DSL to `diagram_drafts` (Postgres); fast, debounced autosave optional | No |
| **Checkpoint** | Save to history / Record change | One git commit on active `tmp-*` (or `test`); **no** server SVG | Yes |

- User edits freely → **Save** (or autosave) keeps work safe without polluting git.
- When a logical unit of work is done → **Checkpoint** on `tmp-*` with a short note → git
  history row (preview on-device). **Flag new version** on `test` when ready for SVG + promotion.
- **Desktop** stays simpler: **Save** = write `.txt` to disk (no git). Checkpoints are a SaaS concept.

```sql
-- (see B1) diagram_drafts keyed by (project_id, filepath_in_repo, branch)
```

**EditorHost (SaaS only extends the contract):**

```ts
interface EditorHost {
  // ... list, read, watch unchanged
  writeDraft(id: string, dsl: string): Promise<void>;   // Save — draft only
  checkpoint(id: string, dsl: string, opts?: { message?: string }): Promise<void>;  // git commit, no server SVG
  flagNewVersion?(commitSha: string, opts: { name: string; note?: string }): Promise<void>;  // test only → server SVG
}
```

Desktop host maps `writeDraft` → `writeTxtFile`; SaaS maps `checkpoint` → git commit flow below.
Optional: prompt for checkpoint message; disable checkpoint if draft equals last commit (no-op).

### Step 1.5 — Checkpoint (git commit) + draft save
**Draft save** — `POST /api/diagrams/[id]/draft` upserts `diagram_drafts`. No Gitea call.

**Checkpoint** — one git commit for **all dirty paths** in the project tree on the active
`tmp-*` branch (folder-level update). **No server SVG.**

```js
// CLIENT: Save → host.writeDraft(id, dsl)  |  Save all → host.writeDraftMany([...])
// CLIENT: "Save to history" → host.checkpoint({ message, files: dirtyFiles })

// SERVER: POST /api/projects/[projectId]/checkpoint
const branch = await activeBranch(session)  // tmp-* from edit_sessions
const changed = files.length ? files : await listDirtyDrafts(projectId, branch)

// Gitea: one commit updating multiple paths (tree API or sequential contents API + same message)
for (const { id: filepath, dsl } of changed) {
  await upsertRepoFile(owner, repo, filepath, dsl, branch, { partOfBatch: true })
}
await finalizeBatchCommit(owner, repo, branch, message, author)

await clearDrafts(projectId, branch, changed.map(f => f.id))
// NO resolveSvgBlob here
```
- `409` from Gitea → prompt "Reload latest?"
- On checkpoint: log to `audit_log`. Preview remains on-device only until a **new version** is flagged.
- Re-open: `diagram_drafts` if newer than branch tip, else git at active branch ref.

### Step 1.6 — History View
- Tabs or filter by branch: `tmp-*` (active edit), `test`, `main`.
- Commit sidebar: `GET /repos/.../commits?sha={branch}` — author, time, message.
- Click commit → load DSL at ref → **on-device** `textToSvg` for preview (no server SVG unless
  this commit is also a flagged version — then show stored thumbnail).
- **Versions** panel (separate): only rows from `versions` where `is_new_version` — server SVG
  thumbnails from `svg_blobs`. Badge commits on `test` that are eligible to flag.

---

## Phase 2 — New version flag + promote to main

**Goal:** Flag a commit on `test` as **new version** (server SVG); promote **only** flagged
versions to `main`; optional **public** sharing from `main`.
**Ship criteria:** Flag on `test` → SVG in gallery; blocked promote without flag; public link works.

### Step 2.1 — Flag new version (on `test` only)
User selects a commit on **`test`** and clicks **Flag as new version** (name + note).
This is the **only** trigger for server-side SVG render.

```js
// CLIENT: host.flagNewVersion(commitSha, { name, note })
// SERVER: POST /api/diagrams/[id]/versions
assert(branch(commitSha) === 'test', 'New version can only be flagged on test')

const dslText = await readFileAtRef(owner, repo, filepath, commitSha)
const svg_blob_id = await resolveSvgBlob({ dslText, themeKey: diagram.themeKey })

await supabase.from('versions').insert({
  diagram_id: id, name, commit_sha: commitSha, branch: 'test',
  svg_blob_id, is_new_version: true, promoted_to_main: false,
  public: false, share_mode: null, note, created_by: user.id,
})
await gitea.post(`/repos/${owner}/${repo}/tags`, {
  tag_name: slugify(name), target: commitSha, message: note,
})
```

### Step 2.2 — Promote to `main` (gated)
Only a version with `is_new_version = true` on `test` may be promoted. Merge the **exact
flagged commit** into `main` (cherry-pick or PR `test` → `main` with `version_id` validation).

```js
// POST /api/diagrams/[id]/versions/[versionId]/promote
const version = await loadVersion(versionId)
if (!version.is_new_version) throw new ApiError(400, 'Not a new-version commit')
if (version.branch !== 'test') throw new ApiError(400, 'Version must be flagged on test')

await gitea.post(`/repos/${owner}/${repo}/pulls`, {
  head: 'test', base: 'main', title: `Promote ${version.name}`,
  // API merges only the files/state at version.commit_sha, not all of test ahead
})
// On merge success:
await supabase.from('versions').update({ promoted_to_main: true }).eq('id', versionId)
```

API middleware on any `base: main` merge: **reject** unless linked `version_id` has
`is_new_version` and commit SHA matches.

### Step 2.3 — Version gallery
- List `versions` on `test` and `main` (filter: promoted / not promoted).
- Thumbnail = server `svg_blobs` only (flagged versions).
- Compare two flagged versions: side-by-side stored SVG + DSL diff.

### Step 2.4 — Public sharing (`main` only)
Owner toggles `public` + `share_mode` on a version that is `promoted_to_main`.

```js
// PATCH /api/diagrams/[id]/versions/[versionId]/public
assert(version.promoted_to_main && onMain(version.commit_sha))
await supabase.from('versions').update({
  public: true,
  share_mode: 'svg_only' | 'svg_and_dsl',
  public_slug: generateSlug(),
})
```

- Public route: `GET /p/{public_slug}` → render page with SVG; include read-only DSL panel
  if `share_mode = svg_and_dsl`. No auth required; no edit. Rate-limit + optional expiry later.

---

## Phase 3 — Edits on `tmp-*` and merge to `test`

**Goal:** Parallel edits on `tmp-*` branches; merge to `test`; flag versions there; promote to `main`.
**Ship criteria:** Start edit → `tmp-*` → checkpoint → merge to `test` → flag new version → promote.

### Step 3.1 — Start edit (`tmp-*` branch)
```js
// POST /api/projects/[id]/edits
const branchName = `tmp-${user.slug}-${slugify(editName)}`
await gitea.post(`/repos/${owner}/${repo}/branches`, {
  new_branch_name: branchName, old_branch_name: 'test'   // always branch from test
})
await supabase.from('edit_sessions').insert({
  project_id, branch_name: branchName, created_by: user.id, status: 'active'
})
```
- All checkpoints go to this `tmp-*` branch. No server SVG until user later flags on `test`.

### Step 3.2 — Merge `tmp-*` → `test`
```js
// POST /api/projects/[id]/edits/[editId]/merge-request
await gitea.post(`/repos/${owner}/${repo}/pulls`, {
  title, body, head: tmpBranch, base: 'test'   // never direct to main
})
```
- After merge: close `edit_sessions`. User may **flag new version** on the resulting `test` commit.

### Step 3.3 — Review UI
- **Left:** DSL diff (line-level).
- **Right:** SVG comparison via **on-device** render of base/head DSL at branch tips, *or*
  stored SVG if comparing two flagged versions on `test`.
- Promote-to-main is a separate action (Step 2.2), not a generic PR to `main`.

### Step 3.4 — Conflict Handling
Same visual chooser as before; apply resolution as new commit on `tmp-*`, re-merge to `test`.

---

## Phase 4 — Team & Workspace

**Goal:** Multi-user workspaces with roles, notifications, activity feed.

### Roles
| Role | Can do |
|---|---|
| Owner | Everything + billing + members + **template CRUD + force policy** + public sharing on `main` |
| Editor | Create, edit on `tmp-*`, merge to `test`, flag new version, promote request, **use templates** |
| Viewer | Read-only — history, versions, review merges to `test` |

### Invite Flow
- Owner invites by email → Supabase Auth invite email.
- On accept → insert `workspace_members` row with role.
- No Gitea account per user — only the bot service account exists in Gitea.

### Notifications
- Supabase Realtime on `notifications` (in-app) + email via Resend.
- Triggers: PR opened, PR merged, version flagged, review requested.

### Activity Feed
- Query `audit_log` per project, `created_at DESC`: actor, action, entity, timestamp.

---

## Phase 5 — Billing

### Plans
| Plan | Price | What's gated |
|---|---|---|
| Free | $0 | 1 user, 3 projects, history only |
| Team | ~$12/user/mo | Unlimited users, branches + PRs, version flagging |
| Enterprise | Custom | SSO, self-hosted, audit export, API |

### Implementation
- Stripe Checkout + Customer Portal.
- `workspaces.plan` checked in API middleware; Stripe webhook → `POST /api/billing/webhook`.
```js
function requirePlan(workspace, minPlan) {
  const order = ['free', 'team', 'enterprise']
  if (order.indexOf(workspace.plan) < order.indexOf(minPlan))
    throw new ApiError(403, 'Upgrade required')
}
```

---

## Phase 6 — Enterprise & Power Users

### SSO
- Supabase Auth OIDC: Entra ID / Google Workspace. Map SSO email domain → workspace auto-join.

### Self-Hosted Deployment
- Docker Compose bundle: Next.js + Gitea + Postgres (or customer Supabase). All config via env.

### Audit Export
- Export `audit_log` + commit log per project as CSV (user, action, timestamp, SHA, name).

### Public API
- `POST /api/v1/projects/{id}/draft` / `drafts/batch` / `checkpoint` → per-path drafts + folder-level git commit.
- `POST /api/v1/diagrams/{id}/versions` → flag **new version** on `test` (server renders SVG).
- `POST /api/v1/diagrams/{id}/versions/{vid}/promote` → promote flagged version to `main`.
- `GET /api/v1/p/{public_slug}` → public share (SVG only or SVG + DSL per `share_mode`).
- `GET /api/v1/diagrams/{id}/versions/{vid}/svg` → server SVG for flagged versions only.
- Local/offline: `npm install @swimlane-cloud/diagram-converter` (same engine as SaaS).

---

## Gitea API Reference

```js
const G = (path, opts = {}) =>
  fetch(`${GITEA_URL}/api/v1${path}`, {
    headers: {
      'Authorization': `token ${GITEA_ADMIN_TOKEN}`,
      'Content-Type':  'application/json',
    },
    ...opts,
  }).then(r => r.json())

// Org + repo
G('/orgs',              { method: 'POST', body: { username, visibility: 'private' } })
G(`/orgs/${org}/repos`, { method: 'POST', body: { name, private: true, auto_init: true } })

// Tree (folder-first listing)
G(`/repos/${o}/${r}/git/trees/${sha}?recursive=1`)                   // all paths → filter .txt

// File
G(`/repos/${o}/${r}/contents/${path}?ref=${branch}`)                // read one path
G(`/repos/${o}/${r}/contents/${path}`, { method: 'POST', body: {    // create/update one path
    message, content: btoa(dsl), sha, branch, author, committer }})
// Multi-path checkpoint: loop contents API sharing one commit message, or Gitea tree/commit API

// Branch / Tag / PR / Merge / History
G(`/repos/${o}/${r}/branches`, { method: 'POST', body: { new_branch_name: 'test', old_branch_name: 'main' } })
G(`/repos/${o}/${r}/branches`, { method: 'POST', body: { new_branch_name: 'tmp-…', old_branch_name: 'test' } })
G(`/repos/${o}/${r}/tags`,     { method: 'POST', body: { tag_name, target: 'main', message: note } })
G(`/repos/${o}/${r}/pulls`,    { method: 'POST', body: { title, body, head: branch, base: 'main' } })
G(`/repos/${o}/${r}/pulls/${index}/merge`, { method: 'POST', body: { Do: 'merge' } })
G(`/repos/${o}/${r}/commits?sha=${branch}&limit=30&page=1`)
```

---

## Build Order

```
── PRODUCT A: Online DSL Editor ─────────────────────────────────
Week 1     A1            Open-source engine package (parser + renderer)
Week 1-2   A2-A3         `@swimlane-cloud/editor`: GUI + text modes, preview, shell (ONE shared package)
Week 2     A4            EditorHost contract
Week 2-3   A5            Desktop app = thin Electron shell mounting the shared editor (only host + IPC)
             ↓ DESKTOP BETA (zero backend)
Week 3     A6            Standalone web app = same editor + browser-storage host  [optional]

── PRODUCT B: DSL Management SaaS ───────────────────────────────
Week 4     B0-B1, 1.1-1.3  Stack, data model, SaaS host, Gitea, workspace provisioning
Week 5-6   1.4-1.7        Mount editor, section templates, Save/checkpoint, history
             ↓ INTERNAL BETA
Week 7     2             Flag new version on test, promote to main, public sharing
Week 8-9   3             tmp-* edits, merge to test, review UI, conflicts
             ↓ CLOSED BETA
Week 10    4             Multi-user roles, invites, notifications
Week 11    5             Stripe billing, plan gates
             ↓ PUBLIC LAUNCH
Week 12+   6             SSO, self-hosted, public API, enterprise
```

---

## Key Decisions Made

| Decision | Choice | Reason |
|---|---|---|
| Product split | Editor (A) separate from SaaS (B) | Editor ships standalone; SaaS reuses it verbatim |
| Editor↔SaaS boundary | `EditorHost` adapter | Editor depends on storage interface, not on git |
| Editing modes | GUI + text over one DSL document | Non-technical (GUI) and power (text) users, loss-free round-trip |
| Live preview render | **On-device** (browser + Electron) | Instant, offline, per-keystroke, throwaway |
| Save model | **Draft** + **checkpoint** on `tmp-*` (git only, no server SVG) | Safe edits without render cost |
| Branch model | **`main` + `test` + `tmp-*`** per project | test = integration; tmp = isolated edits |
| New version | Explicit flag on **`test`** commit → server SVG (deduped) | SVG only when it matters |
| Promote gate | **Only `is_new_version` commits** may reach `main` | Production line stays intentional |
| Public share | **`main` versions**; `svg_only` or `svg_and_dsl` | Controlled external visibility |
| SVG storage | **Dedup by `dsl_content_hash`** | One blob per unique DSL content |
| Engine licensing | **Open source (MIT)**, SaaS closed | Engine portable/auditable; product logic proprietary |
| Engine distribution | One dependency-free npm package | Same renderer in browser, desktop, worker, Node, CI |
| Editor UI packaging | One `@swimlane-cloud/editor` package, consumed identically | Web/desktop/SaaS share one codebase; fix once, ship everywhere |
| Desktop scope | **Thin shell** — only Electron main + IPC + ~50-line host/mount, no UI | Minimal surface, max reuse, easy maintenance |
| Desktop shell | Electron + Vite + React | Proven in `txt-editor`; mounts the shared editor unchanged |
| Desktop storage | Plain local folder of `.txt` files, nested subfolders preserved | Local-first, no lock-in, git-friendly working copy |
| File browser | Folder **tree** derived from path-structured `FileRef.id`s | Real folder structure visible; one shared UI, no per-target tree code |
| Renderer/main split | `contextBridge` IPC, no `nodeIntegration` | Safe fs access, path-traversal guard |
| External edits | `chokidar` watch → non-destructive sync | Files stay the source of truth |
| Git backend | Gitea self-hosted | Full control, data residency, free |
| Tenancy | One Gitea org per workspace | Clean isolation |
| Repo structure | One repo per project = **folder tree of `.txt`** | Matches desktop open-folder; git tracks paths not single blob |
| Content unit | Folder root (desktop dir / SaaS repo) | Save all + folder checkpoints; same tree in both products |
| Section templates | Per project, five sections | Library + default; **SaaS force** pins one template per section |
| Template force | `project_template_policies.mode = forced` | Checkpoint rejected if section ≠ forced body; GUI read-only |
| SVG artifacts | Supabase Storage (`svg_blobs`), not git | Deduped by DSL hash; git holds `.txt` only |
| Auth | Supabase Auth + magic link | Simple for non-technical users |
| Conflict UI | Visual chooser, never raw markers | Non-technical users |
