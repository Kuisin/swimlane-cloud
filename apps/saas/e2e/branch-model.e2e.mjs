/**
 * End-to-end check of the branch model, against a real repository.
 *
 * Not part of `pnpm test`: it needs the `gh` CLI signed in, and it *mutates*
 * the repository it runs against — cutting an edit branch, committing, opening
 * and merging a pull request, then cleaning all of it up again. Point it at a
 * demo repository, never at one holding real diagrams.
 *
 *   npx tsx apps/saas/e2e/branch-model.e2e.mjs
 *
 * What it proves that unit tests cannot: that the model works against GitHub
 * itself, and — by opening an `edit -> main` pull request and reporting
 * whether GitHub refuses it — exactly how much of the rule is actually being
 * enforced on the far side, as opposed to only by this app.
 */
import { execFileSync } from "node:child_process";
import {
  assertMergeTarget,
  editBranchName,
  INTEGRATION_BRANCH,
  PROD_BRANCH,
} from "../../../packages/github-client/src/index.ts";

const OWNER = "Kuisin",
  REPO = "swimlane-e2e-demo";
const R = `${OWNER}/${REPO}`;
const gh = (a, input) =>
  execFileSync("gh", a, { encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"] });
const api = (p, ...rest) => JSON.parse(gh(["api", p, ...rest]));
const ok = (m) => console.log(`  PASS  ${m}`);
const bad = (m) => {
  console.log(`  FAIL  ${m}`);
  failures++;
};
let failures = 0;

console.log(`e2e against ${R} as ${api("user").login}\n`);

// 1. the branch model is in place
const branches = api(`repos/${R}/branches`, "--paginate").map((b) => b.name);
branches.includes(PROD_BRANCH) ? ok(`${PROD_BRANCH} exists`) : bad(`${PROD_BRANCH} missing`);
branches.includes(INTEGRATION_BRANCH)
  ? ok(`${INTEGRATION_BRANCH} exists`)
  : bad(`${INTEGRATION_BRANCH} missing`);

// 2. the managed files landed
for (const f of [
  "rule.md",
  "swimlane-settings.json",
  ".github/workflows/swimlane-main-guard.yml",
]) {
  try {
    gh([
      "api",
      `repos/${R}/contents/${f}?ref=${PROD_BRANCH}`,
      "-H",
      "Accept: application/vnd.github.raw",
    ]);
    ok(`${f} present on ${PROD_BRANCH}`);
  } catch {
    bad(`${f} missing`);
  }
}

// 3. the client refuses an illegal merge before asking GitHub
const edit = editBranchName("kuisin");
try {
  assertMergeTarget(edit, PROD_BRANCH);
  bad("edit -> main was allowed");
} catch {
  ok("edit -> main refused by the client");
}
try {
  assertMergeTarget(INTEGRATION_BRANCH, PROD_BRANCH);
  ok("preview -> main allowed");
} catch {
  bad("preview -> main was refused");
}
try {
  assertMergeTarget("release-abc12345", PROD_BRANCH);
  ok("release-* -> main allowed (publishing works)");
} catch {
  bad("release-* -> main refused — publishing would break");
}

// 4. a real round trip: edit branch -> commit -> PR into preview -> merge
const previewSha = api(`repos/${R}/git/ref/heads/${INTEGRATION_BRANCH}`).object.sha;
gh(
  ["api", "-X", "POST", `repos/${R}/git/refs`, "--input", "-"],
  JSON.stringify({ ref: `refs/heads/${edit}`, sha: previewSha }),
);
ok(`cut edit branch ${edit} from ${INTEGRATION_BRANCH}`);

const path = "diagrams/e2e-check.md";
let existingSha = null;
try {
  existingSha = api(`repos/${R}/contents/${path}?ref=${edit}`).sha;
} catch {}
const body = {
  message: "e2e: add a diagram on an edit branch",
  content: Buffer.from(
    `---\nowner: e2e\n---\n\n\`\`\`kai-swimlane\n@kai-swimlane\n\n/title/\nE2E ${Date.now()}\n\n/role/\n<a>\nlabel: A;\n\n/line/\n[a: step]\n@end\n\`\`\`\n`,
    "utf8",
  ).toString("base64"),
  branch: edit,
  ...(existingSha ? { sha: existingSha } : {}),
};
gh(["api", "-X", "PUT", `repos/${R}/contents/${path}`, "--input", "-"], JSON.stringify(body));
ok("committed a diagram to the edit branch");

const pr = JSON.parse(
  gh(
    ["api", "-X", "POST", `repos/${R}/pulls`, "--input", "-"],
    JSON.stringify({
      head: edit,
      base: INTEGRATION_BRANCH,
      title: "e2e: edit -> preview",
      body: "automated end-to-end check",
    }),
  ),
);
ok(`opened PR #${pr.number} into ${INTEGRATION_BRANCH}`);

// GitHub must also refuse the illegal one, not just our client
try {
  gh(
    ["api", "-X", "POST", `repos/${R}/pulls`, "--input", "-"],
    JSON.stringify({
      head: edit,
      base: PROD_BRANCH,
      title: "e2e: edit -> main (should not be merged)",
    }),
  );
  console.log(
    "  NOTE  GitHub accepted an edit -> main PR (expected: nothing blocks it without Actions/protection)",
  );
} catch {
  ok("GitHub refused an edit -> main PR");
}

const merged = JSON.parse(
  gh(
    ["api", "-X", "PUT", `repos/${R}/pulls/${pr.number}/merge`, "--input", "-"],
    JSON.stringify({ merge_method: "merge", commit_title: "e2e: merge into preview" }),
  ),
);
merged.merged ? ok("merged into preview") : bad("merge into preview failed");

// the merge commit must have two parents — what the push guard checks for
const parents = JSON.parse(gh(["api", `repos/${R}/commits/${merged.sha}`])).parents.length;
parents >= 2
  ? ok(`merge commit has ${parents} parents (push guard would allow it)`)
  : bad(`merge commit has ${parents} parent(s)`);

// cleanup: close any stray main PR, delete the edit branch and the test file
for (const p of JSON.parse(gh(["api", `repos/${R}/pulls?state=open`]))) {
  if (p.base.ref === PROD_BRANCH && p.head.ref === edit) {
    gh(
      ["api", "-X", "PATCH", `repos/${R}/pulls/${p.number}`, "--input", "-"],
      JSON.stringify({ state: "closed" }),
    );
    ok(`closed stray PR #${p.number} into ${PROD_BRANCH}`);
  }
}
try {
  gh(["api", "-X", "DELETE", `repos/${R}/git/refs/heads/${edit}`]);
  ok("deleted the edit branch");
} catch {}
try {
  const cur = JSON.parse(gh(["api", `repos/${R}/contents/${path}?ref=${INTEGRATION_BRANCH}`]));
  gh(
    ["api", "-X", "DELETE", `repos/${R}/contents/${path}`, "--input", "-"],
    JSON.stringify({ message: "e2e: clean up", sha: cur.sha, branch: INTEGRATION_BRANCH }),
  );
  ok("removed the e2e diagram from preview");
} catch {
  console.log("  NOTE  e2e diagram left on preview");
}

console.log(failures ? `\n${failures} FAILURE(S)` : "\nall checks passed");
process.exit(failures ? 1 : 0);
