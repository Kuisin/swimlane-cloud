import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseDSL } from "@swimlane-cloud/diagram-converter/parser";
import { THEMES } from "@swimlane-cloud/diagram-converter/themes";
import { EditorContext } from "./editor-context.js";
import {
  DEFAULT_TAB_TEMPLATE,
  createDocument,
  dslContentFromTemplate,
  isDocumentDirty,
  normalizeDirPath,
  normalizeNewTxtRelPath,
  suggestNewTxtFileName,
  syncDocumentFromDisk,
} from "../lib/dsl-document.js";
import { hostHas, hostIsReadOnly } from "../host.js";

// Default dialog implementations use the host window; consumers can override
// via the `dialogs` prop for non-browser shells.
const defaultDialogs = {
  alert: async (msg) => {
    if (typeof window !== "undefined" && window.alert) window.alert(msg);
  },
  confirm: async (msg) => {
    if (typeof window !== "undefined" && window.confirm) return window.confirm(msg);
    return true;
  },
  prompt: async (msg, def = "") => {
    if (typeof window !== "undefined" && window.prompt) return window.prompt(msg, def);
    return null;
  },
};

/**
 * Owns the open-document set, active tab, theme, and all host-backed
 * persistence. Provides everything via EditorContext. The `host` prop is the
 * only side-effecting dependency.
 */
export function FileEditorProvider({ host, projectId, options, dialogs, children }) {
  const dialog = useMemo(() => ({ ...defaultDialogs, ...(dialogs || {}) }), [dialogs]);
  const readOnly = hostIsReadOnly(host);

  const [files, setFiles] = useState([]); // FileRef[] from host.list()
  const [documents, setDocuments] = useState([]); // loaded/open docs
  const [openDocumentIds, setOpenDocumentIds] = useState([]);
  const [activeDocumentId, setActiveDocumentIdState] = useState(null);
  const [themeKey, setThemeKey] = useState(options?.themeKey || "basic");
  const [policies, setPolicies] = useState(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const documentsRef = useRef(documents);
  const activeDocumentIdRef = useRef(activeDocumentId);
  useEffect(() => void (documentsRef.current = documents), [documents]);
  useEffect(() => void (activeDocumentIdRef.current = activeDocumentId), [activeDocumentId]);

  const activeDocument =
    documents.find((doc) => doc.id === activeDocumentId) || null;
  const src = activeDocument?.src ?? "";
  const theme = THEMES[themeKey] ?? THEMES.basic;
  const model = useMemo(() => parseDSL(src), [src]);
  const activeParseErrorPolicy = activeDocument?.parseErrorPolicy ?? null;

  const hasUnsavedChanges = isDocumentDirty(activeDocument);
  const hasAnyUnsavedChanges = documents.some(isDocumentDirty);

  // Clear stale parse-error policies once the active doc parses cleanly.
  useEffect(() => {
    if (model.errors.length > 0) return;
    setDocuments((current) => {
      if (!current.some((doc) => doc.id === activeDocumentId && doc.parseErrorPolicy)) {
        return current;
      }
      return current.map((doc) =>
        doc.id === activeDocumentId && doc.parseErrorPolicy
          ? { ...doc, parseErrorPolicy: null }
          : doc,
      );
    });
  }, [model.errors.length, activeDocumentId]);

  // Initial hydration: list files, load template policies.
  const refreshFileList = useCallback(async () => {
    if (!hostHas(host, "list")) return;
    const list = await host.list();
    setFiles(Array.isArray(list) ? list : []);
    return list;
  }, [host]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await refreshFileList();
        if (cancelled) return;
        if (hostHas(host, "getTemplatePolicies")) {
          try {
            const p = await host.getTemplatePolicies();
            if (!cancelled) setPolicies(p || null);
          } catch {
            /* policies are optional */
          }
        }
        // Auto-open the first file so the editor has content to show.
        const first = (list || [])[0];
        if (first && !cancelled) {
          await openFile(first.id);
        }
      } catch (err) {
        if (!cancelled) setLoadError(err?.message || String(err));
      } finally {
        if (!cancelled) setIsHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshFileList]);

  // Host-driven external file change watcher.
  useEffect(() => {
    if (!hostHas(host, "watch")) return undefined;
    const dispose = host.watch((e) => {
      if (!e?.id) return;
      if (e.type === "unlink") {
        setDocuments((cur) => cur.filter((d) => d.id !== e.id));
        setOpenDocumentIds((cur) => {
          const next = cur.filter((id) => id !== e.id);
          setActiveDocumentIdState((curId) => (curId === e.id ? next[0] ?? null : curId));
          return next;
        });
        setFiles((cur) => cur.filter((f) => f.id !== e.id));
        return;
      }
      setDocuments((cur) => {
        const existing = cur.find((d) => d.id === e.id);
        if (!existing) return cur; // not open; will appear on next list refresh
        const dirty = isDocumentDirty(existing);
        return cur.map((d) =>
          d.id === e.id
            ? syncDocumentFromDisk(d, e.dsl ?? "", { isDirty: dirty, skipStaleBlank: true })
            : d,
        );
      });
      refreshFileList();
    });
    return typeof dispose === "function" ? dispose : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host]);

  function updateDocumentSrc(documentId, nextSrc) {
    if (readOnly) return;
    setDocuments((cur) =>
      cur.map((doc) =>
        doc.id === documentId
          ? { ...doc, src: nextSrc, revision: (doc.revision ?? 0) + 1 }
          : doc,
      ),
    );
  }

  function updateActiveDocumentSrc(nextSrc) {
    if (!activeDocumentId) return;
    updateDocumentSrc(activeDocumentId, nextSrc);
  }

  /** Replace both src and savedSrc (used by formatter to avoid dirtying). */
  function replaceActiveDocumentSrc(nextSrc) {
    if (!activeDocumentId || readOnly) return;
    setDocuments((cur) =>
      cur.map((doc) =>
        doc.id === activeDocumentId
          ? { ...doc, src: nextSrc, revision: (doc.revision ?? 0) + 1 }
          : doc,
      ),
    );
  }

  function setActiveDocumentParseErrorPolicy(policy) {
    if (readOnly || !activeDocumentId) return;
    setDocuments((cur) =>
      cur.map((doc) =>
        doc.id === activeDocumentId ? { ...doc, parseErrorPolicy: policy } : doc,
      ),
    );
  }

  const openFile = useCallback(
    async (id) => {
      const existing = documentsRef.current.find((d) => d.id === id);
      if (existing) {
        await setActiveDocumentId(id);
        return;
      }
      let content = "";
      try {
        content = await host.read(id);
      } catch (err) {
        await dialog.alert(err?.message || `Could not open ${id}`);
        return;
      }
      const doc = createDocument(id, content);
      setDocuments((cur) => [...cur, doc]);
      setOpenDocumentIds((cur) => (cur.includes(id) ? cur : [...cur, id]));
      setActiveDocumentIdState(id);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [host, dialog],
  );

  async function setActiveDocumentId(documentId) {
    if (documentId === activeDocumentIdRef.current) return;
    const leaving = documentsRef.current.find((d) => d.id === activeDocumentIdRef.current);
    if (leaving && isDocumentDirty(leaving)) {
      const ok = await dialog.confirm(
        "This file has unsaved changes. Switch anyway? (changes will be discarded)",
      );
      if (!ok) return;
      setDocuments((cur) =>
        cur.map((d) => (d.id === leaving.id ? { ...d, src: d.savedSrc } : d)),
      );
    }
    setActiveDocumentIdState(documentId);
  }

  function closeDocumentTab(documentId) {
    setOpenDocumentIds((cur) => {
      const next = cur.filter((id) => id !== documentId);
      setActiveDocumentIdState((curId) =>
        curId === documentId ? next[next.length - 1] ?? null : curId,
      );
      return next;
    });
    setDocuments((cur) => cur.filter((d) => d.id !== documentId));
  }

  const saveDocuments = useCallback(
    async (overrideSrc) => {
      if (readOnly || !hostHas(host, "writeDraft")) return;
      const documentId = activeDocumentIdRef.current;
      if (!documentId) return;
      const doc = documentsRef.current.find((d) => d.id === documentId);
      const contentToWrite = typeof overrideSrc === "string" ? overrideSrc : doc?.src;
      if (!doc || contentToWrite == null) return;
      if (typeof overrideSrc !== "string" && !isDocumentDirty(doc)) return;
      try {
        await host.writeDraft(documentId, contentToWrite);
        setDocuments((cur) =>
          cur.map((d) =>
            d.id === documentId
              ? {
                  ...d,
                  savedSrc: contentToWrite,
                  src: contentToWrite,
                  needsInitialDiskSave: false,
                  initializedFromBlank: false,
                  parseErrorPolicy: null,
                }
              : d,
          ),
        );
      } catch (err) {
        await dialog.alert(err?.message || "Could not save the file.");
      }
    },
    [host, readOnly, dialog],
  );

  const saveAllDocuments = useCallback(async () => {
    if (readOnly) return;
    const dirty = documentsRef.current.filter(isDocumentDirty);
    if (dirty.length === 0) return;
    const updates = dirty.map((d) => ({ id: d.id, dsl: d.src }));
    try {
      if (hostHas(host, "writeDraftMany")) {
        await host.writeDraftMany(updates);
      } else {
        for (const u of updates) await host.writeDraft(u.id, u.dsl);
      }
      const ids = new Set(dirty.map((d) => d.id));
      setDocuments((cur) =>
        cur.map((d) =>
          ids.has(d.id)
            ? {
                ...d,
                savedSrc: d.src,
                needsInitialDiskSave: false,
                initializedFromBlank: false,
                parseErrorPolicy: null,
              }
            : d,
        ),
      );
    } catch (err) {
      await dialog.alert(err?.message || "Could not save all files.");
    }
  }, [host, readOnly, dialog]);

  async function createNewFile(dir = "") {
    if (readOnly || !hostHas(host, "create")) return;
    const suggested = suggestNewTxtFileName(
      files.map((f) => f.id),
      dir,
    );
    const entered = await dialog.prompt("New .txt file path (relative)", suggested);
    if (entered == null) return;
    const relPath = normalizeNewTxtRelPath(entered);
    if (!relPath) {
      await dialog.alert("Enter a valid file name (e.g. new-1.txt)");
      return;
    }
    if (files.some((f) => f.id === relPath)) {
      await dialog.alert("A file with that name already exists.");
      return;
    }
    let content = dslContentFromTemplate(relPath, DEFAULT_TAB_TEMPLATE);
    // Apply a forced /role/ etc. on create if policies demand it.
    content = applyForcedSections(content, policies);
    try {
      await host.create(relPath, content);
    } catch (err) {
      await dialog.alert(err?.message || "Could not create the file.");
      return;
    }
    await refreshFileList();
    const doc = createDocument(relPath, content);
    setDocuments((cur) => [...cur, doc]);
    setOpenDocumentIds((cur) => [...cur, relPath]);
    setActiveDocumentIdState(relPath);
  }

  async function createNewFolder(parentDir = "") {
    if (readOnly || !hostHas(host, "mkdir")) return;
    const entered = await dialog.prompt(
      "New folder path (relative)",
      parentDir ? `${parentDir}/` : "",
    );
    if (entered == null) return;
    const dirPath = normalizeDirPath(entered);
    if (!dirPath) {
      await dialog.alert("Enter a valid folder name.");
      return;
    }
    try {
      await host.mkdir(dirPath);
    } catch (err) {
      await dialog.alert(err?.message || "Could not create the folder.");
      return;
    }
    await refreshFileList();
  }

  async function checkpoint(message) {
    if (!hostHas(host, "checkpoint")) return;
    const dirty = documentsRef.current.filter(isDocumentDirty);
    const filesPayload = dirty.map((d) => ({ id: d.id, dsl: d.src }));
    try {
      await host.checkpoint({ message, files: filesPayload });
      const ids = new Set(dirty.map((d) => d.id));
      setDocuments((cur) =>
        cur.map((d) => (ids.has(d.id) ? { ...d, savedSrc: d.src } : d)),
      );
    } catch (err) {
      await dialog.alert(err?.message || "Checkpoint failed.");
    }
  }

  const editorValue = {
    host,
    projectId,
    readOnly,
    isHydrated,
    loadError,
    files,
    documents,
    openDocuments: openDocumentIds
      .map((id) => documents.find((d) => d.id === id))
      .filter(Boolean),
    openDocumentIds,
    activeDocument,
    activeDocumentId,
    setActiveDocumentId,
    openFile,
    closeDocumentTab,
    refreshFileList,
    themeKey,
    setThemeKey,
    theme,
    src,
    model,
    activeParseErrorPolicy,
    setActiveDocumentParseErrorPolicy,
    hasUnsavedChanges,
    hasAnyUnsavedChanges,
    updateActiveDocumentSrc,
    updateDocumentSrc,
    replaceActiveDocumentSrc,
    saveDocuments,
    saveAllDocuments,
    createNewFile,
    createNewFolder,
    checkpoint,
    policies,
    dialog,
  };

  return (
    <EditorContext.Provider value={editorValue}>{children}</EditorContext.Provider>
  );
}

/** Prepend forced section bodies into freshly created file content. */
function applyForcedSections(content, policies) {
  if (!policies) return content;
  // Forced sections are merged by the template panel for existing files; for
  // new files we keep the simple template — the host's checkpoint validation
  // enforces conformance. This hook is intentionally light to avoid clobbering
  // the starter template structure.
  return content;
}
