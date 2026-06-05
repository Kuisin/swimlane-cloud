"use client";

import { useCallback, useEffect, useState } from "react";

const SECTIONS = ["page", "option", "role", "block", "prop"] as const;
type Section = (typeof SECTIONS)[number];

interface Template {
  id: string;
  section: Section;
  name: string;
  slug: string;
  body: string;
  is_default: boolean;
}

interface Policy {
  mode: "optional" | "default" | "forced";
  forcedTemplateId?: string;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `${res.status}`);
  }
  return res.json();
}

export default function TemplatesManager({ projectId }: { projectId: string }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [policies, setPolicies] = useState<Record<string, Policy>>({});
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<Section>("role");
  const [name, setName] = useState("");
  const [body, setBody] = useState("");

  const reload = useCallback(async () => {
    setError(null);
    try {
      const t = await api<{ templates: Template[] }>(
        `/api/projects/${projectId}/templates`,
      );
      setTemplates(t.templates);
      const p = await api<{ policies: Record<string, Policy> }>(
        `/api/projects/${projectId}/template-policies`,
      );
      setPolicies(p.policies);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }, [projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function createTemplate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api(`/api/projects/${projectId}/templates`, {
        method: "POST",
        body: JSON.stringify({ section, name, body }),
      });
      setName("");
      setBody("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      await api(`/api/projects/${projectId}/templates?id=${id}`, {
        method: "DELETE",
      });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  async function setPolicy(
    sec: Section,
    mode: Policy["mode"],
    forcedTemplateId?: string,
  ) {
    setError(null);
    try {
      await api(`/api/projects/${projectId}/template-policies`, {
        method: "PATCH",
        body: JSON.stringify({
          section: sec,
          mode,
          forced_template_id: forcedTemplateId,
        }),
      });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Policy update failed");
    }
  }

  return (
    <div className="space-y-8">
      {error && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      {/* Per-section force policy */}
      <section>
        <h2 className="mb-3 text-sm font-medium text-neutral-700">
          Section policies
        </h2>
        <div className="space-y-2">
          {SECTIONS.map((sec) => {
            const pol = policies[sec] ?? { mode: "optional" };
            const sectionTemplates = templates.filter((t) => t.section === sec);
            return (
              <div
                key={sec}
                className="flex flex-wrap items-center gap-3 rounded-md border border-neutral-200 p-3 text-sm"
              >
                <span className="w-16 font-mono">/{sec}/</span>
                <select
                  value={pol.mode}
                  onChange={(e) => {
                    const mode = e.target.value as Policy["mode"];
                    if (mode === "forced") {
                      setPolicy(sec, mode, sectionTemplates[0]?.id);
                    } else {
                      setPolicy(sec, mode);
                    }
                  }}
                  className="rounded border border-neutral-300 px-2 py-1"
                >
                  <option value="optional">Optional</option>
                  <option value="default">Default</option>
                  <option value="forced">Force</option>
                </select>
                {pol.mode === "forced" && (
                  <select
                    value={pol.forcedTemplateId ?? ""}
                    onChange={(e) => setPolicy(sec, "forced", e.target.value)}
                    className="rounded border border-neutral-300 px-2 py-1"
                  >
                    {sectionTemplates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Template list */}
      <section>
        <h2 className="mb-3 text-sm font-medium text-neutral-700">Templates</h2>
        <ul className="space-y-2">
          {templates.map((t) => (
            <li
              key={t.id}
              className="flex items-start justify-between gap-3 rounded-md border border-neutral-200 p-3 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium">
                  <span className="font-mono text-neutral-400">/{t.section}/</span>{" "}
                  {t.name}
                  {t.is_default && (
                    <span className="ml-2 rounded bg-neutral-100 px-1 text-xs text-neutral-500">
                      default
                    </span>
                  )}
                </p>
                <pre className="mt-1 max-h-24 overflow-auto rounded bg-neutral-50 p-2 text-xs text-neutral-600">
                  {t.body}
                </pre>
              </div>
              <button
                onClick={() => remove(t.id)}
                className="shrink-0 text-xs text-red-600 hover:underline"
              >
                Delete
              </button>
            </li>
          ))}
          {templates.length === 0 && (
            <li className="text-sm text-neutral-400">No templates yet.</li>
          )}
        </ul>
      </section>

      {/* Create */}
      <section>
        <h2 className="mb-3 text-sm font-medium text-neutral-700">
          New template
        </h2>
        <form onSubmit={createTemplate} className="space-y-3">
          <div className="flex gap-3">
            <select
              value={section}
              onChange={(e) => setSection(e.target.value as Section)}
              className="rounded border border-neutral-300 px-2 py-1 text-sm"
            >
              {SECTIONS.map((s) => (
                <option key={s} value={s}>
                  /{s}/
                </option>
              ))}
            </select>
            <input
              placeholder="Template name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="flex-1 rounded border border-neutral-300 px-2 py-1 text-sm"
            />
          </div>
          <textarea
            placeholder="DSL fragment for this section"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
            rows={4}
            className="w-full rounded border border-neutral-300 p-2 font-mono text-xs"
          />
          <button
            type="submit"
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Create template
          </button>
        </form>
      </section>
    </div>
  );
}
