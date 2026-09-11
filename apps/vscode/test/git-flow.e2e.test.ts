import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Git, NotWritableError } from "../src/git/git-cli.ts";
import { Repository } from "../src/git/repository.ts";
import {
  editBranchName,
  isWritableBranch,
  INTEGRATION_BRANCH,
} from "@swimlane-cloud/github-client";
import { setTrusted } from "./vscode-stub.ts";

/**
 * End-to-end exercise of the extension's real git layer against a real
 * repository. Nothing here is mocked except VS Code itself: `Git` spawns the
 * actual binary and `Repository` runs its real preflight.
 */

let root: string;
let git: Git;
let repo: Repository;
const lines: string[] = [];

const channel = {
  appendLine: (s: string) => void lines.push(s),
} as unknown as ConstructorParameters<typeof Repository>[2];

const sh = (args: string[]) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8", env: { ...process.env, LC_ALL: "C" } });

const DIAGRAM = [
  "@kai-swimlane",
  "/title/",
  "Flow",
  "/role/",
  "<a>",
  "label: A;",
  "/line/",
  "[a: Step]",
  "@end",
].join("\n");

beforeEach(() => {
  setTrusted(true);
  lines.length = 0;
  root = mkdtempSync(join(tmpdir(), "sw-e2e-"));
  sh(["init", "-q", "-b", "main", "."]);
  sh(["config", "user.email", "e2e@test"]);
  sh(["config", "user.name", "E2E"]);
  sh(["config", "commit.gpgsign", "false"]);
  mkdirSync(join(root, "diagrams"));
  writeFileSync(join(root, "diagrams", "a.txt"), DIAGRAM);
  writeFileSync(join(root, "app.js"), "console.log('unrelated');\n");
  sh(["add", "-A"]);
  sh(["commit", "-qm", "init"]);
  sh(["branch", INTEGRATION_BRANCH]);

  git = new Git("git", channel);
  repo = new Repository(git, root, channel);
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("the full edit -> checkpoint loop", () => {
  it("refuses to checkpoint on a non-edit branch, then succeeds after starting one", async () => {
    // On `main`, which is production and never a direct edit target.
    const onMain = await repo.assertWritable(isWritableBranch);
    expect(onMain.ok).toBe(false);
    expect(onMain.wrongBranch).toBe(true);
    expect(onMain.branch).toBe("main");

    const branch = editBranchName("kai", new Date("2026-09-05T12:00:00Z"), "abc123");
    await repo.startEditBranch(branch, INTEGRATION_BRANCH, "diagrams");
    expect(sh(["rev-parse", "--abbrev-ref", "HEAD"]).trim()).toBe(branch);

    const onTmp = await repo.assertWritable(isWritableBranch);
    expect(onTmp.ok).toBe(true);

    writeFileSync(join(root, "diagrams", "a.txt"), DIAGRAM.replace("Step", "Step edited"));
    const sha = await repo.commitPaths({ message: "Checkpoint", paths: ["diagrams/a.txt"] });

    expect(sha).toMatch(/^[0-9a-f]{40}$/);
    expect(sh(["show", "--name-only", "--format=", "HEAD"]).trim()).toBe("diagrams/a.txt");
    expect(sh(["log", "-1", "--format=%s"]).trim()).toBe("Checkpoint");
  });

  it("commits a brand-new diagram, which needs intent-to-add first", async () => {
    await repo.startEditBranch("tmp-kai-new", INTEGRATION_BRANCH, "diagrams");
    writeFileSync(join(root, "diagrams", "brand-new.txt"), DIAGRAM);

    const sha = await repo.commitPaths({
      message: "Add diagram",
      paths: ["diagrams/brand-new.txt"],
    });
    expect(sha).toMatch(/^[0-9a-f]{40}$/);
    expect(sh(["show", "--name-only", "--format=", "HEAD"]).trim()).toBe("diagrams/brand-new.txt");
    expect(lines.some((l) => l.includes("intent-to-add"))).toBe(true);
  });

  it("NEVER disturbs unrelated staged work — the property the design rests on", async () => {
    await repo.startEditBranch("tmp-kai-edit", INTEGRATION_BRANCH, "diagrams");

    // Someone is mid-refactor with a half-staged change.
    writeFileSync(join(root, "app.js"), "console.log('half-staged refactor');\n");
    sh(["add", "app.js"]);
    const stagedBlob = sh(["rev-parse", ":app.js"]).trim();

    writeFileSync(join(root, "diagrams", "a.txt"), DIAGRAM.replace("Step", "Changed"));
    await repo.commitPaths({ message: "Checkpoint", paths: ["diagrams/a.txt"] });

    // Still staged, still uncommitted, byte-identical.
    expect(sh(["status", "--porcelain"])).toContain("M  app.js");
    expect(sh(["rev-parse", ":app.js"]).trim()).toBe(stagedBlob);
    expect(sh(["show", "--name-only", "--format=", "HEAD"]).trim()).toBe("diagrams/a.txt");
    expect(readFileSync(join(root, "app.js"), "utf8")).toBe(
      "console.log('half-staged refactor');\n",
    );
  });

  it("commits several diagrams as one checkpoint", async () => {
    await repo.startEditBranch("tmp-kai-many", INTEGRATION_BRANCH, "diagrams");
    writeFileSync(join(root, "diagrams", "a.txt"), DIAGRAM.replace("Step", "One"));
    writeFileSync(join(root, "diagrams", "b.txt"), DIAGRAM);
    writeFileSync(join(root, "diagrams", "c.txt"), DIAGRAM);

    const before = Number(sh(["rev-list", "--count", "HEAD"]).trim());
    await repo.commitPaths({
      message: "Checkpoint 3",
      paths: ["diagrams/a.txt", "diagrams/b.txt", "diagrams/c.txt"],
    });
    expect(Number(sh(["rev-list", "--count", "HEAD"]).trim())).toBe(before + 1);
    expect(sh(["show", "--name-only", "--format=", "HEAD"]).trim().split("\n").sort()).toEqual([
      "diagrams/a.txt",
      "diagrams/b.txt",
      "diagrams/c.txt",
    ]);
  });
});

describe("refusals that protect the user's tree", () => {
  it("refuses to start an edit branch when unrelated work is dirty", async () => {
    writeFileSync(join(root, "app.js"), "uncommitted work\n");
    await expect(
      repo.startEditBranch("tmp-kai-x", INTEGRATION_BRANCH, "diagrams"),
    ).rejects.toBeInstanceOf(NotWritableError);
    // The user is still where they were; nothing was stashed or switched.
    expect(sh(["rev-parse", "--abbrev-ref", "HEAD"]).trim()).toBe("main");
    expect(readFileSync(join(root, "app.js"), "utf8")).toBe("uncommitted work\n");
  });

  it("refuses everything in an untrusted workspace, because committing runs hooks", async () => {
    setTrusted(false);
    const check = await repo.assertWritable(isWritableBranch);
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/not trusted/);
  });

  it("refuses on a detached HEAD", async () => {
    sh(["checkout", "-q", "--detach"]);
    const check = await repo.assertWritable(isWritableBranch);
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/detached/i);
  });

  it("refuses mid-merge rather than letting git fail halfway", async () => {
    sh(["checkout", "-q", "-b", "other", "main"]);
    writeFileSync(join(root, "diagrams", "a.txt"), DIAGRAM.replace("Step", "Theirs"));
    sh(["commit", "-qam", "theirs"]);
    sh(["checkout", "-q", INTEGRATION_BRANCH]);
    writeFileSync(join(root, "diagrams", "a.txt"), DIAGRAM.replace("Step", "Ours"));
    sh(["commit", "-qam", "ours"]);
    try {
      sh(["merge", "other"]);
    } catch {
      /* expected conflict */
    }
    const check = await repo.assertWritable(isWritableBranch);
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/merge is in progress|unresolved conflicts/i);
  });

  it("refuses a gitignored diagram loudly instead of silently skipping it", async () => {
    await repo.startEditBranch("tmp-kai-ign", INTEGRATION_BRANCH, "diagrams");
    writeFileSync(join(root, ".gitignore"), "diagrams/secret.txt\n");
    writeFileSync(join(root, "diagrams", "secret.txt"), DIAGRAM);
    await expect(
      repo.commitPaths({ message: "x", paths: ["diagrams/secret.txt"] }),
    ).rejects.toThrow(/ignored by \.gitignore/);
  });

  it("refuses when there is genuinely nothing to commit", async () => {
    await repo.startEditBranch("tmp-kai-noop", INTEGRATION_BRANCH, "diagrams");
    await expect(repo.commitPaths({ message: "x", paths: ["diagrams/a.txt"] })).rejects.toThrow(
      /already committed|nothing/i,
    );
  });
});

describe("logging", () => {
  it("records every git invocation so a failure is diagnosable from a screenshot", async () => {
    await repo.assertWritable(isWritableBranch);
    expect(lines.filter((l) => l.startsWith("$ git ")).length).toBeGreaterThan(3);
  });
});
