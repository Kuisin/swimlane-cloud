/**
 * Live smoke test — deliberately NOT part of `pnpm test`, which must stay
 * offline so CI never spends rate-limit budget.
 *
 *   node --experimental-strip-types scripts/smoke.ts [owner/repo] [path]
 *
 * Proves the two claims the whole apps/hub design rests on:
 *   1. the anonymous reader resolves refs and reads blobs against real GitHub;
 *   2. doing so consumes zero REST quota.
 */
import { createRepoReader } from "../src/index.ts";

const [slug = "facebook/react", filePath = "README.md"] = process.argv.slice(2);
const [owner, repo] = slug.split("/") as [string, string];

async function quota(): Promise<string> {
  const res = await fetch("https://api.github.com/rate_limit");
  return `remaining=${res.headers.get("x-ratelimit-remaining")} used=${res.headers.get("x-ratelimit-used")}`;
}

const before = await quota();
const t0 = performance.now();

const reader = await createRepoReader({ owner, repo });
const branch = await reader.defaultBranch();
const head = await reader.resolveRef(branch);
const tags = await reader.listTags();
const config = await reader.readConfig(head.sha);
const blob = await reader.readFile(filePath, head.sha);

const ms = Math.round(performance.now() - t0);
const after = await quota();

console.log(`repo           ${slug}`);
console.log(`strategy       ${reader.strategy}`);
console.log(`defaultBranch  ${branch}`);
console.log(`resolved       ${head.sha} (${head.kind})`);
console.log(`tags           ${tags.length} (${tags.filter((t) => t.peeled).length} annotated)`);
console.log(`.swimlane.json ${JSON.stringify(config)}`);
console.log(`readFile       ${filePath} -> ${blob ? `${blob.text.length} chars` : "not found"}`);
console.log(`elapsed        ${ms} ms`);
console.log(`quota before   ${before}`);
console.log(`quota after    ${after}`);

if (before !== after) {
  console.error("\nFAIL: REST quota moved — the anonymous path is not off-quota.");
  process.exit(1);
}
console.log("\nPASS: zero REST quota consumed.");

// A tag round trip proves annotated tags peel to a commit sha, which is what
// /t/{tag} must canonicalise to.
const annotated = tags.find((t) => t.peeled);
if (annotated) {
  const resolved = await reader.resolveRef(annotated.name);
  console.log(
    `tag ${annotated.name}: object ${annotated.sha.slice(0, 8)} -> commit ${resolved.sha.slice(0, 8)}` +
      ` ${resolved.sha === annotated.peeled ? "(peeled correctly)" : "(MISMATCH)"}`,
  );
}
