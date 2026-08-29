import { createHmac } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Content registry. Diagrams are plain kai-swimlane .txt files dropped into
 * apps/share/content/ (organize freely with subfolders). Every file and every
 * folder gets a stable, unguessable share token:
 *
 *   token = base64url(HMAC-SHA256(SHARE_TOKEN_SECRET, "<kind>:<relative path>"))
 *
 * Tokens are deterministic — links survive redeploys as long as the secret and
 * the path don't change — but unpredictable without the secret. Nothing
 * enumerable is exposed publicly: the landing page lists nothing, and /links
 * (the index of all share URLs) requires the secret as ?key=.
 */

const CONTENT_DIR = path.join(process.cwd(), "content");

const SECRET = process.env.SHARE_TOKEN_SECRET || "";

/** Whether a real secret is configured (dev fallback tokens are predictable). */
export function hasRealSecret(): boolean {
  return SECRET.length > 0;
}

function hmacToken(kind: "file" | "folder", relPath: string): string {
  return createHmac("sha256", SECRET || "dev-secret-not-for-production")
    .update(`${kind}:${relPath}`)
    .digest("base64url")
    .slice(0, 22);
}

export const fileToken = (relPath: string) => hmacToken("file", relPath);
export const folderToken = (relPath: string) => hmacToken("folder", relPath);

/** Secret comparison for the /links index page. */
export function isLinksKey(key: string | undefined): boolean {
  return hasRealSecret() ? key === SECRET : key === "dev";
}

function walk(dir: string, base: string, files: string[], folders: Set<string>) {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) {
      folders.add(rel);
      walk(path.join(dir, e.name), rel, files, folders);
    } else if (e.isFile() && e.name.endsWith(".txt")) {
      files.push(rel);
    }
  }
}

function scan(): { files: string[]; folders: string[] } {
  const files: string[] = [];
  const folders = new Set<string>();
  walk(CONTENT_DIR, "", files, folders);
  files.sort();
  // Only folders that actually contain diagrams (directly or nested) are shareable.
  const withContent = [...folders].filter((f) => files.some((p) => p.startsWith(`${f}/`)));
  withContent.sort();
  return { files, folders: withContent };
}

/** All shareable .txt files, as content/-relative paths. */
export const listFiles = (): string[] => scan().files;

/** All shareable folders (those containing at least one .txt), content/-relative. */
export const listFolders = (): string[] => scan().folders;

export function resolveFileToken(token: string): string | null {
  return listFiles().find((p) => fileToken(p) === token) ?? null;
}

export function resolveFolderToken(token: string): string | null {
  return listFolders().find((p) => folderToken(p) === token) ?? null;
}

/** Files inside a shared folder, as paths relative to that folder. */
export function filesInFolder(folderRel: string): string[] {
  const prefix = `${folderRel}/`;
  return listFiles()
    .filter((p) => p.startsWith(prefix))
    .map((p) => p.slice(prefix.length));
}

export function readDiagram(relPath: string): string | null {
  // Tokens only ever resolve to scanned paths, so this cannot traverse out of
  // CONTENT_DIR — the join is for the filesystem read, not access control.
  try {
    return fs.readFileSync(path.join(CONTENT_DIR, relPath), "utf8");
  } catch {
    return null;
  }
}

export function folderName(folderRel: string): string {
  return folderRel.split("/").pop() || folderRel;
}

export function fileName(relPath: string): string {
  return (relPath.split("/").pop() || relPath).replace(/\.txt$/, "");
}

/** Extract the title from the /title/ section of a kai-swimlane DSL string. */
export function extractTitle(dsl: string): string {
  const lines = dsl.split("\n");
  let inTitle = false;
  const parts: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (t === "/title/") {
      inTitle = true;
      continue;
    }
    if (inTitle) {
      if (t.startsWith("/") || t === "@end") break;
      if (t) parts.push(t);
    }
  }
  return parts.join(" ");
}
