/**
 * SaaS EditorHost factory. Implements the EditorHost contract (plan §A4) by
 * calling the SaaS API routes. The editor depends only on this contract, never
 * on Gitea/Supabase directly.
 */

export interface FileRef {
  id: string;
  name: string;
  mtime?: number;
}

export interface EditorHost {
  root?(): Promise<string | null>;
  list(): Promise<FileRef[]>;
  read(id: string): Promise<string>;
  writeDraft(id: string, dsl: string): Promise<void>;
  writeDraftMany?(updates: { id: string; dsl: string }[]): Promise<void>;
  checkpoint?(opts: { message?: string; files?: { id: string; dsl: string }[] }): Promise<void>;
  create(id: string, dsl: string): Promise<void>;
  mkdir?(dirPath: string): Promise<void>;
  // SaaS-only versioning trigger (plan Step 1.5 / 2.1).
  flagNewVersion?(commitSha: string, opts: { name: string; note?: string }): Promise<void>;
  listSectionTemplates?(
    section: "page" | "option" | "role" | "block" | "prop",
  ): Promise<{ slug: string; name: string; body: string; isDefault?: boolean }[]>;
  getTemplatePolicies?(): Promise<
    Record<
      "page" | "option" | "role" | "block" | "prop",
      { mode: "optional" | "default" | "forced"; forcedTemplateId?: string; forcedBody?: string }
    >
  >;
  capabilities?: { readOnly?: boolean; versioning?: boolean };
}

export interface SaasHostOptions {
  projectId: string;
  branch: string; // main | test | tmp-*
  /** Diagram id resolver: maps a filepath to its diagram id (for flagNewVersion). */
  resolveDiagramId?: (filepath: string) => Promise<string | null>;
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      const body = await res.json();
      msg = body.error ?? msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function createSaasHost(opts: SaasHostOptions): EditorHost {
  const { projectId, branch } = opts;
  const base = `/api/projects/${projectId}`;

  return {
    capabilities: { versioning: true },

    async root() {
      return `${projectId}@${branch}`;
    },

    async list() {
      const data = await jsonFetch<{ files: FileRef[] }>(
        `${base}/tree?branch=${encodeURIComponent(branch)}`,
      );
      return data.files;
    },

    async read(id) {
      const data = await jsonFetch<{ dsl: string }>(
        `${base}/file?branch=${encodeURIComponent(branch)}&path=${encodeURIComponent(id)}`,
      );
      return data.dsl;
    },

    async writeDraft(id, dsl) {
      await jsonFetch(`${base}/draft`, {
        method: "POST",
        body: JSON.stringify({ branch, files: [{ id, dsl }] }),
      });
    },

    async writeDraftMany(updates) {
      await jsonFetch(`${base}/draft`, {
        method: "POST",
        body: JSON.stringify({ branch, files: updates }),
      });
    },

    async checkpoint({ message, files } = {}) {
      await jsonFetch(`${base}/checkpoint`, {
        method: "POST",
        body: JSON.stringify({ branch, message, files }),
      });
    },

    async create(id, dsl) {
      // New file = write a draft for the new path; it lands in git on checkpoint.
      await jsonFetch(`${base}/draft`, {
        method: "POST",
        body: JSON.stringify({ branch, files: [{ id, dsl }] }),
      });
    },

    async mkdir(dirPath) {
      // Represent a new folder via a .gitkeep draft (committed on checkpoint).
      const keep = dirPath.replace(/\/+$/, "") + "/.gitkeep";
      await jsonFetch(`${base}/draft`, {
        method: "POST",
        body: JSON.stringify({ branch, files: [{ id: keep, dsl: "" }] }),
      });
    },

    async flagNewVersion(commitSha, flagOpts) {
      // Resolve the diagram id for the currently active file is the caller's job;
      // we default to the project-level flag endpoint keyed by commit + branch.
      const diagramId = opts.resolveDiagramId ? await opts.resolveDiagramId(flagOpts.name) : null;
      if (!diagramId) {
        throw new Error("flagNewVersion requires a diagram id (pass resolveDiagramId).");
      }
      await jsonFetch(`/api/diagrams/${diagramId}/versions`, {
        method: "POST",
        body: JSON.stringify({
          commitSha,
          branch,
          name: flagOpts.name,
          note: flagOpts.note,
        }),
      });
    },

    async listSectionTemplates(section) {
      const data = await jsonFetch<{
        templates: { slug: string; name: string; body: string; is_default?: boolean }[];
      }>(`${base}/templates?section=${section}`);
      return data.templates.map((t) => ({
        slug: t.slug,
        name: t.name,
        body: t.body,
        isDefault: t.is_default,
      }));
    },

    async getTemplatePolicies() {
      const data = await jsonFetch<{
        policies: Record<
          string,
          {
            mode: "optional" | "default" | "forced";
            forcedTemplateId?: string;
            forcedBody?: string;
          }
        >;
      }>(`${base}/template-policies`);
      // Ensure all five sections are present.
      const sections = ["page", "option", "role", "block", "prop"] as const;
      const out = {} as Record<
        (typeof sections)[number],
        { mode: "optional" | "default" | "forced"; forcedTemplateId?: string; forcedBody?: string }
      >;
      for (const s of sections) {
        out[s] = data.policies[s] ?? { mode: "optional" };
      }
      return out;
    },
  };
}
