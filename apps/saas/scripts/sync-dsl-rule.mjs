// dsl-rule.md at the repo root is the one grammar spec; the public /api/mcp
// route serves it, so it needs its own copy inside content/ — Vercel only
// traces a serverless function's own app directory into its bundle, not
// files reached by climbing out of it — rather than reading the root file
// directly at request time. Run before dev/build so the copy never goes
// stale silently.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "../../../dsl-rule.md");
const destDir = join(here, "../content");
const dest = join(destDir, "dsl-rule.md");

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log(`synced dsl-rule.md -> apps/saas/content/dsl-rule.md`);
