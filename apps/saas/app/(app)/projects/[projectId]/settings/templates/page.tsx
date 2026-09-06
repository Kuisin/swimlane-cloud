"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Star, Trash2 } from "lucide-react";
import { api, del, patchJson, postJson } from "@/lib/client";
import {
  ProjectPage,
  Action,
  Empty,
  Modal,
  ModalFooter,
  describeError,
  useProject,
} from "../../_components";
import { useT } from "@/i18n";

const SECTIONS = ["page", "option", "role", "block", "prop"] as const;
type Section = (typeof SECTIONS)[number];
type Mode = "optional" | "default" | "forced";

interface Template {
  id: string;
  section: Section;
  name: string;
  slug: string;
  body: string;
  is_default: boolean;
  sort_order: number;
}
interface Policy {
  mode: Mode;
  forcedTemplateId?: string;
}

/**
 * Project section templates: the per-section library the editor's "Insert
 * template" draws from, and the policy that decides whether a section is
 * optional, pre-filled, or forced to match one template exactly.
 */
export default function TemplatesPage() {
  const { projectId, state, error } = useProject();
  const { t } = useT();
  const [section, setSection] = useState<Section>("page");
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [policies, setPolicies] = useState<Record<Section, Policy> | null>(null);
  const [editing, setEditing] = useState<Partial<Template> | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Template | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isOwner = state?.me.role === "owner";
  const base = `/api/projects/${projectId}`;

  const load = useCallback(async () => {
    try {
      const [tpl, pol] = await Promise.all([
        api<{ templates: Template[] }>(`${base}/templates`),
        api<{ policies: Record<Section, Policy> }>(`${base}/template-policies`),
      ]);
      setTemplates(tpl.templates);
      setPolicies(pol.policies);
    } catch (e) {
      setNotice(describeError(e, t));
    }
  }, [base]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setNotice(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setNotice(describeError(e, t));
    } finally {
      setBusy(false);
    }
  };

  const inSection = (templates ?? []).filter((x) => x.section === section);
  const policy = policies?.[section] ?? { mode: "optional" as Mode };

  const save = (form: Partial<Template>) =>
    run(async () => {
      const body = {
        section,
        name: form.name,
        slug: form.slug || undefined,
        body: form.body,
        is_default: form.is_default ?? false,
      };
      if (form.id) await patchJson(`${base}/templates`, { ...body, id: form.id });
      else await postJson(`${base}/templates`, body);
      setEditing(null);
    });

  const confirmRemove = () => {
    const tpl = confirmDelete;
    setConfirmDelete(null);
    if (!tpl) return;
    void run(() => del(`${base}/templates?id=${encodeURIComponent(tpl.id)}`));
  };

  const setPolicy = (mode: Mode, forcedId?: string) =>
    run(() =>
      patchJson(`${base}/template-policies`, {
        section,
        mode,
        forced_template_id: mode === "forced" ? (forcedId ?? null) : null,
      }),
    );

  return (
    <ProjectPage active="templates" projectId={projectId} state={state} error={error ?? notice}>
      {state && (
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="mx-auto max-w-3xl p-6">
            <div className="mb-4">
              <h2 className="text-lg font-semibold">{t("templates.title")}</h2>
              <p className="text-xs text-neutral-500">{t("templates.description")}</p>
            </div>

            <div className="mb-4 flex gap-1 overflow-x-auto rounded-md border border-neutral-200 p-1 text-sm">
              {SECTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => setSection(s)}
                  className={`rounded px-3 py-1 font-mono ${
                    section === s
                      ? "bg-neutral-900 text-white"
                      : "text-neutral-600 hover:bg-neutral-50"
                  }`}
                >
                  /{s}/{policies?.[s]?.mode === "forced" ? " 🔒" : ""}
                </button>
              ))}
            </div>

            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm">
              <span className="font-medium">{t("templates.policy")}</span>
              <select
                value={policy.mode}
                disabled={!isOwner || busy}
                onChange={(e) => {
                  const mode = e.target.value as Mode;
                  const forced =
                    mode === "forced"
                      ? (policy.forcedTemplateId ??
                        inSection.find((x) => x.is_default)?.id ??
                        inSection[0]?.id)
                      : undefined;
                  if (mode === "forced" && !forced) {
                    setNotice(t("templates.needTemplateToForce"));
                    return;
                  }
                  void setPolicy(mode, forced);
                }}
                className="rounded-md border border-neutral-300 bg-white px-2 py-1"
              >
                {(["optional", "default", "forced"] as Mode[]).map((m) => (
                  <option key={m} value={m}>
                    {t(`templates.mode.${m}`)}
                  </option>
                ))}
              </select>
              {policy.mode === "forced" && (
                <select
                  value={policy.forcedTemplateId ?? ""}
                  disabled={!isOwner || busy}
                  onChange={(e) => void setPolicy("forced", e.target.value)}
                  className="rounded-md border border-neutral-300 bg-white px-2 py-1"
                >
                  {inSection.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              )}
              <span className="text-xs text-neutral-500">
                {t(`templates.modeHint.${policy.mode}`)}
              </span>
              {isOwner && (
                <span className="ml-auto">
                  <Action onClick={() => setEditing({ section })} disabled={busy}>
                    <Plus size={14} /> {t("templates.new")}
                  </Action>
                </span>
              )}
            </div>

            {!templates ? (
              <Empty>{t("loading")}</Empty>
            ) : inSection.length === 0 ? (
              <Empty>{t("templates.empty")}</Empty>
            ) : (
              <ul className="space-y-2">
                {inSection.map((x) => (
                  <li key={x.id} className="rounded-md border border-neutral-200 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 font-medium">
                          {x.is_default && (
                            <Star size={13} className="text-amber-500" fill="currentColor" />
                          )}
                          <span className="truncate">{x.name}</span>
                          <span className="font-mono text-xs text-neutral-400">{x.slug}</span>
                          {policy.forcedTemplateId === x.id && (
                            <span className="rounded bg-indigo-50 px-1.5 text-[10px] text-indigo-700">
                              {t("templates.forcedBadge")}
                            </span>
                          )}
                        </div>
                        <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-neutral-50 p-2 font-mono text-xs text-neutral-700">
                          {x.body}
                        </pre>
                      </div>
                      {isOwner && (
                        <div className="flex shrink-0 gap-1">
                          <button
                            onClick={() => setEditing(x)}
                            className="rounded border border-neutral-300 px-2 py-1 text-xs hover:border-indigo-400 hover:text-indigo-600"
                          >
                            {t("templates.edit")}
                          </button>
                          <button
                            onClick={() => setConfirmDelete(x)}
                            disabled={policy.forcedTemplateId === x.id}
                            title={
                              policy.forcedTemplateId === x.id
                                ? t("templates.cannotDeleteForced")
                                : undefined
                            }
                            className="rounded border border-neutral-300 p-1 text-neutral-500 hover:border-red-400 hover:text-red-600 disabled:opacity-40"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {editing && (
        <TemplateForm
          section={section}
          initial={editing}
          busy={busy}
          onCancel={() => setEditing(null)}
          onSave={save}
        />
      )}

      {confirmDelete && (
        <Modal
          title={t("common.delete")}
          onClose={() => setConfirmDelete(null)}
          maxW="max-w-sm"
          footer={
            <ModalFooter
              onCancel={() => setConfirmDelete(null)}
              onConfirm={confirmRemove}
              confirmLabel={t("common.delete")}
              busy={busy}
              danger
            />
          }
        >
          <p className="text-sm text-neutral-600">
            {t("templates.confirmDelete", { name: confirmDelete.name })}
          </p>
        </Modal>
      )}
    </ProjectPage>
  );
}

function TemplateForm({
  section,
  initial,
  busy,
  onCancel,
  onSave,
}: {
  section: Section;
  initial: Partial<Template>;
  busy: boolean;
  onCancel: () => void;
  onSave: (form: Partial<Template>) => void;
}) {
  const { t } = useT();
  const [name, setName] = useState(initial.name ?? "");
  const [slug, setSlug] = useState(initial.slug ?? "");
  const [body, setBody] = useState(initial.body ?? "");
  const [isDefault, setIsDefault] = useState(initial.is_default ?? false);
  return (
    <Modal
      title={
        initial.id ? t("templates.editTitle", { section }) : t("templates.newTitle", { section })
      }
      onClose={onCancel}
      maxW="max-w-lg"
      footer={
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
          >
            {t("stepEdit.cancel")}
          </button>
          <button
            onClick={() => onSave({ ...initial, name, slug, body, is_default: isDefault })}
            disabled={busy || !name.trim() || !body.trim()}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {t("stepEdit.save")}
          </button>
        </div>
      }
    >
      <div className="space-y-3 text-sm">
        <label className="block">
          <span className="mb-1 block font-medium">{t("templates.name")}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-neutral-300 px-2 py-1"
          />
        </label>
        <label className="block">
          <span className="mb-1 block font-medium">{t("templates.slug")}</span>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder={t("templates.slugHint")}
            className="w-full rounded-md border border-neutral-300 px-2 py-1 font-mono"
          />
        </label>
        <label className="block">
          <span className="mb-1 block font-medium">
            {t("templates.body")} <span className="font-mono text-neutral-400">/{section}/</span>
          </span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            className="w-full rounded-md border border-neutral-300 px-2 py-1 font-mono text-xs"
          />
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
          />
          {t("templates.isDefault")}
        </label>
      </div>
    </Modal>
  );
}
