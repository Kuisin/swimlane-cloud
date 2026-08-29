/**
 * Minimal `vscode` module stand-in for the end-to-end git tests.
 *
 * Only the surface `Repository` actually touches: workspace trust and
 * `workspace.fs.stat` (used to detect an in-progress merge/rebase). Everything
 * else in these tests is the real `Git` class driving the real binary.
 */
import { statSync } from "node:fs";

export const workspace = {
  isTrusted: true,
  fs: {
    async stat(uri: { fsPath: string }) {
      return statSync(uri.fsPath);
    },
  },
};

export const Uri = {
  file: (p: string) => ({ fsPath: p, path: p }),
  joinPath: (base: { fsPath: string }, ...parts: string[]) => {
    const joined = [base.fsPath, ...parts].join("/");
    return { fsPath: joined, path: joined };
  },
};

export function setTrusted(value: boolean): void {
  workspace.isTrusted = value;
}
