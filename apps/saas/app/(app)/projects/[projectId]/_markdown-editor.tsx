"use client";

/**
 * The Document view: a WYSIWYG surface for a `.md` file's prose, plus a form
 * for its frontmatter metadata.
 *
 * The diagram never reaches this editor. `markdown-prose.ts` lifts the fence
 * out first and puts it back verbatim on save, so nothing a markdown
 * serializer does to the prose can disturb the DSL — see the note there.
 *
 * Milkdown touches `document` at construction, so this file is only ever
 * reached through a `next/dynamic({ ssr: false })` import. It is composed from
 * `@milkdown/kit` rather than `@milkdown/crepe`, whose batteries pull Vue,
 * CodeMirror and katex into the bundle for features this does not use.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Editor, defaultValueCtx, editorViewOptionsCtx, rootCtx } from "@milkdown/kit/core";
import { history } from "@milkdown/kit/plugin/history";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { Plus, Trash2 } from "lucide-react";
import { useT } from "@/i18n";
import { fromProse, toProse, type MarkdownParts } from "@/lib/markdown-prose";
import "./markdown-editor.css";

function Surface({
  initial,
  readOnly,
  onChange,
}: {
  initial: string;
  readOnly: boolean;
  onChange: (markdown: string) => void;
}) {
  // The editor is created once per document; `onChange` is read through a ref
  // so a new callback identity never tears down the editor and takes the
  // caret with it.
  const changed = useRef(onChange);
  useEffect(() => {
    changed.current = onChange;
  }, [onChange]);

  useEditor(
    (root) =>
      Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, root);
          ctx.set(defaultValueCtx, initial);
          ctx.update(editorViewOptionsCtx, (prev) => ({
            ...prev,
            editable: () => !readOnly,
          }));
          ctx.get(listenerCtx).markdownUpdated((_ctx, markdown, previous) => {
            if (markdown !== previous) changed.current(markdown);
          });
        })
        .use(commonmark)
        .use(gfm)
        .use(history)
        .use(listener),
    [],
  );

  return <Milkdown />;
}

/** The frontmatter editor: `/meta/` is not editable anywhere else in the GUI. */
function MetadataForm({
  meta,
  readOnly,
  onChange,
}: {
  meta: Record<string, string>;
  readOnly: boolean;
  onChange: (next: Record<string, string>) => void;
}) {
  const { t } = useT();
  const [newKey, setNewKey] = useState("");
  const entries = Object.entries(meta);

  const setValue = (key: string, value: string) => onChange({ ...meta, [key]: value });
  const remove = (key: string) => {
    const next = { ...meta };
    delete next[key];
    onChange(next);
  };
  const add = () => {
    const key = newKey.trim();
    if (!key || key in meta) return;
    onChange({ ...meta, [key]: "" });
    setNewKey("");
  };

  return (
    <div className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {t("md.metadata")}
      </h2>
      {entries.length === 0 && <p className="text-xs text-neutral-400">{t("md.noMetadata")}</p>}
      {entries.map(([key, value]) => (
        <div key={key} className="flex items-center gap-2">
          <span className="w-24 shrink-0 truncate font-mono text-xs text-neutral-500" title={key}>
            {key}
          </span>
          <input
            value={value}
            disabled={readOnly}
            onChange={(e) => setValue(key, e.target.value)}
            className="min-w-0 flex-1 rounded-md border border-neutral-300 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none disabled:bg-neutral-50"
          />
          {!readOnly && (
            <button
              type="button"
              onClick={() => remove(key)}
              title={t("common.delete")}
              className="rounded-md p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      ))}
      {!readOnly && (
        <div className="flex items-center gap-2 pt-1">
          <input
            value={newKey}
            placeholder={t("md.newKey")}
            onChange={(e) => setNewKey(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            className="w-24 shrink-0 rounded-md border border-neutral-300 px-2 py-1 font-mono text-xs focus:border-indigo-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={add}
            disabled={!newKey.trim()}
            className="inline-flex items-center gap-1 rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-600 hover:border-indigo-400 hover:text-indigo-600 disabled:opacity-40"
          >
            <Plus size={13} /> {t("md.addKey")}
          </button>
        </div>
      )}
    </div>
  );
}

export default function MarkdownEditor({
  path,
  stored,
  readOnly = false,
  onSave,
}: {
  path: string;
  /** The file exactly as stored: frontmatter, prose and (maybe) the fence. */
  stored: string;
  readOnly?: boolean;
  onSave: (path: string, next: string) => void;
}) {
  const { t } = useT();
  // Re-derived only when the document itself changes, so typing does not
  // rebuild the parts (and the fence) on every keystroke.
  const initial = useMemo<MarkdownParts>(() => toProse(stored), [stored]);
  const [meta, setMeta] = useState(initial.meta);
  const proseRef = useRef(initial.prose);

  useEffect(() => {
    setMeta(initial.meta);
    proseRef.current = initial.prose;
  }, [initial]);

  const save = useCallback(
    (nextMeta: Record<string, string>, nextProse: string) => {
      onSave(path, fromProse({ ...initial, meta: nextMeta }, nextProse));
    },
    [initial, onSave, path],
  );

  const onProseChange = useCallback(
    (markdown: string) => {
      proseRef.current = markdown;
      save(meta, markdown);
    },
    [meta, save],
  );

  const onMetaChange = useCallback(
    (next: Record<string, string>) => {
      setMeta(next);
      save(next, proseRef.current);
    },
    [save],
  );

  return (
    <div className="flex h-full min-h-0 bg-white">
      <div className="min-w-0 flex-1 overflow-auto">
        <div className="sw-md mx-auto max-w-3xl">
          {initial.fence && (
            <p className="mx-5 mt-4 rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-xs text-indigo-700">
              {t("md.diagramNotice")}
            </p>
          )}
          {/* Keyed by path: switching files builds a fresh editor rather than
              trying to reconcile one document's state onto another's. */}
          <MilkdownProvider key={path}>
            <Surface initial={initial.prose} readOnly={readOnly} onChange={onProseChange} />
          </MilkdownProvider>
        </div>
      </div>
      <aside className="hidden w-72 shrink-0 overflow-auto border-l border-neutral-200 bg-neutral-50 p-4 lg:block">
        <MetadataForm meta={meta} readOnly={readOnly} onChange={onMetaChange} />
      </aside>
    </div>
  );
}
