// dsl-rule.md at the repo root is the one grammar spec; this app serves it
// over MCP, so it needs its own copy inside content/ — the only directory
// Next traces into the serverless bundle (see next.config.ts) — rather than
// reaching outside the app at request time, which Vercel's build doesn't
// carry across. Run before dev/build so the copy never goes stale silently.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "../../../dsl-rule.md");
const destDir = join(here, "../content");
const dest = join(destDir, "dsl-rule.md");

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log(`synced dsl-rule.md -> apps/mcp/content/dsl-rule.md`);
