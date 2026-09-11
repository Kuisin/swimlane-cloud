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
import { AlertTriangle, Lock, Plus, Trash2, X } from "lucide-react";
import { useT } from "@/i18n";
import {
  carriedValues,
  fromProse,
  toProse,
  unwritableKeys,
  type MarkdownParts,
} from "@/lib/markdown-prose";
import {
  booleanValueOf,
  hasFillableDefaults,
  isMapValue,
  isMetadataKey,
  labelOf,
  listItemsOf,
  mapEntriesOf,
  metaText,
  metadataRows,
  type MapEntry,
  problemsByKey,
  removeMetaKey,
  validateMetadata,
  withDefaults,
  withoutCarried,
  BOOLEAN_FALSE,
  BOOLEAN_TRUE,
  type MetaRecord,
  type MetaRow,
  type MetaValue,
  type MetadataField,
  type MetadataProblem,
} from "@/lib/metadata-schema";
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

const INPUT =
  "min-w-0 w-full rounded-md border border-neutral-300 px-2 py-1 text-sm focus:border-indigo-500 focus:outline-none disabled:bg-neutral-50";

/** One key's editor, chosen by the type the project declared for it. */
function ValueControl({
  row,
  readOnly,
  invalid,
  onChange,
}: {
  row: MetaRow;
  readOnly: boolean;
  invalid: boolean;
  onChange: (value: MetaValue) => void;
}) {
  const { t } = useT();
  const type = row.field?.type ?? guessType(row.value);
  const border = invalid ? "border-red-400" : "";
  const text = metaText(row.value);

  switch (type) {
    case "text":
      return (
        <textarea
          value={text}
          rows={3}
          disabled={readOnly}
          onChange={(e) => onChange(e.target.value)}
          className={`${INPUT} ${border} resize-y`}
        />
      );
    case "enum": {
      const values = row.field?.values ?? [];
      return (
        <select
          value={text}
          disabled={readOnly}
          onChange={(e) => onChange(e.target.value)}
          className={`${INPUT} ${border}`}
        >
          <option value="">{t("md.field.none")}</option>
          {values.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
          {/* A value the schema has since dropped is still offered, or choosing
              anything else would be the only way to find out what it was. */}
          {text !== "" && !values.includes(text) && (
            <option value={text}>{t("md.field.offList", { value: text })}</option>
          )}
        </select>
      );
    }
    case "list":
      return <ListControl items={listItemsOf(row.value)} readOnly={readOnly} onChange={onChange} />;
    case "date":
      return (
        <input
          type="date"
          value={/^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ""}
          disabled={readOnly}
          onChange={(e) => onChange(e.target.value)}
          className={`${INPUT} ${border}`}
        />
      );
    case "number":
      return (
        <input
          type="number"
          value={text}
          disabled={readOnly}
          onChange={(e) => onChange(e.target.value)}
          className={`${INPUT} ${border}`}
        />
      );
    case "boolean":
      return (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={booleanValueOf(row.value)}
            disabled={readOnly}
            onChange={(e) => onChange(e.target.checked ? BOOLEAN_TRUE : BOOLEAN_FALSE)}
          />
          {booleanValueOf(row.value) ? t("md.field.yes") : t("md.field.no")}
        </label>
      );
    case "map":
      return <MapControl value={row.value} readOnly={readOnly} onChange={onChange} />;
    default:
      return (
        <input
          value={text}
          disabled={readOnly}
          placeholder={metaText(row.field?.default)}
          onChange={(e) => onChange(e.target.value)}
          className={`${INPUT} ${border}`}
        />
      );
  }
}

/** What control an undeclared key gets: whatever its value already looks like. */
function guessType(value: MetaValue): MetadataField["type"] {
  if (Array.isArray(value)) return "list";
  if (isMapValue(value)) return "map";
  return "string";
}

/** A tag editor: one chip per item, so a comma inside a value cannot split it. */
function ListControl({
  items,
  readOnly,
  onChange,
}: {
  items: string[];
  readOnly: boolean;
  onChange: (value: string[]) => void;
}) {
  const { t } = useT();
  const [draft, setDraft] = useState("");
  const add = () => {
    const value = draft.trim();
    setDraft("");
    if (!value || items.includes(value)) return;
    onChange([...items, value]);
  };
  return (
    <div className="space-y-1">
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {items.map((item) => (
            <span
              key={item}
              className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700"
            >
              {item}
              {!readOnly && (
                <button
                  type="button"
                  title={t("common.delete")}
                  onClick={() => onChange(items.filter((v) => v !== item))}
                  className="text-indigo-400 hover:text-red-600"
                >
                  <X size={11} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      {!readOnly && (
        <input
          value={draft}
          placeholder={t("md.field.addItem")}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={add}
          onKeyDown={(e) => {
            if (e.key !== "Enter" && e.key !== ",") return;
            e.preventDefault();
            add();
          }}
          className={INPUT}
        />
      )}
    </div>
  );
}

/**
 * A nested map, edited one level of key/value pairs at a time.
 *
 * That is a limit of this control, not of the type: a `map` is any plain object
 * and `validateMetadata` accepts one nested to any depth. An entry that is
 * itself a list or a map is therefore shown as a line and refused as an edit —
 * `mapEntriesOf` marks which — rather than being flattened into text the box
 * would then write back over the structure.
 */
function MapControl({
  value,
  readOnly,
  onChange,
}: {
  value: MetaValue;
  readOnly: boolean;
  onChange: (value: Record<string, MetaValue>) => void;
}) {
  const { t } = useT();
  const source = isMapValue(value) ? value : {};
  const entries = mapEntriesOf(value);

  /**
   * Rebuild the map from the rows, keeping the original value of any row this
   * editor can only show. An entry that is itself a list or a map is rendered
   * as one line of text; writing that text back would replace the structure
   * with a description of it, so the structure is carried across untouched.
   */
  const rebuild = (change: (entry: MapEntry) => [string, MetaValue] | null) => {
    const next: Record<string, MetaValue> = {};
    for (const entry of entries) {
      const kept = change(entry);
      if (kept) next[kept[0]] = kept[1];
    }
    onChange(next);
  };
  const valueOf = (entry: MapEntry): MetaValue =>
    entry.editable ? entry.text : (source[entry.key] as MetaValue);

  return (
    <div className="space-y-1">
      {entries.map((entry) => (
        <div key={entry.key} className="flex items-center gap-1">
          <input
            value={entry.key}
            disabled={readOnly}
            onChange={(e) =>
              rebuild((row) =>
                row.key === entry.key ? [e.target.value, valueOf(row)] : [row.key, valueOf(row)],
              )
            }
            className={`${INPUT} w-24 shrink-0 font-mono text-xs`}
          />
          <input
            value={entry.text}
            disabled={readOnly || !entry.editable}
            title={entry.editable ? undefined : t("md.field.nested")}
            onChange={(e) =>
              rebuild((row) =>
                row.key === entry.key ? [row.key, e.target.value] : [row.key, valueOf(row)],
              )
            }
            className={INPUT}
          />
          {!readOnly && (
            <button
              type="button"
              title={t("common.delete")}
              onClick={() =>
                rebuild((row) => (row.key === entry.key ? null : [row.key, valueOf(row)]))
              }
              className="rounded p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      ))}
      {!readOnly && (
        <button
          type="button"
          onClick={() => onChange({ ...source, "": "" })}
          disabled={entries.some((entry) => entry.key === "")}
          className="inline-flex items-center gap-1 rounded-md border border-neutral-300 px-2 py-0.5 text-xs text-neutral-600 hover:border-indigo-400 hover:text-indigo-600 disabled:opacity-40"
        >
          <Plus size={12} /> {t("md.field.addPair")}
        </button>
      )}
    </div>
  );
}

/** One problem as a sentence, in the reader's language. */
function problemText(
  problem: MetadataProblem,
  t: (key: string, vars?: Record<string, string>) => string,
): string {
  switch (problem.code) {
    case "required":
      return t("md.problem.required");
    case "enum":
      return t("md.problem.enum", { values: (problem.values ?? []).join(", ") });
    case "date":
      return t("md.problem.date");
    default:
      return t("md.problem.type", { type: t(`metadata.type.${problem.type}`) });
  }
}

/**
 * The frontmatter editor: `/meta/` is not editable anywhere else in the GUI.
 *
 * Schema-driven where the project has declared one, and a plain key/value list
 * where it has not — a key somebody wrote by hand is shown and kept either way,
 * because the schema says what a document *should* hold, not all it may hold.
 */
function MetadataForm({
  meta,
  fields,
  carried,
  frozen,
  readOnly,
  onChange,
}: {
  meta: MetaRecord;
  fields: MetadataField[];
  /** Keys the engine can only carry verbatim, with the lines it holds them on. */
  carried: Map<string, string[]>;
  /** The whole block is unrewritable — see `rewritable` in markdown-prose.ts. */
  frozen: boolean;
  readOnly: boolean;
  onChange: (next: MetaRecord) => void;
}) {
  const { t } = useT();
  const [newKey, setNewKey] = useState("");
  const rows = metadataRows(meta, fields, carried);
  const problems = problemsByKey(
    withoutCarried(validateMetadata(meta, fields), [...carried.keys()]),
  );
  // Per-key only. When the whole block is frozen the banner above says so once,
  // and repeating it on every row would bury the fields' own problems.
  const unwritable = new Set(frozen ? [] : unwritableKeys(meta));

  const setValue = (key: string, value: MetaValue) => onChange({ ...meta, [key]: value });

  // The same rule the settings page holds a declared key to. The engine can
  // write a key holding a `:` or a space — it quotes it — but nobody wants to
  // read `"a: b": v` in their own file, and a key with a colon in it is a key
  // every other YAML reader will disagree with us about. Refused at the input.
  const typedKey = newKey.trim();
  const canAdd = isMetadataKey(typedKey) && !(typedKey in meta) && !carried.has(typedKey);
  const add = () => {
    if (!canAdd) return;
    onChange({ ...meta, [typedKey]: "" });
    setNewKey("");
  };

  return (
    <div className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {t("md.metadata")}
      </h2>
      {rows.length === 0 && <p className="text-xs text-neutral-400">{t("md.noMetadata")}</p>}

      {frozen && (
        <p className="flex items-start gap-1 rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          {t("md.frozen")}
        </p>
      )}

      {!readOnly && !frozen && hasFillableDefaults(meta, fields) && (
        <button
          type="button"
          onClick={() => onChange(withDefaults(meta, fields))}
          className="w-full rounded-md border border-dashed border-neutral-300 px-2 py-1 text-xs text-neutral-500 hover:border-indigo-400 hover:text-indigo-600"
        >
          {t("md.applyDefaults")}
        </button>
      )}

      {rows.map((row) => {
        if (row.kind === "carried") {
          return (
            <div key={`carried:${row.key}`} className="space-y-1">
              <span className="flex items-center gap-1 font-mono text-xs text-neutral-500">
                <Lock size={11} /> {row.key}
              </span>
              <pre className="overflow-x-auto rounded-md border border-neutral-200 bg-neutral-100 p-2 text-[11px] leading-tight text-neutral-600">
                {(row.lines ?? []).join("\n")}
              </pre>
              <p className="text-[11px] text-neutral-400">{t("md.carried")}</p>
            </div>
          );
        }
        const keyProblems = problems[row.key] ?? [];
        return (
          <div key={row.key} className="space-y-1">
            <div className="flex items-center gap-1">
              <span
                className="min-w-0 flex-1 truncate text-xs font-medium text-neutral-600"
                title={row.key}
              >
                {row.field ? labelOf(row.field) : row.key}
                {row.field?.required && <span className="text-red-500"> *</span>}
              </span>
              {row.kind === "extra" && (
                <span className="shrink-0 rounded bg-neutral-200 px-1 text-[10px] text-neutral-600">
                  {t("md.undeclared")}
                </span>
              )}
              {!readOnly && row.present && (
                <button
                  type="button"
                  onClick={() => onChange(removeMetaKey(meta, row.key))}
                  title={t("common.delete")}
                  className="shrink-0 rounded-md p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
            <ValueControl
              row={row}
              readOnly={readOnly}
              invalid={keyProblems.length > 0}
              onChange={(value) => setValue(row.key, value)}
            />
            {row.field?.help && <p className="text-[11px] text-neutral-400">{row.field.help}</p>}
            {keyProblems.map((problem, i) => (
              <p key={i} className="flex items-start gap-1 text-[11px] text-red-600">
                <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                {problemText(problem, t)}
              </p>
            ))}
            {unwritable.has(row.key) && (
              <p className="flex items-start gap-1 text-[11px] text-amber-700">
                <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                {t("md.notWritable")}
              </p>
            )}
          </div>
        );
      })}

      {!readOnly && (
        <div className="space-y-1 pt-1">
          <div className="flex items-center gap-2">
            <input
              value={newKey}
              placeholder={t("md.newKey")}
              onChange={(e) => setNewKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              className={`w-24 shrink-0 rounded-md border px-2 py-1 font-mono text-xs focus:outline-none ${
                typedKey && !canAdd
                  ? "border-red-400"
                  : "border-neutral-300 focus:border-indigo-500"
              }`}
            />
            <button
              type="button"
              onClick={add}
              disabled={!canAdd}
              className="inline-flex items-center gap-1 rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-600 hover:border-indigo-400 hover:text-indigo-600 disabled:opacity-40"
            >
              <Plus size={13} /> {t("md.addKey")}
            </button>
          </div>
          {typedKey && !canAdd && (
            <p className="text-[11px] text-red-600">
              {typedKey in meta || carried.has(typedKey)
                ? t("md.keyExists")
                : t("md.keyNotAllowed")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function MarkdownEditor({
  path,
  stored,
  fields = [],
  readOnly = false,
  onSave,
}: {
  path: string;
  /** The file exactly as stored: frontmatter, prose and (maybe) the fence. */
  stored: string;
  /** The project's declared metadata schema; empty when it has none. */
  fields?: MetadataField[];
  readOnly?: boolean;
  onSave: (path: string, next: string) => void;
}) {
  const { t } = useT();
  // Re-derived only when the document itself changes, so typing does not
  // rebuild the parts (and the fence) on every keystroke.
  const initial = useMemo<MarkdownParts>(() => toProse(stored), [stored]);
  const carried = useMemo(() => carriedValues(initial.shape), [initial]);
  const [meta, setMeta] = useState<MetaRecord>(initial.meta);
  const proseRef = useRef(initial.prose);

  useEffect(() => {
    setMeta(initial.meta);
    proseRef.current = initial.prose;
  }, [initial]);

  const save = useCallback(
    (nextMeta: MetaRecord, nextProse: string) => {
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
    (next: MetaRecord) => {
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
        <MetadataForm
          meta={meta}
          fields={fields}
          carried={carried}
          frozen={!initial.rewritable}
          readOnly={readOnly}
          onChange={onMetaChange}
        />
      </aside>
    </div>
  );
}
