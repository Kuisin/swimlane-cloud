/**
 * All local git, through `execFile`.
 *
 * `execFile`, never `exec` — no shell means no quoting bugs and no injection.
 * That is not theoretical here: this repository's own checkout path is
 * `/Volumes/Main Storage (4TB)/Data(using)/...`, which contains spaces and
 * parentheses a shell would happily mangle.
 *
 * We also do not use a git library. isomorphic-git operates on the user's real
 * repository without running hooks, honouring `commit.gpgsign`, understanding
 * LFS pointers, or applying `.gitattributes` filters — silently rewriting an
 * LFS pointer as its literal text is an unrecoverable trust failure. And we do
 * not use the built-in `vscode.git` API for mutations either, because
 * `Repository.commit()` has no pathspec-limited form and would sweep up
 * whatever else the user had staged.
 */

import { execFile } from "node:child_process";
import * as vscode from "vscode";

export class GitError extends Error {
  constructor(
    message: string,
    readonly code: number | null = null,
    readonly stderr = "",
    /**
     * git does not put everything on stderr. "nothing to commit" and several
     * other refusals go to stdout, so an error that only carries stderr cannot
     * be classified and degrades to "Command failed".
     */
    readonly stdout = "",
  ) {
    super(message);
    this.name = "GitError";
  }

  /** Everything git said, for matching regardless of which stream it chose. */
  get output(): string {
    return `${this.message}\n${this.stderr}\n${this.stdout}`;
  }
}

/** Refusals the user can act on, distinct from git blowing up. */
export class NotWritableError extends GitError {}

export interface GitRunOptions {
  cwd: string;
  /** Extra `-c key=value` pairs. Never used for secrets — see `pushEnv`. */
  config?: string[];
  env?: Record<string, string>;
  timeoutMs?: number;
  /** Return stderr instead of throwing on a non-zero exit. */
  allowFailure?: boolean;
}

export interface GitResult {
  stdout: string;
  stderr: string;
  code: number;
}

const READ_TIMEOUT = 20_000;
const PUSH_TIMEOUT = 90_000;

export class Git {
  constructor(
    private readonly gitPath: string,
    private readonly log: vscode.OutputChannel,
  ) {}

  /**
   * Every invocation is logged and every invocation has a deadline.
   *
   * The timeout is not defensive padding: in a repo with `commit.gpgsign=true`
   * where pinentry cannot reach a TTY, git waits forever. A killed child is a
   * bad error message; a hung extension host is a bug report with no clue in it.
   */
  async run(args: string[], options: GitRunOptions): Promise<GitResult> {
    const argv = [...(options.config?.flatMap((c) => ["-c", c]) ?? []), ...args];
    this.log.appendLine(`$ git ${argv.map(redact).join(" ")}`);

    return new Promise((resolve, reject) => {
      const child = execFile(
        this.gitPath,
        argv,
        {
          cwd: options.cwd,
          timeout: options.timeoutMs ?? READ_TIMEOUT,
          killSignal: "SIGKILL",
          maxBuffer: 32 * 1024 * 1024,
          env: {
            ...process.env,
            ...options.env,
            // No prompt can be answered from here, so never start one.
            GIT_TERMINAL_PROMPT: "0",
            GIT_ASKPASS: "echo",
            SSH_ASKPASS: "echo",
            GCM_INTERACTIVE: "never",
            // Stable, parseable output regardless of the user's locale.
            LC_ALL: "C",
            // Do not fight the built-in git extension for .git/index.lock on reads.
            GIT_OPTIONAL_LOCKS: "0",
          },
        },
        (err, stdout, stderr) => {
          const out = String(stdout);
          const errOut = String(stderr);
          if (errOut.trim()) this.log.appendLine(errOut.trimEnd());

          if (err) {
            const code = (err as NodeJS.ErrnoException & { code?: number }).code ?? null;
            if ((err as { killed?: boolean }).killed) {
              return reject(
                new GitError(
                  `git ${args[0]} timed out and was killed. If this repository signs commits, ` +
                    "the signing prompt cannot be answered from the extension host.",
                  null,
                  errOut,
                  out,
                ),
              );
            }
            if (options.allowFailure) {
              return resolve({
                stdout: out,
                stderr: errOut,
                code: typeof code === "number" ? code : 1,
              });
            }
            return reject(
              new GitError(
                errOut.trim() || err.message,
                typeof code === "number" ? code : null,
                errOut,
                out,
              ),
            );
          }
          resolve({ stdout: out, stderr: errOut, code: 0 });
        },
      );
      child.on("error", (e) => reject(new GitError(e.message)));
    });
  }

  async text(args: string[], options: GitRunOptions): Promise<string> {
    return (await this.run(args, options)).stdout.trim();
  }

  async currentBranch(cwd: string): Promise<string | null> {
    const res = await this.run(["symbolic-ref", "--short", "HEAD"], { cwd, allowFailure: true });
    // Fails on a detached HEAD, which is a state we refuse to write in.
    return res.code === 0 ? res.stdout.trim() : null;
  }

  async headSha(cwd: string): Promise<string | null> {
    const res = await this.run(["rev-parse", "HEAD"], { cwd, allowFailure: true });
    return res.code === 0 ? res.stdout.trim() : null;
  }

  async toplevel(cwd: string): Promise<string | null> {
    const res = await this.run(["rev-parse", "--show-toplevel"], { cwd, allowFailure: true });
    return res.code === 0 ? res.stdout.trim() : null;
  }

  /** Porcelain v2, NUL-delimited: the only status format safe to parse. */
  async status(cwd: string): Promise<{ staged: string[]; dirty: string[]; conflicted: string[] }> {
    const { stdout } = await this.run(
      ["status", "--porcelain=v2", "-z", "--untracked-files=normal"],
      { cwd },
    );
    const staged: string[] = [];
    const dirty: string[] = [];
    const conflicted: string[] = [];

    const records = stdout.split("\0").filter(Boolean);
    for (let i = 0; i < records.length; i++) {
      const rec = records[i]!;
      if (rec.startsWith("u ")) {
        conflicted.push(rec.split(" ").slice(10).join(" "));
      } else if (rec.startsWith("1 ") || rec.startsWith("2 ")) {
        const xy = rec.slice(2, 4);
        const path = rec.split(" ").slice(8).join(" ");
        if (xy[0] !== ".") staged.push(path);
        if (xy[1] !== ".") dirty.push(path);
        // A rename record is followed by its source path in the next field.
        if (rec.startsWith("2 ")) i++;
      } else if (rec.startsWith("? ")) {
        dirty.push(rec.slice(2));
      }
    }
    return { staged, dirty, conflicted };
  }

  async isIgnored(cwd: string, paths: string[]): Promise<string[]> {
    if (paths.length === 0) return [];
    const res = await this.run(["check-ignore", "--", ...paths], { cwd, allowFailure: true });
    return res.stdout
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  /** Paths git already knows about — anything else needs `add -N` before a commit. */
  async knownPaths(cwd: string, paths: string[]): Promise<Set<string>> {
    if (paths.length === 0) return new Set();
    const res = await this.run(["ls-files", "-z", "--", ...paths], { cwd, allowFailure: true });
    return new Set(res.stdout.split("\0").filter(Boolean));
  }

  async configValue(cwd: string, key: string): Promise<string | null> {
    const res = await this.run(["config", "--get", key], { cwd, allowFailure: true });
    return res.code === 0 ? res.stdout.trim() : null;
  }

  /**
   * The effective remote URL. NOT `config --get remote.origin.url`:
   * `url.<base>.insteadOf` rewrites mean the configured value is not
   * necessarily what git will actually contact.
   */
  async remoteUrl(cwd: string, remote = "origin"): Promise<string | null> {
    const res = await this.run(["ls-remote", "--get-url", remote], { cwd, allowFailure: true });
    const url = res.stdout.trim();
    return res.code === 0 && url && url !== remote ? url : null;
  }

  get pushTimeout(): number {
    return PUSH_TIMEOUT;
  }
}

/** Keep tokens out of the log even though we never pass them on argv. */
function redact(arg: string): string {
  return arg
    .replace(/ghp_[A-Za-z0-9]+/g, "ghp_***")
    .replace(/gho_[A-Za-z0-9]+/g, "gho_***")
    .replace(/github_pat_[A-Za-z0-9_]+/g, "github_pat_***")
    .replace(/(password=)[^\s"']+/g, "$1***");
}
