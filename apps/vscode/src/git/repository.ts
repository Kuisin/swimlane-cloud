/**
 * The safe-write layer over `Git`.
 *
 * Every rule here exists because the alternative damages a working tree that
 * is not ours. The extension edits files in a repository the user is also
 * working in, possibly mid-refactor, and a diagram checkpoint must never be
 * able to disturb that.
 */

import * as vscode from "vscode";
import { Git, GitError, NotWritableError } from "./git-cli";

export interface WritableCheck {
  ok: boolean;
  reason?: string;
  /** True when the only problem is being on a branch we must not write to. */
  wrongBranch?: boolean;
  branch?: string | null;
}

export interface CommitOptions {
  message: string;
  /** Workspace-relative POSIX paths. Only these are committed. */
  paths: string[];
  author?: { name: string; email: string };
}

export class Repository {
  constructor(
    private readonly git: Git,
    readonly root: string,
    private readonly log: vscode.OutputChannel,
  ) {}

  /**
   * Everything that must be true before we touch the repository.
   *
   * Ordered cheapest-first, and deliberately exhaustive: each of these
   * conditions makes a pathspec commit either impossible or destructive, and
   * discovering that halfway through is much worse than refusing up front.
   */
  async assertWritable(branchPolicy: (branch: string) => boolean): Promise<WritableCheck> {
    // Committing runs the repository's hooks — arbitrary code from whoever
    // wrote the repo. In an untrusted workspace that is remote code execution
    // behind a button labelled "Checkpoint".
    if (!vscode.workspace.isTrusted) {
      return {
        ok: false,
        reason: "This workspace is not trusted, so git operations are disabled.",
      };
    }

    const inside = await this.git.run(["rev-parse", "--is-inside-work-tree"], {
      cwd: this.root,
      allowFailure: true,
    });
    if (inside.code !== 0 || inside.stdout.trim() !== "true") {
      return { ok: false, reason: "This folder is not inside a git working tree." };
    }

    const bare = await this.git.run(["rev-parse", "--is-bare-repository"], {
      cwd: this.root,
      allowFailure: true,
    });
    if (bare.stdout.trim() === "true") return { ok: false, reason: "This is a bare repository." };

    // Sparse checkout: a path outside the cone carries `skip-worktree`, so our
    // write lands on disk and git ignores it — or worse, records a deletion.
    if ((await this.git.configValue(this.root, "core.sparseCheckout")) === "true") {
      return {
        ok: false,
        reason:
          "This repository uses a sparse checkout; diagrams outside the cone cannot be committed safely.",
      };
    }

    const branch = await this.git.currentBranch(this.root);
    if (!branch) {
      return { ok: false, reason: "HEAD is detached. Check out a branch before committing." };
    }

    const inProgress = await this.inProgressOperation();
    if (inProgress) {
      // git refuses a partial commit during a merge anyway
      // ("fatal: cannot do a partial commit during a merge"), but saying so
      // before the attempt is far more useful than relaying that.
      return { ok: false, reason: `A ${inProgress} is in progress. Finish or abort it first.` };
    }

    const { conflicted } = await this.git.status(this.root);
    if (conflicted.length > 0) {
      return { ok: false, reason: `${conflicted.length} file(s) have unresolved conflicts.` };
    }

    if (!(await this.git.configValue(this.root, "user.email"))) {
      return { ok: false, reason: "git user.email is not set, so commits cannot be created." };
    }

    if (!branchPolicy(branch)) {
      return {
        ok: false,
        wrongBranch: true,
        branch,
        reason: `"${branch}" is not an edit branch.`,
      };
    }

    return { ok: true, branch };
  }

  private async inProgressOperation(): Promise<string | null> {
    const gitDir = await this.git.text(["rev-parse", "--git-dir"], { cwd: this.root });
    const dir = gitDir.startsWith("/")
      ? vscode.Uri.file(gitDir)
      : vscode.Uri.joinPath(vscode.Uri.file(this.root), gitDir);

    const probes: Array<[string, string]> = [
      ["MERGE_HEAD", "merge"],
      ["CHERRY_PICK_HEAD", "cherry-pick"],
      ["REVERT_HEAD", "revert"],
      ["rebase-merge", "rebase"],
      ["rebase-apply", "rebase"],
      ["BISECT_LOG", "bisect"],
    ];
    for (const [name, label] of probes) {
      try {
        await vscode.workspace.fs.stat(vscode.Uri.joinPath(dir, name));
        return label;
      } catch {
        /* not present */
      }
    }
    return null;
  }

  /**
   * Commit exactly these paths and nothing else.
   *
   * `git commit -m MSG -- <paths>` takes working-tree content for the listed
   * paths on top of HEAD and leaves the rest of the index alone. Measured: with
   * an unrelated `a.txt` staged, committing `b.txt` this way left `a.txt`
   * staged and uncommitted. That property is the reason this design is safe to
   * run inside somebody else's working tree.
   *
   * The one wrinkle is that a pathspec is resolved against the index and the
   * HEAD tree, so a brand-new file is not "known to git" and the commit fails
   * with `pathspec ... did not match any file(s) known to git`. `git add -N`
   * registers the path without staging its content, which is the minimum that
   * makes a new diagram committable. It is a scoped, explicit add of paths we
   * authored — never `git add -A`, `-u`, `.`, or any glob.
   */
  async commitPaths(opts: CommitOptions): Promise<string> {
    const paths = [...new Set(opts.paths)].filter(Boolean);
    if (paths.length === 0) throw new NotWritableError("Nothing to commit.");

    const ignored = await this.git.isIgnored(this.root, paths);
    if (ignored.length > 0) {
      // Never `-f`. If a diagram folder is gitignored the user needs to know,
      // not have the extension quietly override their own configuration.
      throw new NotWritableError(
        `These paths are ignored by .gitignore and will not be committed: ${ignored.join(", ")}`,
      );
    }

    const known = await this.git.knownPaths(this.root, paths);
    const untracked = paths.filter((p) => !known.has(p));
    if (untracked.length > 0) {
      this.log.appendLine(`intent-to-add for ${untracked.length} new path(s)`);
      await this.git.run(["add", "-N", "--", ...untracked], { cwd: this.root });
    }

    const config: string[] = [];
    if (opts.author) {
      config.push(`user.name=${opts.author.name}`, `user.email=${opts.author.email}`);
    }

    try {
      await this.withIndexLockRetry(() =>
        this.git.run(["commit", "-m", opts.message, "--", ...paths], { cwd: this.root, config }),
      );
    } catch (err) {
      if (
        err instanceof GitError &&
        /nothing to commit|no changes added|nothing added/i.test(err.output)
      ) {
        throw new NotWritableError("Those diagrams are already committed — nothing changed.");
      }
      throw err;
    }

    return (await this.git.headSha(this.root)) ?? "";
  }

  /**
   * The built-in git extension holds `.git/index.lock` during its own
   * operations. A short retry turns a confusing hard failure into a pause.
   */
  private async withIndexLockRetry<T>(fn: () => Promise<T>): Promise<T> {
    const delays = [150, 400, 900];
    for (let attempt = 0; ; attempt++) {
      try {
        return await fn();
      } catch (err) {
        const locked = err instanceof GitError && /index\.lock/i.test(err.output);
        if (!locked || attempt >= delays.length) throw err;
        await new Promise((r) => setTimeout(r, delays[attempt]!));
      }
    }
  }

  /**
   * Create and switch to an edit branch.
   *
   * This is the one sanctioned exception to "never switch branches", and it is
   * gated hard: the caller must have confirmed, and the tree must be clean
   * outside the diagrams folder so nothing unrelated can be carried across.
   * Never a stash.
   */
  async startEditBranch(name: string, from: string, diagramsRoot: string): Promise<void> {
    const { staged, dirty } = await this.git.status(this.root);
    const prefix = diagramsRoot ? `${diagramsRoot.replace(/\/+$/, "")}/` : null;
    const unrelated = [...staged, ...dirty].filter((p) => !prefix || !p.startsWith(prefix));

    if (unrelated.length > 0) {
      throw new NotWritableError(
        `The working tree has uncommitted changes outside the diagrams folder ` +
          `(${unrelated.slice(0, 3).join(", ")}${unrelated.length > 3 ? ", ..." : ""}). ` +
          "Commit or stash them yourself before starting an edit — this extension will not touch them.",
      );
    }

    await this.git.run(["switch", "-c", name, from], { cwd: this.root });
  }

  /** How far ahead/behind the remote branch is, without changing anything. */
  async divergence(
    branch: string,
    remote = "origin",
  ): Promise<{ ahead: number; behind: number } | null> {
    const fetched = await this.git.run(["fetch", "--quiet", remote, branch], {
      cwd: this.root,
      allowFailure: true,
      timeoutMs: 30_000,
    });
    if (fetched.code !== 0) return null;

    const res = await this.git.run(
      ["rev-list", "--left-right", "--count", `${remote}/${branch}...HEAD`],
      { cwd: this.root, allowFailure: true },
    );
    if (res.code !== 0) return null;
    const [behind, ahead] = res.stdout.trim().split(/\s+/).map(Number);
    return { ahead: ahead ?? 0, behind: behind ?? 0 };
  }
}
