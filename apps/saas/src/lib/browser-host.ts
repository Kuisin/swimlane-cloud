import type { EditorHost, FileRef } from "./saas-host";

/**
 * localStorage-backed EditorHost for the demo build (no Gitea/Supabase). Files
 * are namespaced per project under `swimlane-demo:<namespace>`, keyed by POSIX
 * relative path so the editor builds its folder tree. Seeds on first use.
 */
type Stored = Record<string, { content: string; mtime: number }>;

export function createBrowserHost(
  namespace: string,
  seed: Record<string, string> = {},
): EditorHost {
  const KEY = `swimlane-demo:${namespace}`;

  const load = (): Stored => {
    if (typeof localStorage === "undefined") return {};
    try {
      return JSON.parse(localStorage.getItem(KEY) || "{}") as Stored;
    } catch {
      return {};
    }
  };
  const save = (s: Stored) => {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(KEY, JSON.stringify(s));
    }
  };

  // First-run seed.
  if (typeof localStorage !== "undefined" && localStorage.getItem(KEY) === null) {
    const now = Date.now();
    const init: Stored = {};
    for (const [path, content] of Object.entries(seed)) {
      init[path] = { content, mtime: now };
    }
    save(init);
  }

  return {
    capabilities: { readOnly: false, versioning: false },

    async root() {
      return namespace;
    },

    async list(): Promise<FileRef[]> {
      const store = load();
      return Object.entries(store).map(([id, v]) => ({
        id,
        name: id.split("/").pop() ?? id,
        mtime: v.mtime,
      }));
    },

    async read(id: string): Promise<string> {
      const store = load();
      return store[id]?.content ?? "";
    },

    async writeDraft(id: string, dsl: string): Promise<void> {
      const store = load();
      store[id] = { content: dsl, mtime: Date.now() };
      save(store);
    },

    async writeDraftMany(updates: { id: string; dsl: string }[]): Promise<void> {
      const store = load();
      const now = Date.now();
      for (const u of updates) store[u.id] = { content: u.dsl, mtime: now };
      save(store);
    },

    async create(id: string, dsl: string): Promise<void> {
      const store = load();
      store[id] = { content: dsl, mtime: Date.now() };
      save(store);
    },

    async mkdir(dirPath: string): Promise<void> {
      const keep = dirPath.replace(/\/+$/, "") + "/.keep";
      const store = load();
      if (!store[keep]) {
        store[keep] = { content: "", mtime: Date.now() };
        save(store);
      }
    },
  };
}
