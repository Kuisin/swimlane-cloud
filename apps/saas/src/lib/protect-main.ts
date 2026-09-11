/**
 * Making `main` pull-request-only, at connect time.
 *
 * Four layers, because no single one of them is enough:
 *
 * 1. **`preview` exists**, cut from `main`, so there is always something legal
 *    to merge from.
 * 2. **A guard workflow** in the repository, which is the only way to express
 *    "the pull request must come from `preview`" — GitHub's branch protection
 *    has no rule for a pull request's *source* — and the only thing that sees
 *    a commit pushed straight onto `main` from an IDE or the web editor.
 * 3. **`rule.md` and `swimlane-settings.json`**, so the model is discoverable
 *    from a clone, and its one tunable — which sources may reach `main` — is
 *    managed as data the workflow reads.
 * 4. **Branch protection**, the only thing that can *refuse* a direct push
 *    rather than report it afterwards.
 *
 * Every one of them is best-effort and reported rather than thrown. Connecting
 * a repository must not fail because its plan has no branch protection, or
 * because the signed-in user granted the app a token without `workflow` scope
 * before that scope was requested. The report is what lets the caller tell the
 * user which layers actually took.
 */
import {
  createProtectionApi,
  INTEGRATION_BRANCH,
  isCurrentMainGuard,
  isCurrentRepoRules,
  isCurrentRepoSettings,
  MAIN_GUARD_WORKFLOW,
  MAIN_GUARD_WORKFLOW_PATH,
  normalizeRepoSettingsText,
  PROD_BRANCH,
  REPO_RULES,
  REPO_RULES_PATH,
  REPO_SETTINGS_PATH,
  type ProtectionOutcome,
  type RepoRef,
} from "@swimlane-cloud/github-client";
import type { GitHubApis } from "./github";
import { withRepo } from "./github";

export interface MainGuardReport {
  /** `preview` was missing and has been cut from `main`. */
  previewCreated: boolean;
  workflow:
    | "written"
    /** Already byte-identical; nothing committed. */
    | "current"
    /** The token predates the `workflow` scope — the user must sign in again. */
    | "needs-workflow-scope"
    | "failed";
  /** `rule.md`, which explains the model to anyone who clones the repository. */
  rules: "written" | "current" | "failed";
  /** `swimlane-settings.json`, which the guard workflow reads its rules from. */
  settings: "written" | "current" | "failed";
  protection: ProtectionOutcome["status"];
  /** Why a layer did not take, when one did not. */
  detail?: string;
}

/** GitHub refuses an OAuth token without `workflow` scope any write under `.github/workflows/`. */
function isMissingWorkflowScope(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /workflow/i.test(message) && /scope/i.test(message);
}

/**
 * Bring one repository up to the branch model. Safe to run repeatedly: every
 * step checks before it writes, so a second run on an already-protected
 * repository commits nothing.
 *
 * Call this **after** any direct write to `main` the caller needs to make —
 * protection turns those into errors, so ordering, not an exemption, is what
 * keeps the connect flow working.
 */
export async function enforceMainPullRequestOnly(
  apis: GitHubApis,
  repo: RepoRef,
): Promise<MainGuardReport> {
  const { write } = withRepo(apis, repo);
  const report: MainGuardReport = {
    previewCreated: false,
    workflow: "current",
    rules: "current",
    settings: "current",
    protection: "applied",
  };

  // 1. preview, cut from main. `ensureBranch` is a no-op when it already
  //    exists — deliberately, since resetting someone's in-review preview to
  //    main would discard approved work.
  let previewExisted = true;
  try {
    await write.refSha(INTEGRATION_BRANCH);
  } catch {
    previewExisted = false;
  }
  await write.ensureBranch(INTEGRATION_BRANCH, PROD_BRANCH);
  report.previewCreated = !previewExisted;

  // 2. The guard workflow, on main. Written before protection is applied, or
  //    protection would reject this very commit.
  try {
    const existing = await write.readFile(MAIN_GUARD_WORKFLOW_PATH, PROD_BRANCH);
    if (!isCurrentMainGuard(existing)) {
      await write.putFile(
        MAIN_GUARD_WORKFLOW_PATH,
        MAIN_GUARD_WORKFLOW,
        PROD_BRANCH,
        existing === null
          ? `Add the ${PROD_BRANCH} guard workflow`
          : `Update the ${PROD_BRANCH} guard workflow`,
      );
      report.workflow = "written";
    }
  } catch (err) {
    report.workflow = isMissingWorkflowScope(err) ? "needs-workflow-scope" : "failed";
    report.detail = err instanceof Error ? err.message : String(err);
  }

  // 3. `rule.md`, so someone who clones this into an IDE can find out why
  //    `main` rejects their push without having to open the app.
  try {
    const existing = await write.readFile(REPO_RULES_PATH, PROD_BRANCH);
    if (!isCurrentRepoRules(existing)) {
      await write.putFile(
        REPO_RULES_PATH,
        REPO_RULES,
        PROD_BRANCH,
        existing === null ? "Add rule.md" : "Update rule.md",
      );
      report.rules = "written";
    }
  } catch (err) {
    report.rules = "failed";
    report.detail ??= err instanceof Error ? err.message : String(err);
  }

  // 4. The settings the guard workflow reads its allowed sources from. An
  //    existing file keeps every value it holds — this only fills in keys a
  //    newer version of the app added, and never resets what the owner chose.
  try {
    const existing = await write.readFile(REPO_SETTINGS_PATH, PROD_BRANCH);
    if (!isCurrentRepoSettings(existing)) {
      await write.putFile(
        REPO_SETTINGS_PATH,
        normalizeRepoSettingsText(existing),
        PROD_BRANCH,
        existing === null ? `Add ${REPO_SETTINGS_PATH}` : `Update ${REPO_SETTINGS_PATH}`,
      );
      report.settings = "written";
    }
  } catch (err) {
    report.settings = "failed";
    report.detail ??= err instanceof Error ? err.message : String(err);
  }

  // 5. Protection last, so every write above is already in.
  const outcome = await createProtectionApi(apis.rest, repo).protectBranchForPullRequests();
  report.protection = outcome.status;
  if (outcome.status !== "applied") report.detail ??= outcome.reason;

  return report;
}
