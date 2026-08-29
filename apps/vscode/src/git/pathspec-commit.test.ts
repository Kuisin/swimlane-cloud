import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * Integration tests for the git semantics `Repository.commitPaths` depends on.
 *
 * These run the real binary against a scratch repository rather than mocking
 * it, because the whole safety argument for this extension is a claim about
 * what git actually does — "a pathspec-limited commit leaves the rest of the
 * index untouched". A mock would only ever confirm what we already believe.
 */

let repo: string;

const raw = (args: string[], cwd = repo) =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, LC_ALL: "C" },
    stdio: ["ignore", "pipe", "pipe"],
  });

const git = (args: string[], cwd = repo) => raw(args, cwd).trim();

/**
 * Porcelain status must NOT be trimmed: the first two columns are the staged
 * and unstaged states, and a leading space is meaningful (" M" = modified in
 * the worktree only, "M " = staged).
 */
const status = () => raw(["status", "--porcelain"]);

const tryGit = (args: string[]) => {
  try {
    return { ok: true as const, out: git(args) };
  } catch (err) {
    const e = err as { stderr?: Buffer | string; stdout?: Buffer | string };
    return { ok: false as const, out: String(e.stderr ?? e.stdout ?? "") };
  }
};

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "swimlane-git-"));
  git(["init", "-q", "."]);
  git(["config", "user.email", "test@example.com"]);
  git(["config", "user.name", "Test"]);
  git(["config", "commit.gpgsign", "false"]);
  mkdirSync(join(repo, "diagrams"));
  writeFileSync(join(repo, "diagrams", "a.txt"), "/title/ A\n");
  writeFileSync(join(repo, "src.js"), "console.log(1);\n");
  git(["add", "."]);
  git(["commit", "-qm", "init"]);
});

afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe("the safety property this extension is built on", () => {
  it("leaves unrelated STAGED work staged and uncommitted", () => {
    // The scenario that must never break: someone is mid-refactor with staged
    // changes, and checkpoints two diagrams.
    writeFileSync(join(repo, "src.js"), "console.log('half-staged refactor');\n");
    git(["add", "src.js"]);

    writeFileSync(join(repo, "diagrams", "a.txt"), "/title/ A edited\n");
    git(["commit", "-m", "checkpoint", "--", "diagrams/a.txt"]);

    // src.js is still staged (index differs from HEAD) and NOT in the commit.
    expect(status()).toContain("M  src.js");
    expect(git(["show", "--name-only", "--format=", "HEAD"]).split("\n")).toEqual([
      "diagrams/a.txt",
    ]);
  });

  it("leaves unrelated UNSTAGED work alone", () => {
    writeFileSync(join(repo, "src.js"), "unstaged edit\n");
    writeFileSync(join(repo, "diagrams", "a.txt"), "/title/ A edited\n");
    git(["commit", "-m", "checkpoint", "--", "diagrams/a.txt"]);

    expect(status()).toContain(" M src.js");
    expect(git(["show", "--name-only", "--format=", "HEAD"])).toBe("diagrams/a.txt");
  });

  it("commits several diagrams as ONE commit", () => {
    writeFileSync(join(repo, "diagrams", "a.txt"), "/title/ A2\n");
    writeFileSync(join(repo, "diagrams", "b.txt"), "/title/ B\n");
    git(["add", "-N", "--", "diagrams/b.txt"]);
    git(["commit", "-m", "checkpoint", "--", "diagrams/a.txt", "diagrams/b.txt"]);

    expect(git(["rev-list", "--count", "HEAD"])).toBe("2");
    expect(git(["show", "--name-only", "--format=", "HEAD"]).split("\n").sort()).toEqual([
      "diagrams/a.txt",
      "diagrams/b.txt",
    ]);
  });
});

describe("new files need intent-to-add first", () => {
  it("a pathspec commit REFUSES an untracked file", () => {
    // This is why the "never run git add" rule could not survive contact:
    // `create` is a required EditorHost method and every new diagram is
    // untracked.
    writeFileSync(join(repo, "diagrams", "new.txt"), "/title/ New\n");
    const result = tryGit(["commit", "-m", "x", "--", "diagrams/new.txt"]);
    expect(result.ok).toBe(false);
    expect(result.out).toMatch(/did not match any file\(s\) known to git/);
  });

  it("succeeds after `git add -N`, which stages no content", () => {
    writeFileSync(join(repo, "diagrams", "new.txt"), "/title/ New\n");
    git(["add", "-N", "--", "diagrams/new.txt"]);
    git(["commit", "-m", "x", "--", "diagrams/new.txt"]);
    expect(git(["show", "--name-only", "--format=", "HEAD"])).toBe("diagrams/new.txt");
  });

  it("intent-to-add does not drag in other untracked files", () => {
    writeFileSync(join(repo, "diagrams", "new.txt"), "/title/ New\n");
    writeFileSync(join(repo, "secret.env"), "TOKEN=abc\n");
    git(["add", "-N", "--", "diagrams/new.txt"]);
    git(["commit", "-m", "x", "--", "diagrams/new.txt"]);

    expect(git(["show", "--name-only", "--format=", "HEAD"])).toBe("diagrams/new.txt");
    expect(status()).toContain("?? secret.env");
  });
});

describe("deletions and ignored paths", () => {
  it("records a deletion without any add", () => {
    rmSync(join(repo, "diagrams", "a.txt"));
    git(["commit", "-m", "rm", "--", "diagrams/a.txt"]);
    expect(git(["show", "--name-status", "--format=", "HEAD"])).toMatch(/^D\s+diagrams\/a\.txt$/);
  });

  it("refuses an ignored path loudly rather than silently skipping it", () => {
    writeFileSync(join(repo, ".gitignore"), "ignored/\n");
    mkdirSync(join(repo, "ignored"));
    writeFileSync(join(repo, "ignored", "x.txt"), "/title/ X\n");

    const result = tryGit(["add", "-N", "--", "ignored/x.txt"]);
    expect(result.ok).toBe(false);
    expect(result.out).toMatch(/ignored by one of your \.gitignore files/);
  });
});

describe("states the preflight must catch", () => {
  it("git itself refuses a partial commit mid-merge", () => {
    git(["checkout", "-qb", "other"]);
    writeFileSync(join(repo, "diagrams", "a.txt"), "/title/ other\n");
    git(["commit", "-qam", "other"]);
    git(["checkout", "-q", "-"]);
    writeFileSync(join(repo, "diagrams", "a.txt"), "/title/ mine\n");
    git(["commit", "-qam", "mine"]);
    tryGit(["merge", "other"]);

    writeFileSync(join(repo, "diagrams", "b.txt"), "/title/ B\n");
    tryGit(["add", "-N", "--", "diagrams/b.txt"]);
    const result = tryGit(["commit", "-m", "x", "--", "diagrams/b.txt"]);
    expect(result.ok).toBe(false);
    expect(result.out).toMatch(/cannot do a partial commit during a merge/);
  });

  it("detached HEAD has no symbolic ref, which is how the preflight detects it", () => {
    git(["checkout", "-q", "--detach"]);
    expect(tryGit(["symbolic-ref", "--short", "HEAD"]).ok).toBe(false);
  });
});
