"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RotateCcw, Save, Trash2 } from "lucide-react";
import {
  parseRepoConfig,
  REPO_CONFIG_PATH,
  serializeRepoConfig,
  type RepoConfig,
} from "@swimlane-cloud/github-client";
import { THEMES } from "@swimlane-cloud/diagram-converter/themes";
import {
  DIAGRAM_LAYOUT,
  LAYOUT_SETTINGS,
  type LayoutSetting,
} from "@swimlane-cloud/diagram-converter/diagram-layout";
import { ProjectPage, Action, describeError, useProject } from "../../_components";
import {
  branchOf,
  canEditBranch,
  defaultBranch,
  discardRepoConfig,
  getRepoConfig,
  saveRepoConfig,
  startEdit,
} from "@/lib/workflow";
import type { RepoConfigResponse } from "@/lib/types";
import { useT } from "@/i18n";

const FIELD =
  "w-full rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:bg-neutral-50 disabled:text-neutral-500";

const LAYOUT_GROUPS = ["margins", "grid"] as const;

/** The form's working copy: layout values are strings so a field can be blank. */
interface Draft {
  diagramsRoot: string;
  title: string;
  themeKey: string;
  integrationBranch: string;
  layout: Record<string, string>;
}

function toDraft(config: RepoConfig): Draft {
  const layout: Record<string, string> = {};
  for (const { key } of LAYOUT_SETTINGS) {
    const value = config.layout[key];
    // An unset key stays blank, which is what makes "revert" a deletion rather
    // than a write of today's default.
    layout[key] = value === undefined ? "" : String(value);
  }
  return {
    diagramsRoot: config.diagramsRoot,
    title: config.title ?? "",
    themeKey: config.themeKey,
    integrationBranch: config.integrationBranch,
    layout,
  };
}

function toConfig(draft: Draft): RepoConfig {
  const layout: Record<string, number> = {};
  for (const { key } of LAYOUT_SETTINGS) {
    const raw = draft.layout[key]?.trim();
    if (!raw) continue;
    const value = Number(raw);
    if (Number.isFinite(value)) layout[key] = value;
  }
  return {
    diagramsRoot: draft.diagramsRoot.trim(),
    title: draft.title.trim() || null,
    themeKey: draft.themeKey.trim() || "basic",
    integrationBranch: draft.integrationBranch.trim() || "test",
    layout,
  };
}

/**
 * Repository-wide settings — `.swimlane.json`, edited as a form or as raw JSON.
 *
 * Saving writes a draft, not a commit: a settings change is an ordinary pending
 * change on a branch, so it shows up as a dirty branch, lands in the next
 * checkpoint and reaches `test` through the usual pull request.
 */
export default function RepoSettingsPage() {
  const { projectId, state, error, refresh } = useProject();
  const { t } = useT();

  const [branchParam, setBranchParam] = useState<string | null>(null);
  const branch = state ? defaultBranch(state, branchParam) : "test";
  const editable = state ? canEditBranch(state, branch) : false;

  const [loaded, setLoaded] = useState<RepoConfigResponse | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [json, setJson] = useState("");
  const [mode, setMode] = useState<"form" | "json">("form");
  const [notice, setNotice] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await getRepoConfig(projectId, branch);
      setLoaded(res);
      setDraft(toDraft(res.config));
      setJson(res.raw ?? serializeRepoConfig(res.config));
      setNotice(null);
    } catch (e) {
      setNotice(describeError(e, t));
    }
  }, [projectId, branch]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setSaved(null);
    void load();
  }, [load]);

  /** The file the current mode would save. One source of truth for both modes. */
  const pending = useMemo(() => {
    if (mode === "json") return json;
    return draft ? serializeRepoConfig(toConfig(draft), loaded?.raw ?? null) : "";
  }, [mode, json, draft, loaded]);

  const jsonError = useMemo(() => {
    if (mode !== "json" || !json.trim()) return null;
    try {
      JSON.parse(json);
      return null;
    } catch (e) {
      return t("repoSettings.jsonInvalid", {
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }, [mode, json, t]);

  const baseline = loaded?.raw ?? (loaded ? serializeRepoConfig(loaded.config) : "");
  const dirty = Boolean(loaded) && pending !== baseline;

  /** Switching modes must not lose what was typed, so carry the value across. */
  const switchMode = (next: "form" | "json") => {
    if (next === mode) return;
    if (next === "json") setJson(pending);
    else if (!jsonError) {
      // The same lenient parser the readers use, so what the form shows is
      // exactly what this JSON means to the rest of the system.
      setDraft(toDraft(parseRepoConfig(json)));
    }
    setMode(next);
  };

  const run = async (fn: () => Promise<string>) => {
    setBusy(true);
    setNotice(null);
    setSaved(null);
    try {
      const message = await fn();
      await load();
      await refresh();
      setSaved(message);
    } catch (e) {
      setNotice(describeError(e, t));
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(async () => {
      await saveRepoConfig(projectId, branch, pending);
      return t("repoSettings.saved", { branch });
    });

  const discard = () =>
    run(async () => {
      await discardRepoConfig(projectId, branch);
      return t("repoSettings.discarded");
    });

  const beginEdit = () => {
    const name = window.prompt(
      t("repoSettings.startEditPrompt"),
      t("repoSettings.startEditDefault"),
    );
    if (!name) return; // cancelled — not a failure
    void run(async () => {
      const res = await startEdit(projectId, name);
      setBranchParam(res.branch);
      return t("repoSettings.pending", { branch: res.branch });
    });
  };

  const setField = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const setLayout = (key: string, value: string) =>
    setDraft((d) => (d ? { ...d, layout: { ...d.layout, [key]: value } } : d));
  const revertAll = () =>
    setField({ layout: Object.fromEntries(LAYOUT_SETTINGS.map((s) => [s.key, ""])) });

  const themeKeys = Object.keys(THEMES);
  const hasPending = loaded?.source === "draft";
  const canSave = editable && dirty && !busy && !jsonError;

  return (
    <ProjectPage active="repo" projectId={projectId} state={state} error={error ?? notice}>
      {state && draft && loaded && (
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="mx-auto max-w-3xl p-6">
            <div className="mb-4">
              <h2 className="text-lg font-semibold">{t("repoSettings.title")}</h2>
              <p className="text-xs text-neutral-500">
                {t("repoSettings.description", { path: REPO_CONFIG_PATH })}
              </p>
            </div>

            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm">
              <label className="flex items-center gap-2">
                <span className="font-medium">{t("repoSettings.branch")}</span>
                <select
                  value={branch}
                  onChange={(e) => setBranchParam(e.target.value)}
                  className="rounded-md border border-neutral-300 bg-white px-2 py-1"
                >
                  {state.branches.map((b) => (
                    <option key={b.name} value={b.name}>
                      {b.name}
                      {b.dirty ? " •" : ""}
                    </option>
                  ))}
                </select>
              </label>
              {hasPending && (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                  {t("repoSettings.pendingBadge")}
                </span>
              )}
              <div className="ml-auto flex gap-1 text-xs">
                {(["form", "json"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => switchMode(m)}
                    className={`rounded px-3 py-1 ${
                      mode === m ? "bg-neutral-800 text-white" : "text-neutral-500 hover:bg-white"
                    }`}
                  >
                    {t(`repoSettings.mode${m === "form" ? "Form" : "Json"}`)}
                  </button>
                ))}
              </div>
            </div>

            {!editable && (
              <div className="mb-4 rounded-md border border-neutral-200 bg-white p-3 text-sm">
                <p className="text-neutral-600">{t("repoSettings.readOnly", { branch })}</p>
                <p className="mt-1 text-xs text-neutral-500">{t("repoSettings.startEditHint")}</p>
                {state.me.role !== "viewer" && (
                  <span className="mt-2 inline-block">
                    <Action onClick={beginEdit} disabled={busy}>
                      {t("repoSettings.startEdit")}
                    </Action>
                  </span>
                )}
              </div>
            )}

            {mode === "json" ? (
              <div className="space-y-2">
                <textarea
                  value={json}
                  onChange={(e) => setJson(e.target.value)}
                  disabled={!editable || busy}
                  rows={20}
                  spellCheck={false}
                  className="w-full rounded-md border border-neutral-300 px-2 py-1 font-mono text-xs disabled:bg-neutral-50"
                />
                <p className="text-xs text-neutral-500">{t("repoSettings.jsonHint")}</p>
                {jsonError && <p className="text-xs text-red-600">{jsonError}</p>}
              </div>
            ) : (
              <>
                <Section title={t("repoSettings.sectionRepository")}>
                  <Field
                    label={t("repoSettings.diagramsRoot")}
                    hint={`${t("repoSettings.diagramsRootHint")} ${t("repoSettings.diagramsRootWarning")}`}
                  >
                    <input
                      value={draft.diagramsRoot}
                      onChange={(e) => setField({ diagramsRoot: e.target.value })}
                      disabled={!editable || busy}
                      placeholder="diagrams"
                      className={`${FIELD} font-mono`}
                    />
                  </Field>
                  <Field
                    label={t("repoSettings.displayName")}
                    hint={t("repoSettings.displayNameHint")}
                  >
                    <input
                      value={draft.title}
                      onChange={(e) => setField({ title: e.target.value })}
                      disabled={!editable || busy}
                      placeholder={state.project.repo}
                      className={FIELD}
                    />
                  </Field>
                  <Field label={t("repoSettings.theme")} hint={t("repoSettings.themeHint")}>
                    <select
                      value={draft.themeKey}
                      onChange={(e) => setField({ themeKey: e.target.value })}
                      disabled={!editable || busy}
                      className={FIELD}
                    >
                      {/* A theme this build does not ship still has to be selectable,
                          or opening the page would silently rewrite it. */}
                      {!themeKeys.includes(draft.themeKey) && (
                        <option value={draft.themeKey}>{draft.themeKey}</option>
                      )}
                      {themeKeys.map((k) => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field
                    label={t("repoSettings.integrationBranch")}
                    hint={t("repoSettings.integrationBranchHint")}
                  >
                    <input
                      value={draft.integrationBranch}
                      onChange={(e) => setField({ integrationBranch: e.target.value })}
                      disabled={!editable || busy}
                      placeholder="test"
                      className={`${FIELD} font-mono`}
                    />
                  </Field>
                </Section>

                <Section
                  title={t("repoSettings.sectionLayout")}
                  hint={t("repoSettings.sectionLayoutHint")}
                  action={
                    editable && (
                      <Action onClick={revertAll} disabled={busy}>
                        <RotateCcw size={13} /> {t("repoSettings.revertAll")}
                      </Action>
                    )
                  }
                >
                  {LAYOUT_GROUPS.map((group) => (
                    <div key={group} className="mt-1">
                      <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
                        {t(`repoSettings.group.${group}`)}
                      </h4>
                      <div className="space-y-3">
                        {LAYOUT_SETTINGS.filter((s) => s.group === group).map((setting) => (
                          <LayoutField
                            key={setting.key}
                            setting={setting}
                            value={draft.layout[setting.key] ?? ""}
                            disabled={!editable || busy}
                            onChange={(v) => setLayout(setting.key, v)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </Section>
              </>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-neutral-200 pt-4">
              <button
                onClick={save}
                disabled={!canSave}
                className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                <Save size={14} /> {busy ? t("repoSettings.saving") : t("repoSettings.save")}
              </button>
              {hasPending && editable && (
                <Action onClick={discard} disabled={busy}>
                  <Trash2 size={14} /> {t("repoSettings.discard")}
                </Action>
              )}
              {hasPending && (
                <Link
                  href={`/projects/${projectId}/edit?branch=${encodeURIComponent(branch)}`}
                  className="text-xs text-indigo-600 hover:underline"
                >
                  {t("repoSettings.goToEdit")}
                </Link>
              )}
              <span className="text-xs text-neutral-500">
                {saved ?? (hasPending ? t("repoSettings.pending", { branch }) : null)}
              </span>
            </div>
          </div>
        </div>
      )}
    </ProjectPage>
  );
}

function Section({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5 rounded-md border border-neutral-200 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {hint && <p className="mt-0.5 text-xs text-neutral-500">{hint}</p>}
        </div>
        {action}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-neutral-500">{hint}</span>}
    </label>
  );
}

/**
 * One overridable layout value. Blank means "use the engine default", so
 * reverting clears the input rather than writing today's default into the file
 * — that way an improved default still reaches this repository.
 */
function LayoutField({
  setting,
  value,
  disabled,
  onChange,
}: {
  setting: LayoutSetting;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const { t } = useT();
  const fallback = DIAGRAM_LAYOUT[setting.key];
  const overridden = value.trim() !== "";
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm">{t(`repoSettings.layout.${setting.key}`)}</div>
        <div className="font-mono text-[11px] text-neutral-400">
          {setting.key} · {t("repoSettings.defaultValue", { value: String(fallback) })}
        </div>
      </div>
      <input
        type="number"
        inputMode="numeric"
        min={setting.min}
        max={setting.max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={String(fallback)}
        className="w-24 shrink-0 rounded-md border border-neutral-300 px-2 py-1 text-right text-sm disabled:bg-neutral-50 disabled:text-neutral-500"
      />
      <button
        type="button"
        onClick={() => onChange("")}
        disabled={disabled || !overridden}
        title={t("repoSettings.revert")}
        aria-label={t("repoSettings.revert")}
        className="shrink-0 rounded border border-neutral-300 p-1.5 text-neutral-500 hover:border-indigo-400 hover:text-indigo-600 disabled:opacity-30 disabled:hover:border-neutral-300 disabled:hover:text-neutral-500"
      >
        <RotateCcw size={14} />
      </button>
    </div>
  );
}
