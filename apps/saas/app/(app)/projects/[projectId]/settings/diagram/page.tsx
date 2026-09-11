"use client";

import { useEffect, useState } from "react";
import { api, patchJson } from "@/lib/client";
import { ProjectPage, describeError, useProject } from "../../_components";
import { useT } from "@/i18n";

const SECTIONS = ["page", "option", "role", "block", "prop"] as const;
type Section = (typeof SECTIONS)[number];
const MODES = ["none", "base", "template-only"] as const;
type Mode = (typeof MODES)[number];
const BLOCK_MARGIN_MAX = 80;

interface Diagram {
  showGatewayIcons: boolean;
  blockMargin: number;
  blockText: "truncate" | "wrap";
}

/** The policy table's vocabulary → the file's, for sections the file is silent on. */
const FILE_MODE: Record<string, Mode> = {
  optional: "none",
  default: "base",
  forced: "template-only",
};

/**
 * Repository-wide settings: how every diagram is drawn, and how strictly each
 * DSL section must follow the project template. Saved to
 * `swimlane-settings.json` on `main`.
 */
export default function DiagramSettingsPage() {
  const { projectId, state, refresh, error } = useProject();
  const { t } = useT();
  const [diagram, setDiagram] = useState<Diagram | null>(null);
  const [templates, setTemplates] = useState<Record<Section, Mode> | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const isOwner = state?.me.role === "owner";
  const base = `/api/projects/${projectId}`;

  useEffect(() => {
    if (!state?.settings || diagram) return;
    setDiagram(state.settings.diagram);
    const fromFile = state.settings.templates;
    api<{ policies: Record<string, { mode: string }> }>(`${base}/template-policies`)
      .then((res) => {
        const next = {} as Record<Section, Mode>;
        for (const s of SECTIONS) {
          next[s] = fromFile[s] ?? FILE_MODE[res.policies[s]?.mode ?? "optional"] ?? "none";
        }
        setTemplates(next);
      })
      .catch((e) => setNotice(describeError(e, t)));
  }, [state, diagram, base, t]);

  async function save() {
    if (!diagram || !templates) return;
    setBusy(true);
    setNotice(null);
    try {
      await patchJson(`${base}/settings`, { diagram, templates });
      await refresh();
      setNotice(t("settings.saved"));
    } catch (e) {
      setNotice(describeError(e, t));
    } finally {
      setBusy(false);
    }
  }

  const field = "rounded border border-neutral-300 px-2 py-1 text-sm";

  return (
    <ProjectPage active="settings" projectId={projectId} state={state} error={error}>
      <div className="mx-auto max-w-2xl space-y-8 p-4 sm:p-6">
        <div>
          <h2 className="text-lg font-semibold">{t("settings.title")}</h2>
          <p className="mt-1 text-sm text-neutral-600">{t("settings.description")}</p>
          {!isOwner && <p className="mt-2 text-sm text-amber-700">{t("settings.ownerOnly")}</p>}
        </div>

        <section className="space-y-4">
          <h3 className="font-medium">{t("settings.diagram")}</h3>
          {diagram && (
            <fieldset disabled={!isOwner || busy} className="space-y-4">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={diagram.showGatewayIcons}
                  onChange={(e) => setDiagram({ ...diagram, showGatewayIcons: e.target.checked })}
                />
                <span>
                  <span className="block text-sm">{t("settings.showGatewayIcons")}</span>
                  <span className="block text-xs text-neutral-500">
                    {t("settings.showGatewayIconsHint")}
                  </span>
                </span>
              </label>
              <label className="flex items-center gap-3">
                <span className="w-56 text-sm">{t("settings.blockMargin")}</span>
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
              <label className="flex items-center gap-3">
                <span className="w-56 text-sm">{t("settings.blockText")}</span>
                <select
                  className={field}
                  value={diagram.blockText}
                  onChange={(e) =>
                    setDiagram({ ...diagram, blockText: e.target.value as Diagram["blockText"] })
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
          <h3 className="font-medium">{t("settings.templates")}</h3>
          <p className="text-sm text-neutral-600">{t("settings.templatesDescription")}</p>
          {templates && (
            <fieldset disabled={!isOwner || busy} className="space-y-2">
              {SECTIONS.map((s) => (
                <label key={s} className="flex items-center gap-3">
                  <code className="w-56 text-sm">/{s}/</code>
                  <select
                    className={field}
                    value={templates[s]}
                    onChange={(e) => setTemplates({ ...templates, [s]: e.target.value as Mode })}
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

        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={!isOwner || busy || !diagram || !templates}
            onClick={() => void save()}
            className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            {t("settings.save")}
          </button>
          {notice && <span className="text-sm text-neutral-600">{notice}</span>}
        </div>
      </div>
    </ProjectPage>
  );
}
