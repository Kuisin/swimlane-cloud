import * as vscode from "vscode";

/**
 * GitHub credentials, via VS Code's own provider.
 *
 * This is strictly better than anything we could build: a real consent UI, no
 * client id, no client secret, no device flow, no secret storage of our own,
 * and refresh handled by the workbench.
 *
 * `createIfNone` is false everywhere except an explicit user action. An
 * extension that pops an auth prompt on activation is an extension people
 * uninstall.
 */
const SCOPES = ["repo"];

export async function peekSession(): Promise<vscode.AuthenticationSession | null> {
  try {
    return (
      (await vscode.authentication.getSession("github", SCOPES, { createIfNone: false })) ?? null
    );
  } catch {
    return null;
  }
}

/** Only from a Push / Create-PR click, never on activation. */
export async function requireSession(): Promise<vscode.AuthenticationSession | null> {
  try {
    return (
      (await vscode.authentication.getSession("github", SCOPES, { createIfNone: true })) ?? null
    );
  } catch {
    return null;
  }
}
