/**
 * Per-file document model + helpers.
 *
 * Ported from the reference `apps/txt-editor/src/lib/dsl-document.js`. The
 * reference imported a default template via a bundler `?raw` import; here the
 * starter template is inlined so the package has no bundler-specific deps.
 */
import { parseDSL } from "@swimlane-cloud/diagram-converter/parser";

/** Minimal valid starter document. `新規ファイル` is the title placeholder. */
export const DEFAULT_TAB_TEMPLATE = `@kai-swimlane

/title/
新規ファイル

/role/

<user>
label: User;

/line/

[user: First step]

@end
`;

export function isBlankTxtContent(content) {
  return !String(content ?? "").trim();
}

export function normalizeTxtForCompare(content) {
  return String(content ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/** Whether the document differs from what is persisted. */
export function isDocumentDirty(doc) {
  if (!doc) return false;
  if (doc.needsInitialDiskSave) return true;
  return normalizeTxtForCompare(doc.src) !== normalizeTxtForCompare(doc.savedSrc);
}

export function shouldInitializeAsDsl(rawContent) {
  if (isBlankTxtContent(rawContent)) return true;
  const { errors } = parseDSL(rawContent);
  return errors.length === 1 && errors[0]?.msg === "@kai-swimlane marker not found";
}

export function isStaleBlankDiskRead(diskContent, editorSrc) {
  if (!isBlankTxtContent(diskContent)) return false;
  return parseDSL(editorSrc).errors.length === 0;
}

export function displayNameFromRelPath(relPath) {
  const parts = String(relPath).split("/");
  const fileName = parts[parts.length - 1] || relPath;
  return fileName.replace(/^\d+[_\-\s]/, "").replace(/\.txt$/i, "");
}

/** Build starter DSL; the title section uses the file base name when possible. */
export function dslContentFromTemplate(relPath, template = DEFAULT_TAB_TEMPLATE) {
  const title = displayNameFromRelPath(relPath) || "新規ファイル";
  const base = String(template ?? DEFAULT_TAB_TEMPLATE);
  if (base.includes("新規ファイル")) {
    return base.replace("新規ファイル", title);
  }
  return base;
}

export function suggestNewTxtFileName(existingRelPaths, dir = "") {
  const prefix = dir ? `${dir.replace(/\/$/, "")}/` : "";
  const ids = new Set(existingRelPaths);
  let n = 1;
  while (ids.has(`${prefix}new-${n}.txt`)) n += 1;
  return `${prefix}new-${n}.txt`;
}

/** Normalize a user-entered name to a relative `.txt` path (POSIX). */
export function normalizeNewTxtRelPath(input) {
  let name = String(input ?? "").trim().replace(/\\/g, "/");
  if (!name) return null;
  if (name.includes("..")) return null;
  name = name.replace(/^\/+/, "");
  if (!/\.txt$/i.test(name)) name = `${name}.txt`;
  return name;
}

/** Normalize a user-entered folder path (POSIX, no `..`, no leading slash). */
export function normalizeDirPath(input) {
  let p = String(input ?? "").trim().replace(/\\/g, "/");
  if (!p) return null;
  if (p.includes("..")) return null;
  return p.replace(/^\/+/, "").replace(/\/+$/, "");
}

/**
 * Map disk content to in-memory editor state. Blank files open as editable DSL
 * from the default template (dirty until saved).
 */
export function normalizeFileContent(relPath, rawContent) {
  const diskContent = rawContent ?? "";
  if (!shouldInitializeAsDsl(diskContent)) {
    const { errors } = parseDSL(diskContent);
    return {
      src: diskContent,
      savedSrc: diskContent,
      needsInitialDiskSave: false,
      parseErrorPolicy: errors.length > 0 ? "continue" : null,
      initializedFromBlank: false,
    };
  }
  const src = dslContentFromTemplate(relPath);
  return {
    src,
    savedSrc: src,
    needsInitialDiskSave: true,
    parseErrorPolicy: null,
    initializedFromBlank: true,
  };
}

/** Apply external (host) content to a document when it is not dirty. */
export function syncDocumentFromDisk(doc, diskContent, { isDirty = false, skipStaleBlank = false } = {}) {
  if (isDirty) return doc;
  if (skipStaleBlank && isStaleBlankDiskRead(diskContent, doc.src)) return doc;
  const normalized = normalizeFileContent(doc.id, diskContent);
  const diskSaved = diskContent ?? "";
  return {
    ...doc,
    src: normalized.src,
    savedSrc: shouldInitializeAsDsl(diskSaved) ? doc.savedSrc : diskSaved,
    needsInitialDiskSave: normalized.needsInitialDiskSave ?? false,
    parseErrorPolicy: normalized.parseErrorPolicy,
    initializedFromBlank: normalized.initializedFromBlank,
    revision: (doc.revision ?? 0) + 1,
  };
}

/** Build an in-memory document from a relative path + raw disk content. */
export function createDocument(relPath, content) {
  const normalized = normalizeFileContent(relPath, content);
  return {
    id: relPath,
    name: displayNameFromRelPath(relPath),
    src: normalized.src,
    savedSrc: normalized.savedSrc,
    parseErrorPolicy: normalized.parseErrorPolicy,
    initializedFromBlank: normalized.initializedFromBlank,
    needsInitialDiskSave: normalized.needsInitialDiskSave ?? false,
    revision: 0,
  };
}
