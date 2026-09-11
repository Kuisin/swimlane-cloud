"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { INTEGRATION_BRANCH } from "@swimlane-cloud/github-client";
import { patchJson } from "@/lib/client";
import {
  METADATA_FIELD_TYPES,
  isMetadataKey,
  metaText,
  type MetadataField,
  type MetadataFieldType,
} from "@/lib/metadata-schema";
import { ProjectPage, describeError, useProject } from "../../_components";
import { useT } from "@/i18n";

/** Types whose value comes from a fixed list the owner writes here. */
const HAS_CHOICES: MetadataFieldType = "enum";

const field = "rounded border border-neutral-300 px-2 py-1 text-sm";

/**
 * The document-metadata schema: which keys a `.md`'s frontmatter may hold, what
 * kind of value each one takes, and which are required.
 *
 * Saved into `swimlane-settings.json` on `main` through the same settings write
 * path as the diagram settings and template modes, so a repository keeps its
 * schema wherever it is opened — including by hand on GitHub.
 */
export default function MetadataSettingsPage() {
  const { projectId, state, refresh, error } = useProject();
  const { t } = useT();
  const [fields, setFields] = useState<MetadataField[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const isOwner = state?.me.role === "owner";
  const base = `/api/projects/${projectId}`;

  useEffect(() => {
    if (!state || fields) return;
    setFields(state.settings.metadata?.fields ?? []);
  }, [state, fields]);

  const patch = (index: number, change: Partial<MetadataField>) =>
    setFields((current) => (current ?? []).map((f, i) => (i === index ? { ...f, ...change } : f)));

  const move = (index: number, by: number) =>
    setFields((current) => {
      const next = [...(current ?? [])];
      const to = index + by;
      if (to < 0 || to >= next.length) return next;
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });

  const remove = (index: number) =>
    setFields((current) => (current ?? []).filter((_, i) => i !== index));

  const add = () =>
    setFields((current) => [...(current ?? []), { key: "", type: "string" as MetadataFieldType }]);

  /** The first thing wrong with the form, or null when it may be saved. */
  const problem = (() => {
    const list = fields ?? [];
    const seen = new Set<string>();
    for (const f of list) {
      const key = f.key.trim();
      if (!key) return t("metadata.error.noKey");
      if (!isMetadataKey(key)) return t("metadata.error.badKey", { key });
      if (seen.has(key)) return t("metadata.error.duplicate", { key });
      seen.add(key);
      if (f.type === HAS_CHOICES && !(f.values ?? []).length) {
        return t("metadata.error.noChoices", { key });
      }
    }
    return null;
  })();

  async function save() {
    if (!fields || problem) return;
    setBusy(true);
    setNotice(null);
    try {
      await patchJson(`${base}/settings`, {
        metadata: { fields: fields.map((f) => ({ ...f, key: f.key.trim() })) },
      });
      await refresh();
      // Shares the settings route, so this is a pending change on the
      // approved line until someone checkpoints it.
      setNotice(t("settings.saved", { branch: INTEGRATION_BRANCH }));
    } catch (e) {
      setNotice(describeError(e, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ProjectPage active="metadata" projectId={projectId} state={state} error={error}>
      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
          <div>
            <h2 className="text-lg font-semibold">{t("metadata.title")}</h2>
            <p className="mt-1 text-sm text-neutral-600">{t("metadata.description")}</p>
            {!isOwner && <p className="mt-2 text-sm text-amber-700">{t("settings.ownerOnly")}</p>}
          </div>

          {fields && (
            <fieldset disabled={!isOwner || busy} className="space-y-3">
              {fields.length === 0 && (
                <p className="rounded border border-dashed border-neutral-300 p-4 text-sm text-neutral-500">
                  {t("metadata.empty")}
                </p>
              )}

              {fields.map((f, i) => (
                <div key={i} className="space-y-3 rounded-lg border border-neutral-200 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={f.key}
                      placeholder={t("metadata.key")}
                      onChange={(e) => patch(i, { key: e.target.value })}
                      className={`${field} w-40 font-mono`}
                      aria-label={t("metadata.key")}
                    />
                    <select
                      value={f.type}
                      onChange={(e) => {
                        const type = e.target.value as MetadataFieldType;
                        patch(i, {
                          type,
                          values: type === HAS_CHOICES ? (f.values ?? []) : undefined,
                        });
                      }}
                      className={field}
                      aria-label={t("metadata.type")}
                    >
                      {METADATA_FIELD_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {t(`metadata.type.${type}`)}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1.5 text-sm">
                      <input
                        type="checkbox"
                        checked={f.required ?? false}
                        onChange={(e) => patch(i, { required: e.target.checked || undefined })}
                      />
                      {t("metadata.required")}
                    </label>
                    <span className="ml-auto flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => move(i, -1)}
                        title={t("metadata.moveUp")}
                        className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => move(i, 1)}
                        title={t("metadata.moveDown")}
                        className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                      >
                        <ArrowDown size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(i)}
                        title={t("common.delete")}
                        className="rounded p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 size={14} />
                      </button>
                    </span>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="text-sm">
                      <span className="block text-xs text-neutral-500">{t("metadata.label")}</span>
                      <input
                        value={f.label ?? ""}
                        placeholder={f.key || t("metadata.key")}
                        onChange={(e) => patch(i, { label: e.target.value || undefined })}
                        className={`${field} w-full`}
                      />
                    </label>
                    <label className="text-sm">
                      <span className="block text-xs text-neutral-500">
                        {t("metadata.default")}
                      </span>
                      <input
                        value={metaText(f.default)}
                        onChange={(e) => patch(i, { default: e.target.value || undefined })}
                        className={`${field} w-full`}
                      />
                    </label>
                    {f.type === HAS_CHOICES && (
                      <label className="text-sm sm:col-span-2">
                        <span className="block text-xs text-neutral-500">
                          {t("metadata.values")}
                        </span>
                        <input
                          value={(f.values ?? []).join(", ")}
                          placeholder="draft, review, approved"
                          onChange={(e) =>
                            patch(i, {
                              values: e.target.value
                                .split(",")
                                .map((v) => v.trim())
                                .filter(Boolean),
                            })
                          }
                          className={`${field} w-full`}
                        />
                      </label>
                    )}
                    <label className="text-sm sm:col-span-2">
                      <span className="block text-xs text-neutral-500">{t("metadata.help")}</span>
                      <input
                        value={f.help ?? ""}
                        onChange={(e) => patch(i, { help: e.target.value || undefined })}
                        className={`${field} w-full`}
                      />
                    </label>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={add}
                className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 px-2.5 py-1.5 text-sm text-neutral-700 hover:border-indigo-400 hover:text-indigo-600"
              >
                <Plus size={14} /> {t("metadata.addField")}
              </button>
            </fieldset>
          )}

          <p className="text-xs text-neutral-500">{t("metadata.enforcementHint")}</p>

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={!isOwner || busy || !fields || problem !== null}
              onClick={() => void save()}
              className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              {t("settings.save")}
            </button>
            {problem && <span className="text-sm text-red-700">{problem}</span>}
            {!problem && notice && <span className="text-sm text-neutral-600">{notice}</span>}
          </div>
        </div>
      </div>
    </ProjectPage>
  );
}
