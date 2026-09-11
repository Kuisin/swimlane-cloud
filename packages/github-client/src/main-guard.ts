/**
 * The workflow that enforces the branch model inside the repository itself.
 *
 * `branch-model.ts` stops *this app* asking for an illegal merge, but a push
 * from a laptop, a JetBrains IDE or github.com's own web editor walks straight
 * past it. This workflow is the half that runs on GitHub's side, so the rule
 * holds no matter which client made the change. It covers both ways `main` can
 * move:
 *
 * - **A pull request from the wrong place.** Branch protection has no rule for
 *   a pull request's *source*, so a check on the pull request is the only way
 *   to express "main may only merge preview".
 * - **A commit pushed straight onto `main`.** Every legitimate change arrives
 *   as a merge commit (the app always merges with `merge_method: "merge"`), so
 *   a single-parent commit on `main` is by definition something that bypassed
 *   the flow — an edit saved in the GitHub web UI, or a local `git push`.
 *
 * `release-*` is allowed alongside `preview` because that is how a version is
 * actually published: `promoteVersion` cuts a short-lived branch at the exact
 * approved commit being released and merges *that*, so the release pins one
 * snapshot instead of whatever `preview` holds at merge time. Rejecting it
 * would block every publish.
 *
 * A note on what this can and cannot do: a failing check is *blocking* only
 * when it is a required check, which needs branch protection or rulesets —
 * unavailable on a private repository on a free plan. Where it cannot block,
 * it still fails loudly and visibly on the commit and the pull request, which
 * is the strongest signal available without a paid plan or a public
 * repository. `protection.ts` applies the blocking half wherever the plan
 * allows it.
 */

import { INTEGRATION_BRANCH, PROD_BRANCH } from "./branch-model.ts";
import { REPO_SETTINGS_PATH } from "./repo-settings.ts";

export const MAIN_GUARD_WORKFLOW_PATH = ".github/workflows/swimlane-main-guard.yml";

/**
 * The workflow body. A plain string rather than a template read from disk so
 * every writer — the connect flow, a backfill, a test — emits the same bytes
 * and can compare against them to decide whether an update is needed.
 */
export const MAIN_GUARD_WORKFLOW = `# Managed by Swimlane Cloud — regenerated when a project is connected.
#
# ${PROD_BRANCH} is the published line. It may only ever move by merging
# ${INTEGRATION_BRANCH} (approved work), or a release-* branch (the exact
# approved commit a published version pins). Anything else — a pull request
# from another branch, or a commit pushed straight onto ${PROD_BRANCH} from an
# IDE or the GitHub web editor — is a mistake, and these checks fail it.
name: Swimlane ${PROD_BRANCH} guard

on:
  pull_request:
    branches: [${PROD_BRANCH}]
  push:
    branches: [${PROD_BRANCH}]

permissions:
  contents: read

jobs:
  pull-request-source:
    name: ${PROD_BRANCH} may only merge ${INTEGRATION_BRANCH}
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Check where this pull request came from
        env:
          HEAD_REF: \${{ github.event.pull_request.head.ref }}
          HEAD_REPO: \${{ github.event.pull_request.head.repo.full_name }}
          BASE_REPO: \${{ github.repository }}
        run: |
          if [ "$HEAD_REPO" != "$BASE_REPO" ]; then
            echo "::error::${PROD_BRANCH} only accepts pull requests from this repository (this one comes from $HEAD_REPO)."
            exit 1
          fi

          # Allowed sources are managed in ${REPO_SETTINGS_PATH}, so the rule
          # can be changed there without regenerating this workflow. The
          # defaults apply when the file is missing or unreadable — a broken
          # settings file must not silently widen what may reach ${PROD_BRANCH}.
          allowed="${INTEGRATION_BRANCH} release-*"
          if [ -f "${REPO_SETTINGS_PATH}" ]; then
            from_file="$(jq -r '.rules.allowedPublishedSources // empty | join(" ")' "${REPO_SETTINGS_PATH}" 2>/dev/null || true)"
            if [ -n "$from_file" ]; then allowed="$from_file"; fi
          fi
          echo "Allowed sources: $allowed"

          for pattern in $allowed; do
            case "$HEAD_REF" in
              $pattern)
                echo "Source branch '$HEAD_REF' matches '$pattern'."
                exit 0
                ;;
            esac
          done

          echo "::error::${PROD_BRANCH} only accepts pull requests from ${INTEGRATION_BRANCH} (this one is from '$HEAD_REF'). Merge your work into ${INTEGRATION_BRANCH} first, then publish a version."
          exit 1

  direct-push:
    name: ${PROD_BRANCH} may not be pushed to directly
    if: github.event_name == 'push'
    runs-on: ubuntu-latest
    steps:
      # Asked of the API rather than a checkout: a shallow clone grafts the
      # parents of its boundary commits, so counting them locally is only
      # reliable at a fetch depth nobody wants on a large repository.
      - name: Check this commit arrived as a merge
        env:
          GH_TOKEN: \${{ github.token }}
          REPO: \${{ github.repository }}
          SHA: \${{ github.sha }}
          FORCED: \${{ github.event.forced }}
        run: |
          if [ "$FORCED" = "true" ]; then
            echo "::error::${PROD_BRANCH} was force-pushed. Its history is the published record and must not be rewritten."
            exit 1
          fi
          parents="$(gh api "repos/$REPO/commits/$SHA" --jq '.parents | length')"
          echo "Commit $SHA has $parents parent(s)."
          # Every legitimate change arrives as a merge, so one parent means
          # something was committed straight onto the branch.
          if [ "$parents" -lt 2 ]; then
            echo "::error::A commit was pushed straight onto ${PROD_BRANCH}. Every change must arrive by merging ${INTEGRATION_BRANCH} — edit on an edit branch, open a pull request into ${INTEGRATION_BRANCH}, then publish a version."
            exit 1
          fi
          echo "Commit $SHA arrived as a merge."
`;

/** True when `text` is already exactly the workflow this version writes. */
export function isCurrentMainGuard(text: string | null): boolean {
  return text === MAIN_GUARD_WORKFLOW;
}
