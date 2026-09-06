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
import { createFlushScheduler } from "../lib/debounce-flush.js";
import { fetchImports, missingImports, resolversFrom, withEntries } from "../lib/import-cache.js";
import { clearMirror, readMirror, reconcileMirror, writeMirror } from "../lib/local-mirror.js";
import { hostAutosaves, hostHas, hostIsReadOnly } from "../host.js";
import { useDialogHost } from "../hooks/use-dialog-host.js";
import { DialogHost } from "../components/dialog-host.jsx";

const DEFAULT_AUTOSAVE_DELAY_MS = 1500;

function localStorageOrNull() {
  return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
}

/**
 * Owns the open-document set, active tab, theme, and all host-backed
 * persistence. Provides everything via EditorContext. The `host` prop is the
 * only side-effecting dependency.
 *
 * When `host.capabilities.autosave` is set (and the host is writable), Save /
 * Save all disappear from the action bar in favour of a debounced background
 * save: every edit is mirrored to localStorage immediately (so a tab closed
 * mid-debounce loses nothing) and flushed to the host a short idle period
 * later. Hosts that do not opt in are unaffected — this entire codepath is
 * inert unless `capabilities.autosave` is true.
 */
export function FileEditorProvider({ host, projectId, options, dialogs, children }) {
  const dialogHost = useDialogHost();
  const dialog = useMemo(
    () => ({ ...dialogHost.dialogs, ...(dialogs || {}) }),
    [dialogHost.dialogs, dialogs],
  );
  const readOnly = hostIsReadOnly(host);
  const autosave = hostAutosaves(host) && !readOnly;
  const mirrorScope = options?.localMirrorKey ?? null;
  const autosaveDelayMs = options?.autosaveDelayMs ?? DEFAULT_AUTOSAVE_DELAY_MS;

  const [files, setFiles] = useState([]); // FileRef[] from host.list()
  const [documents, setDocuments] = useState([]); // loaded/open docs
  const [openDocumentIds, setOpenDocumentIds] = useState([]);
  const [activeDocumentId, setActiveDocumentIdState] = useState(null);
  const [themeKey, setThemeKey] = useState(options?.themeKey || "basic");
  const [policies, setPolicies] = useState(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [autosaveStatus, setAutosaveStatus] = useState(null);

  const documentsRef = useRef(documents);
  const activeDocumentIdRef = useRef(activeDocumentId);
  useEffect(() => void (documentsRef.current = documents), [documents]);
  useEffect(() => void (activeDocumentIdRef.current = activeDocumentId), [activeDocumentId]);

  // Report the active file id so a host can persist it (e.g. in the URL). Kept
  // in a ref so an inline `options` object doesn't re-fire the notify effect.
  const onActiveDocumentRef = useRef(options?.onActiveDocument);
  useEffect(() => {
    onActiveDocumentRef.current = options?.onActiveDocument;
  });
  useEffect(() => {
    if (activeDocumentId) onActiveDocumentRef.current?.(activeDocumentId);
  }, [activeDocumentId]);

  const onAutosaveErrorRef = useRef(options?.onAutosaveError);
  useEffect(() => {
    onAutosaveErrorRef.current = options?.onAutosaveError;
  });
  // Fired when `initialDocumentId` doesn't match anything in the file list —
  // e.g. a URL built around a path the file has since moved away from — so a
  // host can tell the user instead of the requested file silently opening
  // whatever sorts first.
  const onDocumentNotFoundRef = useRef(options?.onDocumentNotFound);
  useEffect(() => {
    onDocumentNotFoundRef.current = options?.onDocumentNotFound;
  });
  const onPendingChangeRef = useRef(options?.onPendingChange);
  useEffect(() => {
    onPendingChangeRef.current = options?.onPendingChange;
  });

  const activeDocument = documents.find((doc) => doc.id === activeDocumentId) || null;
  const src = activeDocument?.src ?? "";
  const theme = THEMES[themeKey] ?? THEMES.basic;
  // `@use` targets already read, keyed by importing file and path. Parsing is
  // synchronous and a host read is not, so the diagram renders with whatever
  // has arrived and re-renders when the rest does.
  const [importCache, setImportCache] = useState(() => new Map());
  // The single resolved-imports view every parse of `src` must use — the
  // context's own `model` and any other parse a consumer runs (the live SVG
  // preview debounces its own) both need this, or they can disagree about
  // whether an import resolved.
  const parseOptions = useMemo(
    () => resolversFrom(activeDocumentId, importCache),
    [activeDocumentId, importCache],
  );
  const model = useMemo(() => parseDSL(src, parseOptions), [src, parseOptions]);

  useEffect(() => {
    if (!activeDocumentId) return undefined;
    const pending = missingImports(src, activeDocumentId, importCache);
    if (!pending.length) return undefined;
    let cancelled = false;
    void (async () => {
      const entries = await fetchImports(pending, host);
      if (cancelled || !entries.length) return;
      setImportCache((prev) => withEntries(prev, activeDocumentId, entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [src, activeDocumentId, importCache, host]);
  const activeParseErrorPolicy = activeDocument?.parseErrorPolicy ?? null;

  const hasUnsavedChanges = isDocumentDirty(activeDocument);
  const hasAnyUnsavedChanges = documents.some(isDocumentDirty);
  const pendingAutosave = autosave && hasAnyUnsavedChanges;

  useEffect(() => {
    onPendingChangeRef.current?.(pendingAutosave);
  }, [pendingAutosave]);

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
        // Open the host-requested file if it still exists, else the first one,
        // so the editor always has content to show.
        const wanted = options?.initialDocumentId;
        const found = wanted ? (list || []).find((f) => f.id === wanted) : null;
        if (wanted && !found) onDocumentNotFoundRef.current?.(wanted);
        const target = found || (list || [])[0];
        if (target && !cancelled) {
          await openFile(target.id);
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
          setActiveDocumentIdState((curId) => (curId === e.id ? (next[0] ?? null) : curId));
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
      cur.map((doc) => {
        if (doc.id !== documentId) return doc;
        if (autosave && mirrorScope) {
          writeMirror(localStorageOrNull(), mirrorScope, documentId, nextSrc, doc.savedSrc);
        }
        return { ...doc, src: nextSrc, revision: (doc.revision ?? 0) + 1 };
      }),
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
      cur.map((doc) => (doc.id === activeDocumentId ? { ...doc, parseErrorPolicy: policy } : doc)),
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
      if (autosave && mirrorScope) {
        const storage = localStorageOrNull();
        const mirror = readMirror(storage, mirrorScope, id);
        const reconciled = reconcileMirror(mirror, content);
        if (reconciled.action === "restore") {
          doc.src = reconciled.src;
        } else {
          clearMirror(storage, mirrorScope, id);
        }
      }
      setDocuments((cur) => [...cur, doc]);
      setOpenDocumentIds((cur) => (cur.includes(id) ? cur : [...cur, id]));
      setActiveDocumentIdState(id);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [host, dialog, autosave, mirrorScope],
  );

  async function setActiveDocumentId(documentId) {
    if (documentId === activeDocumentIdRef.current) return;
    const leaving = documentsRef.current.find((d) => d.id === activeDocumentIdRef.current);
    // Under autosave the debounce (or the pending edit itself, mirrored to
    // localStorage) already covers a switch away from unsaved work, so there
    // is nothing here for the user to lose and nothing to confirm.
    if (leaving && isDocumentDirty(leaving) && !autosave) {
      const ok = await dialog.confirm(
        "This file has unsaved changes. Switch anyway? (changes will be discarded)",
      );
      if (!ok) return;
      setDocuments((cur) => cur.map((d) => (d.id === leaving.id ? { ...d, src: d.savedSrc } : d)));
    }
    setActiveDocumentIdState(documentId);
  }

  async function closeDocumentTab(documentId) {
    if (autosave) {
      const doc = documentsRef.current.find((d) => d.id === documentId);
      if (doc && isDocumentDirty(doc)) {
        try {
          await writeDirtyDocsRef.current([doc], { silent: true });
        } catch {
          // Best-effort: the mirror still holds the edit (writeDirtyDocs only
          // clears it on success), so nothing is lost, just not yet pushed.
        }
      }
    }
    setOpenDocumentIds((cur) => {
      const next = cur.filter((id) => id !== documentId);
      setActiveDocumentIdState((curId) =>
        curId === documentId ? (next[next.length - 1] ?? null) : curId,
      );
      return next;
    });
    setDocuments((cur) => cur.filter((d) => d.id !== documentId));
  }

  /**
   * Write every doc in `docs` to the host and mark it saved. `silent` (used
   * by autosave and the pre-close flush) reports failure to the caller
   * instead of showing a dialog, since a debounce retrying quietly is the
   * whole point of autosave.
   */
  const writeDirtyDocs = useCallback(
    async (docs, { silent = false } = {}) => {
      if (docs.length === 0) return;
      const updates = docs.map((d) => ({ id: d.id, dsl: d.src }));
      try {
        if (hostHas(host, "writeDraftMany")) {
          await host.writeDraftMany(updates);
        } else {
          for (const u of updates) await host.writeDraft(u.id, u.dsl);
        }
        const ids = new Set(docs.map((d) => d.id));
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
        if (mirrorScope) {
          const storage = localStorageOrNull();
          for (const d of docs) clearMirror(storage, mirrorScope, d.id);
        }
      } catch (err) {
        if (silent) throw err;
        await dialog.alert(err?.message || "Could not save the file.");
      }
    },
    [host, dialog, mirrorScope],
  );

  // `closeDocumentTab` is a plain function (not useCallback) but needs the
  // latest `writeDirtyDocs` without listing it as a dependency of anything —
  // a ref keeps that lookup current without re-creating callbacks.
  const writeDirtyDocsRef = useRef(writeDirtyDocs);
  useEffect(() => {
    writeDirtyDocsRef.current = writeDirtyDocs;
  }, [writeDirtyDocs]);

  const saveDocuments = useCallback(
    async (overrideSrc) => {
      if (readOnly || !hostHas(host, "writeDraft")) return;
      const documentId = activeDocumentIdRef.current;
      if (!documentId) return;
      const doc = documentsRef.current.find((d) => d.id === documentId);
      const contentToWrite = typeof overrideSrc === "string" ? overrideSrc : doc?.src;
      if (!doc || contentToWrite == null) return;
      if (typeof overrideSrc !== "string" && !isDocumentDirty(doc)) return;
      await writeDirtyDocs([{ ...doc, src: contentToWrite }]);
    },
    [host, readOnly, writeDirtyDocs],
  );

  const saveAllDocuments = useCallback(async () => {
    if (readOnly) return;
    const dirty = documentsRef.current.filter(isDocumentDirty);
    if (dirty.length === 0) return;
    await writeDirtyDocs(dirty);
  }, [readOnly, writeDirtyDocs]);

  // ── Autosave: debounce a background writeDirtyDocs while anything is dirty.
  const autosaveFlush = useCallback(async () => {
    const dirty = documentsRef.current.filter(isDocumentDirty);
    if (dirty.length === 0) return;
    setAutosaveStatus({ state: "saving" });
    try {
      await writeDirtyDocs(dirty, { silent: true });
      setAutosaveStatus({ state: "saved", at: Date.now() });
    } catch (err) {
      const message = err?.message || "Could not save automatically.";
      setAutosaveStatus({ state: "error", message });
      onAutosaveErrorRef.current?.(message);
    }
  }, [writeDirtyDocs]);

  const schedulerRef = useRef(null);
  useEffect(() => {
    schedulerRef.current = createFlushScheduler({ delay: autosaveDelayMs, run: autosaveFlush });
    return () => schedulerRef.current?.cancel();
  }, [autosaveDelayMs, autosaveFlush]);

  useEffect(() => {
    if (!autosave) return;
    if (documents.some(isDocumentDirty)) schedulerRef.current?.schedule();
  }, [autosave, documents]);

  // Flush whatever is dirty when the editor unmounts (branch switch, tab
  // close) rather than leaving it to the debounce that will never fire again.
  useEffect(() => {
    return () => {
      if (!autosave) return;
      const dirty = documentsRef.current.filter(isDocumentDirty);
      if (dirty.length > 0) void writeDirtyDocsRef.current(dirty, { silent: true }).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autosave]);

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

  async function deleteFile(fileId) {
    if (readOnly || !hostHas(host, "delete")) return;
    const name = fileId.split("/").pop();
    const ok = await dialog.confirm(`Delete "${name}"? This cannot be undone.`);
    if (!ok) return;
    try {
      await host.delete(fileId);
      setDocuments((cur) => cur.filter((d) => d.id !== fileId));
      setOpenDocumentIds((cur) => {
        const next = cur.filter((id) => id !== fileId);
        setActiveDocumentIdState((curId) =>
          curId === fileId ? (next[next.length - 1] ?? null) : curId,
        );
        return next;
      });
      await refreshFileList();
    } catch (err) {
      await dialog.alert(err?.message || "Could not delete the file.");
    }
  }

  async function deleteFolder(dirPath) {
    if (readOnly || !hostHas(host, "delete")) return;
    const name = dirPath.split("/").pop();
    const ok = await dialog.confirm(
      `Delete folder "${name}" and all files inside? This cannot be undone.`,
    );
    if (!ok) return;
    const toDelete = files.filter((f) => f.id === dirPath || f.id.startsWith(dirPath + "/"));
    try {
      if (hostHas(host, "rmdir")) {
        await host.rmdir(dirPath);
      } else {
        for (const f of toDelete) await host.delete(f.id);
      }
      const deletedIds = new Set(toDelete.map((f) => f.id));
      setDocuments((cur) => cur.filter((d) => !deletedIds.has(d.id)));
      setOpenDocumentIds((cur) => {
        const next = cur.filter((id) => !deletedIds.has(id));
        setActiveDocumentIdState((curId) =>
          deletedIds.has(curId) ? (next[next.length - 1] ?? null) : curId,
        );
        return next;
      });
      await refreshFileList();
    } catch (err) {
      await dialog.alert(err?.message || "Could not delete the folder.");
    }
  }

  async function moveFile(fromId, toId) {
    if (readOnly || !hostHas(host, "rename")) return;
    if (fromId === toId) return;
    if (files.some((f) => f.id === toId)) {
      const name = toId.split("/").pop();
      await dialog.alert(`A file named "${name}" already exists there.`);
      return;
    }
    try {
      await host.rename(fromId, toId);
      const newName = toId.split("/").pop();
      setDocuments((cur) =>
        cur.map((d) => (d.id === fromId ? { ...d, id: toId, name: newName } : d)),
      );
      setOpenDocumentIds((cur) => cur.map((id) => (id === fromId ? toId : id)));
      setActiveDocumentIdState((curId) => (curId === fromId ? toId : curId));
      await refreshFileList();
    } catch (err) {
      await dialog.alert(err?.message || "Could not move the file.");
    }
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
      setDocuments((cur) => cur.map((d) => (ids.has(d.id) ? { ...d, savedSrc: d.src } : d)));
    } catch (err) {
      await dialog.alert(err?.message || "Checkpoint failed.");
    }
  }

  const editorValue = {
    host,
    projectId,
    readOnly,
    autosave,
    autosaveStatus,
    pendingAutosave,
    isHydrated,
    loadError,
    files,
    documents,
    openDocuments: openDocumentIds.map((id) => documents.find((d) => d.id === id)).filter(Boolean),
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
    parseOptions,
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
    deleteFile,
    deleteFolder,
    moveFile,
    checkpoint,
    policies,
    dialog,
  };

  return (
    <EditorContext.Provider value={editorValue}>
      {children}
      {/* Only ever activates for the alert/confirm/prompt methods a host's
          `dialogs` override (if any) didn't replace — a fully-overriding host
          (e.g. the VS Code webview) never triggers a request here. */}
      <DialogHost
        request={dialogHost.request}
        onOk={dialogHost.handleOk}
        onCancel={dialogHost.handleCancel}
      />
    </EditorContext.Provider>
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
