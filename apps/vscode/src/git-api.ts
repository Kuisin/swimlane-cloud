import * as vscode from "vscode";

/**
 * Locate the git binary through the built-in extension, which has already done
 * the platform-specific discovery work.
 *
 * We use `vscode.git` READ-ONLY, and only for this and for status display. It
 * is never used for mutations: `Repository.commit()` has no pathspec-limited
 * form, so it would sweep up whatever else the user had staged. Every use is
 * guarded because the extension can be disabled.
 */
export async function findGitPath(): Promise<string> {
  try {
    const ext = vscode.extensions.getExtension<{
      getAPI(version: number): { git: { path: string } };
    }>("vscode.git");
    if (ext) {
      const api = (ext.isActive ? ext.exports : await ext.activate())?.getAPI(1);
      if (api?.git?.path) return api.git.path;
    }
  } catch {
    /* built-in git extension unavailable or disabled */
  }
  // A bare name resolves through PATH, which is right often enough to be a
  // better fallback than refusing to start.
  return "git";
}
