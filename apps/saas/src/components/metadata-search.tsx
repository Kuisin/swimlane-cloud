"use client";

/**
 * Find documents across a project by the metadata they carry.
 *
 * The listing comes from one call to `/api/projects/[id]/metadata`, which is
 * the snapshot route's own read path with only the metadata returned — so a
 * search costs the same single pass over the branch the mobile view already
 * makes, and the file bodies never leave the server.
 *
 * Filtering itself is pure and lives in `metadata-schema.ts`, so what "matches"
 * means is the same here, in a test, and anywhere else that asks.
 */

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, FileText, Search, X } from "lucide-react";
import { useT } from "@/i18n";
import {
  filterableKeys,
  isEmptyValue,
  labelOf,
  metaText,
  searchDocuments,
  valuesInUse,
  type MetadataDocument,
  type MetadataField,
  type MetadataFilter,
} from "@/lib/metadata-schema";
import type { MetadataDocumentEntry } from "@/lib/types";

export function MetadataSearch({
  documents,
  fields,
  loading,
  error,
  onOpen,
}: {
  documents: MetadataDocumentEntry[] | null;
  fields: MetadataField[];
  loading: boolean;
  error: string | null;
  /** Open one of the results in the editor. */
  onOpen: (path: string) => void;
}) {
  const { t } = useT();
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<Record<string, string>>({});

  const docs: MetadataDocument[] = useMemo(
    () => (documents ?? []).map((d) => ({ path: d.path, meta: d.meta, carried: d.carried })),
    [documents],
  );

  const keys = useMemo(() => filterableKeys(docs, fields), [docs, fields]);
  const filters: MetadataFilter[] = Object.entries(picked)
    .filter(([, value]) => value !== "")
    .map(([key, value]) => ({ key, value, exact: true }));

  const results = useMemo(() => searchDocuments(docs, text, filters), [docs, text, filters]);
  const problemsByPath = useMemo(() => {
    const out: Record<string, number> = {};
    for (const d of documents ?? []) if (d.problems.length) out[d.path] = d.problems.length;
    return out;
  }, [documents]);

  // A filter whose key no longer appears anywhere would silently return
  // nothing, so it is dropped rather than left hanging over the results.
  useEffect(() => {
    setPicked((current) => {
      const next = Object.fromEntries(Object.entries(current).filter(([k]) => keys.includes(k)));
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }, [keys]);

  const chosen = Object.entries(picked).filter(([, v]) => v !== "");

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <label className="flex items-center gap-2 rounded-md border border-neutral-300 px-2 py-1.5 focus-within:border-indigo-500">
        <Search size={14} className="shrink-0 text-neutral-400" />
        <input
          value={text}
          autoFocus
          placeholder={t("search.placeholder")}
          onChange={(e) => setText(e.target.value)}
          className="min-w-0 flex-1 text-sm focus:outline-none"
        />
        {text && (
          <button
            type="button"
            onClick={() => setText("")}
            title={t("close")}
            className="shrink-0 text-neutral-400 hover:text-neutral-700"
          >
            <X size={14} />
          </button>
        )}
      </label>

      {keys.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {keys.map((key) => {
            const field = fields.find((f) => f.key === key);
            const values =
              field?.type === "enum" && field.values?.length
                ? field.values
                : valuesInUse(docs, key);
            if (!values.length) return null;
            return (
              <label key={key} className="flex items-center gap-1 text-xs text-neutral-500">
                {field ? labelOf(field) : key}
                <select
                  value={picked[key] ?? ""}
                  onChange={(e) => setPicked({ ...picked, [key]: e.target.value })}
                  className="rounded border border-neutral-300 px-1.5 py-0.5 text-xs text-neutral-800"
                >
                  <option value="">{t("search.any")}</option>
                  {values.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
          {chosen.length > 0 && (
            <button
              type="button"
              onClick={() => setPicked({})}
              className="text-xs text-neutral-400 underline hover:text-neutral-700"
            >
              {t("search.clear")}
            </button>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        {error ? (
          <p className="p-3 text-sm text-red-700">{error}</p>
        ) : loading ? (
          <p className="p-3 text-sm text-neutral-400">{t("loading")}</p>
        ) : results.length === 0 ? (
          <p className="p-3 text-sm text-neutral-400">{t("search.none")}</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {results.map((doc) => (
              <li key={doc.path}>
                <button
                  type="button"
                  onClick={() => onOpen(doc.path)}
                  className="flex w-full items-start gap-2 px-2 py-2 text-left hover:bg-neutral-50"
                >
                  <FileText size={14} className="mt-0.5 shrink-0 text-neutral-400" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm text-neutral-800">{doc.path}</span>
                      {problemsByPath[doc.path] && (
                        <span
                          title={t("search.hasProblems")}
                          className="inline-flex shrink-0 items-center gap-0.5 rounded bg-red-50 px-1 text-[10px] text-red-700"
                        >
                          <AlertTriangle size={10} />
                          {problemsByPath[doc.path]}
                        </span>
                      )}
                    </span>
                    <MetaSummary doc={doc} fields={fields} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-[11px] text-neutral-400">
        {t("search.count", { n: String(results.length), total: String(docs.length) })}
      </p>
    </div>
  );
}

/** The metadata worth showing under a result: declared keys first, then the rest. */
function MetaSummary({ doc, fields }: { doc: MetadataDocument; fields: MetadataField[] }) {
  const declared = fields.map((f) => f.key);
  const keys = [
    ...declared.filter((k) => !isEmptyValue(doc.meta[k])),
    ...Object.keys(doc.meta).filter((k) => !declared.includes(k) && !isEmptyValue(doc.meta[k])),
  ].slice(0, 4);
  if (!keys.length) return null;
  return (
    <span className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
      {keys.map((key) => (
        <span key={key} className="text-[11px] text-neutral-500">
          <span className="font-mono text-neutral-400">{key}</span> {metaText(doc.meta[key])}
        </span>
      ))}
    </span>
  );
}
