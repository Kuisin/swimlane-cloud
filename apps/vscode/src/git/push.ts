/**
 * Pushing, and the credential problem that dominates it.
 *
 * A token must never be written to `.git/config` (that persists a secret in the
 * user's repository) and never passed on argv (visible in `ps`/Task Manager).
 * The way out is a one-shot credential helper that reads the token from the
 * environment and lives only for the duration of one child process.
 *
 * The subtlety, measured on a real machine: clearing `credential.helper` is NOT
 * enough. A URL-scoped helper survives it, and URL-scoped helpers are common —
 * `gh auth setup-git` installs exactly one:
 *
 *   credential.helper                     osxkeychain
 *   credential.https://github.com.helper                    <- gh's own reset
 *   credential.https://github.com.helper  !gh auth git-credential
 *
 * With only the generic reset, `git config --get-urlmatch credential
 * https://github.com` still resolves to gh's helper and ours never runs. Both
 * keys have to be cleared and both set.
 *
 * The helper body goes through `GIT_CONFIG_*` rather than `-c` so it never
 * appears on the command line at all.
 */

import type { Git } from "./git-cli";
import { GitError } from "./git-cli";

export interface PushOptions {
  cwd: string;
  branch: string;
  remote?: string;
  /** Omit for an SSH remote — ssh-agent handles those and the helper is moot. */
  token?: string | null;
}

export interface PushOutcome {
  ok: boolean;
  /** Set when the push failed in a way the user can fix themselves. */
  manualCommand?: string;
  ssoUrl?: string;
  reason?: string;
}

const HELPER_BODY = '!f() { echo username=x-access-token; echo "password=$SWIMLANE_GH_TOKEN"; }; f';

/**
 * Four config entries: clear the generic list, clear the URL-scoped list, then
 * install ours on both. Correct whether git treats these as one combined
 * ordered list or as most-specific-wins.
 */
export function credentialEnv(token: string): Record<string, string> {
  const entries: Array<[string, string]> = [
    ["credential.helper", ""],
    ["credential.https://github.com.helper", ""],
    ["credential.helper", HELPER_BODY],
    ["credential.https://github.com.helper", HELPER_BODY],
  ];

  const env: Record<string, string> = {
    GIT_CONFIG_COUNT: String(entries.length),
    SWIMLANE_GH_TOKEN: token,
    // If the helper somehow does not fire, fail rather than hang on a prompt.
    GIT_TERMINAL_PROMPT: "0",
  };
  entries.forEach(([key, value], i) => {
    env[`GIT_CONFIG_KEY_${i}`] = key;
    env[`GIT_CONFIG_VALUE_${i}`] = value;
  });
  return env;
}

function isHttpsGitHub(url: string | null): boolean {
  return Boolean(url && /^https:\/\/(www\.)?github\.com\//i.test(url));
}

/**
 * Push the current HEAD to a named branch.
 *
 * Never `--force`, under any circumstance: this extension has no situation in
 * which discarding someone else's commits is the right answer.
 */
export async function pushBranch(git: Git, options: PushOptions): Promise<PushOutcome> {
  const { cwd, branch, remote = "origin", token } = options;
  const url = await git.remoteUrl(cwd, remote);
  const manualCommand = `git push --set-upstream ${remote} HEAD:refs/heads/${branch}`;

  if (!url) {
    return { ok: false, reason: `No "${remote}" remote is configured.`, manualCommand };
  }

  // SSH remotes authenticate through ssh-agent; injecting an HTTPS credential
  // helper would do nothing. We do not rewrite the user's remote to work around
  // that — their remote configuration is theirs.
  const useHelper = isHttpsGitHub(url) && Boolean(token);
  const env = useHelper ? credentialEnv(token!) : { GIT_TERMINAL_PROMPT: "0" };

  const args = ["push", "--set-upstream", remote, `HEAD:refs/heads/${branch}`];

  try {
    await git.run(args, { cwd, env, timeoutMs: git.pushTimeout, allowFailure: false });
    return { ok: true };
  } catch (err) {
    if (!(err instanceof GitError)) throw err;
    const text = err.output;

    // Org-enforced SAML: the push is refused until the token is authorised, and
    // git prints the URL that does it. Surfacing that turns an inscrutable 403
    // into one click.
    const sso = /https:\/\/github\.com\/orgs\/[^\s"']+\/sso[^\s"']*/.exec(text);
    if (sso) {
      return {
        ok: false,
        ssoUrl: sso[0],
        reason: "This organisation requires SAML SSO authorisation for your token.",
        manualCommand,
      };
    }

    if (/non-fast-forward|fetch first|rejected/i.test(text)) {
      return {
        ok: false,
        reason: `${remote}/${branch} has commits yours does not. Pull and merge them first — this extension will never force-push.`,
        manualCommand,
      };
    }

    if (/could not read Username|Authentication failed|terminal prompts disabled/i.test(text)) {
      return {
        ok: false,
        reason: useHelper
          ? "GitHub rejected the credentials. Signing out and in again may help."
          : "Could not authenticate to the remote. For an SSH remote, check that ssh-agent has your key loaded.",
        manualCommand,
      };
    }

    return { ok: false, reason: err.message, manualCommand };
  }
}
