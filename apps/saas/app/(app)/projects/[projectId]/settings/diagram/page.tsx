"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RotateCcw } from "lucide-react";
import {
  BLOCK_MARGIN_MAX,
  repoSettingsJson,
  REPO_SETTINGS_PATH,
  type SwimlaneSettings,
} from "@swimlane-cloud/github-client";
import {
  DIAGRAM_LAYOUT,
  LAYOUT_SETTINGS,
  type LayoutSetting,
} from "@swimlane-cloud/diagram-converter/diagram-layout";
import { api, patchJson } from "@/lib/client";
import { ProjectPage, describeError, useProject } from "../../_components";
import { branchOf, canEditBranch, defaultBranch, discardDrafts, startEdit } from "@/lib/workflow";
import { useT } from "@/i18n";

const SECTIONS = ["page", "option", "role", "block", "prop"] as const;
type Section = (typeof SECTIONS)[number];
const MODES = ["none", "base", "template-only"] as const;
type Mode = (typeof MODES)[number];
const LAYOUT_GROUPS = ["margins", "grid"] as const;

type Diagram = SwimlaneSettings["diagram"];

interface SettingsResponse {
  settings: SwimlaneSettings;
  branch: string;
  source: "draft" | "git" | "default";
  raw: string | null;
  editable: boolean;
}

/** The policy table's vocabulary → the file's, for sections the file is silent on. */
const FILE_MODE: Record<string, Mode> = {
  optional: "none",
  default: "base",
  forced: "template-only",
};

/** Layout inputs are strings so a field can be blank, meaning "engine default". */
type LayoutDraft = Record<string, string>;

function toLayoutDraft(layout: Record<string, number>): LayoutDraft {
  const out: LayoutDraft = {};
  for (const { key } of LAYOUT_SETTINGS) {
    out[key] = layout[key] === undefined ? "" : String(layout[key]);
  }
  return out;
}

function fromLayoutDraft(draft: LayoutDraft): Record<string, number> {
  const out: Record<string, number> = {};
  for (const { key } of LAYOUT_SETTINGS) {
    const raw = draft[key]?.trim();
    if (!raw) continue;
    const value = Number(raw);
    if (Number.isFinite(value)) out[key] = value;
  }
  return out;
}

/**
 * Repository-wide settings: how every diagram is drawn, the page geometry it is
 * drawn on, and how strictly each DSL section must follow the project template.
 *
 * Saving records a *pending* change on a branch rather than committing: the
 * branch shows as dirty, the change lands at the next checkpoint and reaches
 * `main` through the usual pull request, like any other file in the repository.
 */
export default function DiagramSettingsPage() {
  const { projectId, state, refresh, error } = useProject();
  const { t } = useT();

  const [branchParam, setBranchParam] = useState<string | null>(null);
  const branch = state ? defaultBranch(state, branchParam) : "";
  const editable = state && branch ? canEditBranch(state, branch) : false;

  const [loaded, setLoaded] = useState<SettingsResponse | null>(null);
  const [diagram, setDiagram] = useState<Diagram | null>(null);
  const [layout, setLayout] = useState<LayoutDraft | null>(null);
  const [templates, setTemplates] = useState<Record<Section, Mode> | null>(null);
  const [json, setJson] = useState("");
  const [mode, setMode] = useState<"form" | "json">("form");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const base = `/api/projects/${projectId}`;

  const load = useCallback(async () => {
    if (!branch) return;
    try {
      const res = await api<SettingsResponse>(
        `${base}/settings?branch=${encodeURIComponent(branch)}`,
      );
      setLoaded(res);
      setDiagram(res.settings.diagram);
      setLayout(toLayoutDraft(res.settings.diagram.layout));
      setJson(res.raw ?? repoSettingsJson(res.settings));

      const fromFile = res.settings.templates;
      const policies = await api<{ policies: Record<string, { mode: string }> }>(
        `${base}/template-policies`,
      );
      const next = {} as Record<Section, Mode>;
      for (const s of SECTIONS) {
        next[s] = fromFile[s] ?? FILE_MODE[policies.policies[s]?.mode ?? "optional"] ?? "none";
      }
      setTemplates(next);
      setNotice(null);
    } catch (e) {
      setNotice(describeError(e, t));
    }
  }, [base, branch]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void load();
  }, [load]);

  /** What the current mode would save, as the file text. One source of truth. */
  const pendingJson = useMemo(() => {
    if (mode === "json") return json;
    if (!loaded || !diagram || !layout || !templates) return "";
    return repoSettingsJson({
      ...loaded.settings,
      diagram: { ...diagram, layout: fromLayoutDraft(layout) },
      templates,
    });
  }, [mode, json, loaded, diagram, layout, templates]);

  const jsonError = useMemo(() => {
    if (mode !== "json" || !json.trim()) return null;
    try {
      JSON.parse(json);
      return null;
    } catch (e) {
      return t("settings.jsonInvalid", { message: e instanceof Error ? e.message : String(e) });
    }
  }, [mode, json, t]);

  /** Switching modes must not lose what was typed, so carry the value across. */
  function switchMode(next: "form" | "json") {
    if (next === mode) return;
    if (next === "json") setJson(pendingJson);
    else if (!jsonError) {
      try {
        const parsed = JSON.parse(json) as SwimlaneSettings;
        const merged = { ...(loaded?.settings ?? parsed), ...parsed };
        setDiagram(merged.diagram);
        setLayout(toLayoutDraft(merged.diagram?.layout ?? {}));
      } catch {
        /* unparseable JSON has nothing to carry; keep the last good form */
      }
    }
    setMode(next);
  }

  async function run(fn: () => Promise<string>) {
    setBusy(true);
    setNotice(null);
    try {
      const message = await fn();
      await load();
      await refresh();
      setNotice(message);
    } catch (e) {
      setNotice(describeError(e, t));
    } finally {
      setBusy(false);
    }
  }

  const save = () =>
    run(async () => {
      if (mode === "json") await patchJson(`${base}/settings`, { branch, raw: json });
      else {
        await patchJson(`${base}/settings`, {
          branch,
          diagram: { ...diagram, layout: fromLayoutDraft(layout ?? {}) },
          templates,
        });
      }
      return t("settings.saved", { branch });
    });

  const discard = () =>
    run(async () => {
      await discardDrafts(projectId, branch, REPO_SETTINGS_PATH);
      return t("settings.discarded");
    });

  function beginEdit() {
    void run(async () => {
      const res = await startEdit(projectId);
      setBranchParam(res.branch);
      return t("settings.pending", { branch: res.branch });
    });
  }

  const revertAll = () => setLayout(toLayoutDraft({}));
  const pending = loaded?.source === "draft";
  const dirty = Boolean(loaded) && pendingJson !== (loaded?.raw ?? "");
  const disabled = !editable || busy;
  const field = "rounded border border-neutral-300 px-2 py-1 text-sm";

  return (
    <ProjectPage active="settings" projectId={projectId} state={state} error={error}>
      <div className="mx-auto max-w-2xl space-y-8 p-4 sm:p-6">
        <div>
          <h2 className="text-lg font-semibold">{t("settings.title")}</h2>
          <p className="mt-1 text-sm text-neutral-600">{t("settings.description")}</p>
        </div>

        {state && (
          <div className="flex flex-wrap items-center gap-3 rounded border border-neutral-200 bg-neutral-50 p-3 text-sm">
            <label className="flex items-center gap-2">
              <span className="font-medium">{t("settings.branch")}</span>
              <select
                className={`${field} bg-white`}
                value={branch}
                onChange={(e) => setBranchParam(e.target.value)}
              >
                {state.branches.map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.name}
                    {b.dirty ? " •" : ""}
                  </option>
                ))}
              </select>
            </label>
            {pending && (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                {t("settings.pendingBadge")}
              </span>
            )}
            <div className="ml-auto flex gap-1 text-xs">
              {(["form", "json"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => switchMode(m)}
                  className={`rounded px-3 py-1 ${
                    mode === m ? "bg-neutral-800 text-white" : "text-neutral-500 hover:bg-white"
                  }`}
                >
                  {t(`settings.mode.${m}`)}
                </button>
              ))}
            </div>
          </div>
        )}

        {!editable && state && (
          <div className="rounded border border-neutral-200 p-3 text-sm">
            <p className="text-neutral-600">{t("settings.readOnly", { branch })}</p>
            <p className="mt-1 text-xs text-neutral-500">{t("settings.readOnlyHint")}</p>
            {state.me.role !== "viewer" && (
              <button
                type="button"
                disabled={busy}
                onClick={beginEdit}
                className="mt-2 rounded border border-neutral-300 px-2.5 py-1 text-sm hover:border-indigo-400 hover:text-indigo-600 disabled:opacity-50"
              >
                {t("settings.startEdit")}
              </button>
            )}
          </div>
        )}

        {mode === "json" ? (
          <section className="space-y-2">
            <textarea
              value={json}
              onChange={(e) => setJson(e.target.value)}
              disabled={disabled}
              rows={22}
              spellCheck={false}
              className="w-full rounded border border-neutral-300 px-2 py-1 font-mono text-xs disabled:bg-neutral-50"
            />
            <p className="text-xs text-neutral-500">
              {t("settings.jsonHint", { path: REPO_SETTINGS_PATH })}
            </p>
            {jsonError && <p className="text-xs text-red-600">{jsonError}</p>}
          </section>
        ) : (
          <>
            <section className="space-y-4">
              <h3 className="font-medium">{t("settings.diagram")}</h3>
              {diagram && (
                <fieldset disabled={disabled} className="space-y-4">
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={diagram.showGatewayIcons}
                      onChange={(e) =>
                        setDiagram({ ...diagram, showGatewayIcons: e.target.checked })
                      }
                    />
                    <span>
                      <span className="block text-sm">{t("settings.showGatewayIcons")}</span>
                      <span className="block text-xs text-neutral-500">
                        {t("settings.showGatewayIconsHint")}
                      </span>
                    </span>
                  </label>
                  <label className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                    <span className="text-sm sm:w-56">{t("settings.blockMargin")}</span>
                    <input
                      type="number"
                      min={0}
                      max={BLOCK_MARGIN_MAX}
                      step={1}
                      className={`${field} w-24`}
                      value={diagram.blockMargin}
                      onChange={(e) =>
                        setDiagram({
                          ...diagram,
                          blockMargin: Math.max(
                            0,
                            Math.min(BLOCK_MARGIN_MAX, Math.round(Number(e.target.value) || 0)),
                          ),
                        })
                      }
                    />
                  </label>
                  <label className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                    <span className="text-sm sm:w-56">{t("settings.blockText")}</span>
                    <select
                      className={field}
                      value={diagram.blockText}
                      onChange={(e) =>
                        setDiagram({
                          ...diagram,
                          blockText: e.target.value as Diagram["blockText"],
                        })
                      }
                    >
                      <option value="truncate">{t("settings.blockText.truncate")}</option>
                      <option value="wrap">{t("settings.blockText.wrap")}</option>
                    </select>
                  </label>
                  <p className="text-xs text-neutral-500">{t("settings.diagramHint")}</p>
                </fieldset>
              )}
            </section>

            <section className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-medium">{t("settings.layout")}</h3>
                  <p className="mt-1 text-sm text-neutral-600">{t("settings.layoutDescription")}</p>
                </div>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={revertAll}
                  className="shrink-0 rounded border border-neutral-300 px-2.5 py-1 text-xs hover:border-indigo-400 hover:text-indigo-600 disabled:opacity-50"
                >
                  {t("settings.revertAll")}
                </button>
              </div>
              {layout &&
                LAYOUT_GROUPS.map((group) => (
                  <fieldset key={group} disabled={disabled} className="space-y-2">
                    <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-400">
                      {t(`settings.layoutGroup.${group}`)}
                    </legend>
                    {LAYOUT_SETTINGS.filter((s) => s.group === group).map((setting) => (
                      <LayoutRow
                        key={setting.key}
                        setting={setting}
                        value={layout[setting.key] ?? ""}
                        onChange={(v) => setLayout({ ...layout, [setting.key]: v })}
                      />
                    ))}
                  </fieldset>
                ))}
              <p className="text-xs text-neutral-500">{t("settings.layoutHint")}</p>
            </section>

            <section className="space-y-4">
              <h3 className="font-medium">{t("settings.templates")}</h3>
              <p className="text-sm text-neutral-600">{t("settings.templatesDescription")}</p>
              {templates && (
                <fieldset disabled={disabled} className="space-y-2">
                  {SECTIONS.map((s) => (
                    <label
                      key={s}
                      className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3"
                    >
                      <code className="text-sm sm:w-56">/{s}/</code>
                      <select
                        className={field}
                        value={templates[s]}
                        onChange={(e) =>
                          setTemplates({ ...templates, [s]: e.target.value as Mode })
                        }
                      >
                        {MODES.map((m) => (
                          <option key={m} value={m}>
                            {t(`settings.templateMode.${m}`)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                  <p className="text-xs text-neutral-500">{t("settings.templateModeHint")}</p>
                </fieldset>
              )}
            </section>
          </>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-neutral-200 pt-4">
          <button
            type="button"
            disabled={disabled || !dirty || Boolean(jsonError) || !loaded}
            onClick={() => void save()}
            className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            {busy ? t("settings.saving") : t("settings.save")}
          </button>
          {pending && editable && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void discard()}
              className="rounded border border-neutral-300 px-2.5 py-1 text-sm hover:border-red-400 hover:text-red-600 disabled:opacity-50"
            >
              {t("settings.discard")}
            </button>
          )}
          {pending && (
            <Link
              href={`/projects/${projectId}/edit?branch=${encodeURIComponent(branch)}`}
              className="text-xs text-indigo-600 hover:underline"
            >
              {t("settings.goToCheckpoint")}
            </Link>
          )}
          <span className="text-sm text-neutral-600">
            {notice ?? (pending ? t("settings.pending", { branch }) : null)}
          </span>
        </div>
      </div>
    </ProjectPage>
  );
}

/**
 * One overridable page-geometry value.
 *
 * Blank means "use the engine default", which is what makes reverting a
 * deletion rather than a write of today's number — so a later improvement to
 * the default still reaches this repository.
 */
function LayoutRow({
  setting,
  value,
  onChange,
}: {
  setting: LayoutSetting;
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useT();
  const fallback = DIAGRAM_LAYOUT[setting.key];
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
      <span className="min-w-0 flex-1">
        <span className="block text-sm">{t(`settings.layoutField.${setting.key}`)}</span>
        <span className="block font-mono text-[11px] text-neutral-400">
          {setting.key} · {t("settings.layoutDefault", { value: String(fallback) })}
        </span>
      </span>
      <input
        type="number"
        inputMode="numeric"
        min={setting.min}
        max={setting.max}
        step={1}
        value={value}
        placeholder={String(fallback)}
        onChange={(e) => onChange(e.target.value)}
        className="w-24 shrink-0 rounded border border-neutral-300 px-2 py-1 text-right text-sm"
      />
      <button
        type="button"
        onClick={() => onChange("")}
        disabled={value.trim() === ""}
        title={t("settings.revert")}
        aria-label={t("settings.revert")}
        className="shrink-0 rounded border border-neutral-300 p-1.5 text-neutral-500 hover:border-indigo-400 hover:text-indigo-600 disabled:opacity-30"
      >
        <RotateCcw size={14} />
      </button>
    </div>
  );
}
