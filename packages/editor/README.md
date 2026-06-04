# @swimlane-cloud/editor

The shared DSL editor surface for the Swimlane Cloud monorepo. Desktop, web, and
SaaS apps all mount the same `<DslEditor>` component; everything app-specific
(git, auth, networking, Electron, the file system) is injected through a single
storage-agnostic `EditorHost` prop.

The editor renders against the DOM-free `@swimlane-cloud/diagram-converter`
engine: live preview is produced by calling `textToSvg(src, { themeKey })` and
injecting the returned SVG **string**. There is no React `<Diagram>` component.

## Usage

```jsx
import { DslEditor } from "@swimlane-cloud/editor";
import "@swimlane-cloud/editor/styles.css";

export function App({ host }) {
  return <DslEditor host={host} projectId="proj_123" options={{ themeKey: "basic" }} />;
}
```

`options` (all optional): `{ themeKey, initialMode: "text"|"gui", initialSplit: number, initialTreeWidth: number, lang: "en"|"ja" }`.

### Localization (English + Japanese)

The UI ships English and Japanese dictionaries. The initial language comes from
`options.lang`, else the browser language, else English; users switch live with
the **language toggle** in the sub-bar. Consumers can also read or set the
language programmatically:

```jsx
import { useT, LanguageProvider, LANGUAGES } from "@swimlane-cloud/editor";

function Toolbar() {
  const { t, lang, setLang } = useT();  // inside a <DslEditor> (provider is built in)
  return <span>{t("action.save")}</span>;
}
```

`<DslEditor>` wraps its own `LanguageProvider`; `LanguageProvider`/`LANGUAGES`
are exported for mounting a shared toggle outside the editor. Adding a language
is one more entry in `src/i18n.jsx` (a test asserts every dictionary has the
same keys).

The editor mounts a full surface:

- **Folder tree + tabs** — a nested tree built by splitting each `FileRef.id` on
  `/` (ids are POSIX relative paths like `ops/onboarding/flow.txt`). Files open
  via `host.read`; switching away from a dirty tab prompts to discard.
- **Resizable panels** — drag the folder-tree edge, the editor/preview divider,
  and (in GUI mode) the inspector edge.
- **Mode toggle** — GUI ⇄ Text over the *same* DSL document, with a loss-free
  round trip through the serializer. If the text has parse errors, GUI mode is
  disabled and the error list is shown (non-blocking).
- **Action bar** — Save / Save all / New file / New folder / Export (.txt) /
  Templates / Help / Format (text mode). Checkpoint, Flag version, and template
  forcing appear only when the host advertises those capabilities.
- **GUI mode** — flow step list with localized, color-coded type badges + lane
  chips, step inspector (role, text, label, desc, remark, block style, arrow,
  merge id, props), branch/section inspector, color presets, and
  section-template insertion. The block and prop pickers each have an eye button
  that opens a **design preview popup** (rendered via the engine) while the
  dropdown/chips stay the primary way to pick.
- **Step reordering** — drag a step within its branch level to drop it at a new
  position, or use the inspector's "Move to…" popup to jump it to a specific
  slot. Both stay inside the step's branch frame so structure is preserved.

## EditorHost contract

`DslEditor` is driven entirely by `host`. Only `list`, `read`, `writeDraft`, and
`create` are required; every other member is feature-detected before use. An
adapter that implements only the required four works fully (read/edit/save/new).

```ts
interface FileRef { id: string; name: string; mtime?: number }

interface EditorHost {
  // --- required ---
  list(): Promise<FileRef[]>;                       // all files (flat, POSIX ids)
  read(id: string): Promise<string>;                // file contents
  writeDraft(id: string, dsl: string): Promise<void>;
  create(id: string, dsl: string): Promise<void>;

  // --- optional ---
  root?(): Promise<string | null>;
  writeDraftMany?(updates: { id: string; dsl: string }[]): Promise<void>; // "Save all"
  mkdir?(dirPath: string): Promise<void>;           // "New folder"
  watch?(cb: (e: { id: string; dsl: string | null; type: "add"|"change"|"unlink" }) => void): () => void;
  checkpoint?(opts: { message?: string; files?: { id: string; dsl: string }[] }): Promise<void>;
  flagNewVersion?(commitSha: string, opts: { name: string; note?: string }): Promise<void>;
  listSectionTemplates?(section: "page"|"option"|"role"|"block"|"prop"):
    Promise<{ slug: string; name: string; body: string; isDefault?: boolean }[]>;
  getTemplatePolicies?(): Promise<Record<string, {
    mode: "optional" | "default" | "forced";
    forcedTemplateId?: string;
    forcedBody?: string;
  }>>;
  capabilities?: { readOnly?: boolean; versioning?: boolean };
}
```

### Capability gating

| Feature | Shown when |
| --- | --- |
| New folder | `host.mkdir` present |
| Save all | always (falls back to looped `writeDraft` if `writeDraftMany` absent) |
| Checkpoint | `host.checkpoint` present |
| Flag version | `capabilities.versioning` **and** `host.flagNewVersion` present |
| Templates | always (panel reports "not provided" if `listSectionTemplates` absent) |
| Forced section lock | `getTemplatePolicies()` returns `{ mode: "forced" }` → insert disabled |
| Read-only | `capabilities.readOnly` disables all editing/persistence |

External edits delivered through `host.watch` are merged into non-dirty open
documents and refresh the file list.

## Public exports (`src/index.jsx`)

- `DslEditor` — the editor component.
- `FileEditorProvider` — the context provider (used internally by `DslEditor`;
  exported for advanced/custom shells).
- `useEditor` — hook to read the editor context inside a provider.
- `serializeDSL`, `formatDsl`, `mergeSectionTemplate` — pure DSL utilities.
- `parseGuiModel`, `applyModelEdit` — GUI model helpers.
- `DEFAULT_TAB_TEMPLATE`, `isDocumentDirty`, `createDocument`,
  `normalizeNewTxtRelPath`, `normalizeDirPath` — document-model helpers.
- `buildFolderTree` — flat ids → nested tree.
- `TEMPLATE_SECTIONS`, `hostHas`, `hostSupportsVersioning`, `hostIsReadOnly` —
  host contract helpers.

Also ships `@swimlane-cloud/editor/styles.css` — a self-contained, `sw-`
prefixed stylesheet (no Tailwind dependency).

## Notes / limitations

- Text mode uses a styled `<textarea>` (Monaco/CodeMirror are not dependencies).
- The DSL serializer and branch/group geometry helpers are vendored from the
  engine internals (`src/lib/serialize-dsl.js`, `src/lib/branch-rows.js`),
  because the engine's public API is parse/render only. They round-trip
  losslessly with the engine's `parseDSL`; keep them in sync if the engine's row
  model changes.
```
