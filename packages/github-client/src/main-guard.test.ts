/**
 * The guard is shell embedded in YAML — two layers where a quoting mistake is
 * invisible to review and only shows up as a workflow that passes everything.
 * So rather than asserting on the text, these tests pull the real `run:` block
 * out of the workflow and execute it.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isCurrentMainGuard, MAIN_GUARD_WORKFLOW, MAIN_GUARD_WORKFLOW_PATH } from "./main-guard.ts";
import { repoSettingsJson } from "./repo-settings.ts";

/** The dedented body of the `run: |` block belonging to `jobName`. */
function runScript(jobName: string): string {
  const job = MAIN_GUARD_WORKFLOW.split(`  ${jobName}:`)[1];
  if (!job) throw new Error(`no job ${jobName}`);
  const lines = job.split("\n");
  const start = lines.findIndex((l) => l.trimEnd().endsWith("run: |"));
  if (start < 0) throw new Error(`no run block in ${jobName}`);
  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() && !line.startsWith("          ")) break;
    body.push(line.slice(10));
  }
  return body.join("\n");
}

/** Run a script under `sh`, returning its exit code and output. */
function sh(script: string, env: Record<string, string>, cwd: string) {
  const file = join(cwd, "script.sh");
  writeFileSync(file, script);
  try {
    const stdout = execFileSync("sh", [file], {
      cwd,
      env: { ...process.env, ...env },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, out: stdout };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

const REPO = "acme/flows";
const base = (headRef: string) => ({ HEAD_REF: headRef, HEAD_REPO: REPO, BASE_REPO: REPO });

describe("the pull-request guard", () => {
  const script = runScript("pull-request-source");
  const dir = mkdtempSync(join(tmpdir(), "guard-"));

  it("accepts preview", () => {
    expect(sh(script, base("preview"), dir).code).toBe(0);
  });

  // Publishing cuts a short-lived branch at the exact approved commit, so
  // rejecting these would block every release.
  it("accepts a release branch", () => {
    expect(sh(script, base("release-3f2a9c1b"), dir).code).toBe(0);
  });

  it("rejects an edit branch, and says what to do instead", () => {
    const r = sh(script, base("kuisin/20260911-003647/0ydv2t"), dir);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/only accepts pull requests from preview/);
  });

  it("rejects other branches", () => {
    for (const ref of ["feature/x", "main", "previews", "prev", "releases-1", "release"]) {
      expect(sh(script, base(ref), dir).code, ref).toBe(1);
    }
  });

  it("rejects a fork, whatever its branch is called", () => {
    const r = sh(script, { HEAD_REF: "preview", HEAD_REPO: "someone/fork", BASE_REPO: REPO }, dir);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/from this repository/);
  });
});

describe("the pull-request guard reads its allowlist from settings", () => {
  const script = runScript("pull-request-source");
  const hasJq = (() => {
    try {
      execFileSync("jq", ["--version"], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  })();

  it.skipIf(!hasJq)("honours a narrowed allowlist", () => {
    const dir = mkdtempSync(join(tmpdir(), "guard-cfg-"));
    writeFileSync(
      join(dir, "swimlane-settings.json"),
      repoSettingsJson({
        version: 1,
        branches: { published: "main", approved: "preview", releasePrefix: "release-" },
        rules: {
          publishedRequiresPullRequest: true,
          allowedPublishedSources: ["preview"],
          forbidDirectPush: true,
          forbidForcePush: true,
        },
      }),
    );
    expect(sh(script, base("preview"), dir).code).toBe(0);
    // release-* is no longer allowed, because the settings file says so.
    expect(sh(script, base("release-3f2a9c1b"), dir).code).toBe(1);
  });

  it.skipIf(!hasJq)("falls back to the defaults when the file is unreadable", () => {
    const dir = mkdtempSync(join(tmpdir(), "guard-bad-"));
    writeFileSync(join(dir, "swimlane-settings.json"), "{ not json");
    expect(sh(script, base("preview"), dir).code).toBe(0);
    expect(sh(script, base("release-1"), dir).code).toBe(0);
    expect(sh(script, base("feature/x"), dir).code).toBe(1);
  });
});

describe("the direct-push guard", () => {
  const script = runScript("direct-push");
  const dir = mkdtempSync(join(tmpdir(), "guard-push-"));

  it("rejects a force-push before it looks at anything else", () => {
    const r = sh(script, { FORCED: "true", SHA: "x", REPO, GH_TOKEN: "t" }, dir);
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/force-pushed/);
  });
});

describe("isCurrentMainGuard", () => {
  it("is true only for the exact current text", () => {
    expect(isCurrentMainGuard(MAIN_GUARD_WORKFLOW)).toBe(true);
    expect(isCurrentMainGuard(`${MAIN_GUARD_WORKFLOW} `)).toBe(false);
    expect(isCurrentMainGuard(null)).toBe(false);
  });

  it("lives under .github/workflows so GitHub actually runs it", () => {
    expect(MAIN_GUARD_WORKFLOW_PATH.startsWith(".github/workflows/")).toBe(true);
  });
});
