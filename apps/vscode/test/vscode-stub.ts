/**
 * Minimal `vscode` module stand-in for the end-to-end git tests.
 *
 * Only the surface `Repository` actually touches: workspace trust and
 * `workspace.fs.stat` (used to detect an in-progress merge/rebase). Everything
 * else in these tests is the real `Git` class driving the real binary.
 */
import { statSync } from "node:fs";

/** In-memory filesystem, so write paths are exercised rather than skipped. */
export const written = new Map<string, string>();

export const workspace = {
  isTrusted: true,
  fs: {
    async stat(uri: { fsPath: string }) {
      if (written.has(uri.fsPath)) return { mtime: 0, size: written.get(uri.fsPath)!.length };
      return statSync(uri.fsPath);
    },
    async writeFile(uri: { fsPath: string }, bytes: Uint8Array) {
      written.set(uri.fsPath, new TextDecoder().decode(bytes));
    },
    async readFile(uri: { fsPath: string }) {
      const v = written.get(uri.fsPath);
      if (v === undefined) throw new Error(`ENOENT: ${uri.fsPath}`);
      return new TextEncoder().encode(v);
    },
    async createDirectory() {},
    async delete() {},
    async rename() {},
  },
};

export class RelativePattern {
  constructor(
    readonly base: unknown,
    readonly pattern: string,
  ) {}
}

export const Uri = {
  file: (p: string) => ({ fsPath: p, path: p }),
  joinPath: (base: { fsPath: string }, ...parts: string[]) => {
    const joined = [base.fsPath, ...parts].join("/");
    return { fsPath: joined, path: joined };
  },
};

/** Files the stubbed findFiles will return, as workspace-relative paths. */
let stubFiles: string[] = [];

export function setFiles(paths: string[]): void {
  stubFiles = paths;
}

Object.assign(workspace, {
  findFiles: async (pattern: RelativePattern) => {
    const prefix = pattern.pattern.replace(/\*\*\/\*\.txt$/, "");
    return stubFiles
      .filter((p) => p.startsWith(prefix) && p.endsWith(".txt"))
      .map((p) => ({ fsPath: p, path: p }));
  },
  asRelativePath: (uri: { path: string }) => uri.path,
});

export function setTrusted(value: boolean): void {
  workspace.isTrusted = value;
}
