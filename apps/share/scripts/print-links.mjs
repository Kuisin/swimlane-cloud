/**
 * Print every share link for the local content/ folder:
 *
 *   SHARE_TOKEN_SECRET=… pnpm --filter @swimlane-cloud/share links [base-url]
 *
 * Uses the same HMAC tokens as the app, so the printed paths match the
 * deployed site when the secret matches.
 */
import { createHmac } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "content");
const base = process.argv[2]?.replace(/\/$/, "") ?? "";
const secret = process.env.SHARE_TOKEN_SECRET || "dev-secret-not-for-production";
if (!process.env.SHARE_TOKEN_SECRET) {
  console.warn("⚠ SHARE_TOKEN_SECRET not set — printing dev tokens.\n");
}

const token = (kind, rel) =>
  createHmac("sha256", secret).update(`${kind}:${rel}`).digest("base64url").slice(0, 22);

const files = [];
const folders = new Set();
(function walk(dir, rel) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      folders.add(r);
      walk(path.join(dir, e.name), r);
    } else if (e.isFile() && e.name.endsWith(".txt")) files.push(r);
  }
})(root, "");

console.log("Folders:");
for (const f of [...folders].sort()) {
  if (!files.some((p) => p.startsWith(`${f}/`))) continue;
  console.log(`  ${f}  →  ${base}/f/${token("folder", f)}`);
}
console.log("\nFiles:");
for (const f of files.sort()) {
  console.log(`  ${f}  →  ${base}/d/${token("file", f)}`);
}
