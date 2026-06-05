// desktop-host.js — the only glue between the Electron `window.api` IPC bridge
// and the storage-agnostic EditorHost contract the shared editor consumes (plan §A4 / §A5.4).
// id = POSIX relative path within the opened folder root, e.g. "ops/onboarding/flow.txt".

const api = () => {
  if (typeof window === "undefined" || !window.api) {
    throw new Error("window.api is unavailable (not running inside Electron preload)");
  }
  return window.api;
};

export const desktopHost = {
  // Opened folder path (or null if nothing is open yet).
  root: () => api().getOpenedFolder(),

  // Recursive listing of every .txt under the root. The main process returns
  // { name: posixRelPath, content, mtime }; the editor wants FileRef[] with
  // id = posix relative path. Map name -> id (keep name for display) and drop content.
  list: async () => {
    const files = await api().readTxtFiles();
    return (files || []).map((f) => ({
      id: f.name,
      name: f.name,
      mtime: f.mtime,
    }));
  },

  read: (id) => api().readFile(id),

  writeDraft: async (id, dsl) => {
    await api().writeTxtFile(id, dsl);
  },

  writeDraftMany: async (updates) => {
    await api().writeTxtFiles(updates);
  },

  create: async (id, dsl) => {
    await api().createTxtFile(id, dsl);
  },

  mkdir: async (dir) => {
    await api().makeDir(dir);
  },

  // chokidar file-changed events arrive as { name, content, eventType };
  // adapt to the EditorHost watch shape { id, dsl, type }.
  watch: (cb) => {
    api().onFileChanged(({ name, content, eventType }) => {
      cb({ id: name, dsl: content, type: eventType });
    });
    return () => api().removeFileChangedListener();
  },

  capabilities: { readOnly: false, versioning: false },
};
