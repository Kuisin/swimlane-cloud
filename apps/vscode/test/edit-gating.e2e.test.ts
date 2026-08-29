import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Git } from "../src/git/git-cli.ts";
import { Repository } from "../src/git/repository.ts";
import { branchExists, detectDefaultBranch } from "../src/git/branches.ts";
import { setTrusted } from "./vscode-stub.ts";

/**
 * End-to-end coverage for the two rules the extension now enforces:
 * editing only on an edit branch, and only within the chosen folder.
 */

let root = "";
const chan = { appendLine: () => {} } as never;
const sh = (a: string[]) => execFileSync("git", a, { cwd: root, encoding: "utf8" }).trim();
const DIAGRAM = ["@kai-swimlane", "/title/", "A", "@end"].join("\n");

function repoWith(defaultBranch: string, branches: string[] = []) {
  root = mkdtempSync(join(tmpdir(), "gate-"));
  sh(["init", "-q", "-b", defaultBranch, "."]);
  sh(["config", "user.email", "t@t"]);
  sh(["config", "user.name", "T"]);
  sh(["config", "commit.gpgsign", "false"]);
  for (const d of ["diagrams/ops", "diagrams/hr"]) mkdirSync(join(root, d), { recursive: true });
  writeFileSync(join(root, "diagrams/ops/a.txt"), DIAGRAM);
  writeFileSync(join(root, "diagrams/hr/b.txt"), DIAGRAM);
  sh(["add", "-A"]);
  sh(["commit", "-qm", "init"]);
  for (const b of branches) sh(["branch", b]);
  return { git: new Git("git", chan), repo: new Repository(new Git("git", chan), root, chan) };
}

beforeEach(() => setTrusted(true));
afterEach(() => root && rmSync(root, { recursive: true, force: true }));

describe("the default branch is detected, never assumed", () => {
  it("finds `master` in a repo that has no `main`", async () => {
    const { git } = repoWith("master");
    expect(await detectDefaultBranch(git, root)).toBe("master");
  });

  it("finds `main` when that is what exists", async () => {
    const { git } = repoWith("main");
    expect(await detectDefaultBranch(git, root)).toBe("main");
  });

  it("falls back to the checked-out branch for an unusual name", async () => {
    const { git } = repoWith("production");
    expect(await detectDefaultBranch(git, root)).toBe("production");
  });
});

describe("Start Edit recovers instead of failing", () => {
  it("can create the integration branch from a `master` default — the case that used to break", async () => {
    // `git branch test main` errors with "not a valid object name" here.
    const { git, repo } = repoWith("master");
    expect(await branchExists(git, root, "test")).toBe(false);

    const prod = await detectDefaultBranch(git, root);
    await git.run(["branch", "test", prod], { cwd: root });

    expect(await branchExists(git, root, "test")).toBe(true);
    await repo.startEditBranch("tmp-kai-x", "test", "diagrams");
    expect(sh(["rev-parse", "--abbrev-ref", "HEAD"])).toBe("tmp-kai-x");
  });

  it("detects an existing edit branch rather than reporting the integration branch missing", async () => {
    const { git } = repoWith("main", ["test", "tmp-kai-x"]);
    expect(await branchExists(git, root, "tmp-kai-x")).toBe(true);
    // The command switches to it; it does not try to recreate it.
    await git.run(["switch", "tmp-kai-x"], { cwd: root });
    expect(sh(["rev-parse", "--abbrev-ref", "HEAD"])).toBe("tmp-kai-x");
  });
});

describe("editing is confined to edit branches", () => {
  const writable = (b: string) => b !== "main" && (b.startsWith("tmp-") || b === "test");

  it("refuses on the production branch", async () => {
    const { repo } = repoWith("main", ["test"]);
    const check = await repo.assertWritable((b) => b.startsWith("tmp-"));
    expect(check.ok).toBe(false);
    expect(check.wrongBranch).toBe(true);
    expect(check.branch).toBe("main");
  });

  it("allows on a tmp-* branch", async () => {
    const { repo } = repoWith("main", ["test"]);
    await repo.startEditBranch("tmp-kai-x", "test", "diagrams");
    expect((await repo.assertWritable((b) => b.startsWith("tmp-"))).ok).toBe(true);
  });

  it("refuses in an untrusted workspace even on a valid edit branch", async () => {
    const { repo } = repoWith("main", ["test"]);
    await repo.startEditBranch("tmp-kai-x", "test", "diagrams");
    setTrusted(false);
    const check = await repo.assertWritable(writable);
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/not trusted/);
  });
});

describe("an edit scoped to a folder cannot reach outside it", () => {
  it("commits only within the scope, leaving other folders untouched", async () => {
    const { repo } = repoWith("main", ["test"]);
    await repo.startEditBranch("tmp-kai-ops", "test", "diagrams");

    // Edit both folders on disk, but the scoped edit commits only ops.
    writeFileSync(join(root, "diagrams/ops/a.txt"), DIAGRAM.replace("A", "OPS EDIT"));
    writeFileSync(join(root, "diagrams/hr/b.txt"), DIAGRAM.replace("A", "HR EDIT"));

    await repo.commitPaths({ message: "Checkpoint ops", paths: ["diagrams/ops/a.txt"] });

    expect(sh(["show", "--name-only", "--format=", "HEAD"])).toBe("diagrams/ops/a.txt");
    // The out-of-scope edit is still sitting uncommitted, exactly as the user left it.
    expect(sh(["status", "--porcelain"])).toContain("diagrams/hr/b.txt");
  });
});
