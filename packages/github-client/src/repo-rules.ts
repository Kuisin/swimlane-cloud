/**
 * `rule.md` — the branch model, written into the repository itself.
 *
 * The rules are enforced in three places (this app, a guard workflow, branch
 * protection), but none of those explain *why* to someone who has just cloned
 * the repository into an IDE and is looking at a `main` they cannot push to.
 * This file is that explanation, committed where they will actually find it.
 */

import { INTEGRATION_BRANCH, PROD_BRANCH } from "./branch-model.ts";
import { MAIN_GUARD_WORKFLOW_PATH } from "./main-guard.ts";

export const REPO_RULES_PATH = "rule.md";

export const REPO_RULES = `# How this repository works

This repository holds business-flow diagrams managed with Swimlane Cloud. The
diagrams are plain text, so you can edit them in any editor — but **the branch
rules below apply however you edit them**, including from an IDE, the command
line, or GitHub's web editor.

## Branches

| Branch | Meaning | Edit directly? |
| --- | --- | --- |
| \`${PROD_BRANCH}\` | Published. The current released version. | **No** |
| \`${INTEGRATION_BRANCH}\` | Approved. Reviewed work, waiting to be published. | **No** |
| \`<login>/<timestamp>/<key>\` | An edit in progress. | Yes — this is where you work |
| \`release-*\` | Short-lived. Created when a version is published, deleted straight after. | No |

Neither \`${PROD_BRANCH}\` nor \`${INTEGRATION_BRANCH}\` is ever edited in place.
Both only change by merging a pull request, so whatever you read on them is
something that was actually reviewed.

## The flow

\`\`\`
your edit branch  ──pull request──►  ${INTEGRATION_BRANCH}  ──publish──►  ${PROD_BRANCH}
    you edit here                     reviewed                  released
\`\`\`

1. **Branch** off \`${INTEGRATION_BRANCH}\`. In Swimlane Cloud this is the
   **Start editing** button; from a terminal it is
   \`git switch -c <your-branch> ${INTEGRATION_BRANCH}\`.
2. **Commit** your changes to that branch and push it.
3. **Open a pull request into \`${INTEGRATION_BRANCH}\`** — never into
   \`${PROD_BRANCH}\`.
4. Once it is reviewed and merged, **publish a version** from Swimlane Cloud.
   That is what moves \`${PROD_BRANCH}\`.

### Why publishing goes through a \`release-*\` branch

Publishing pins **one specific approved commit**. Swimlane Cloud cuts a
throwaway \`release-*\` branch at exactly that commit, merges it into
\`${PROD_BRANCH}\`, and deletes it. Merging \`${INTEGRATION_BRANCH}\` straight
into \`${PROD_BRANCH}\` would instead publish whatever happens to be on
\`${INTEGRATION_BRANCH}\` at that moment, including work approved after the
version you meant to release.

## What is enforced automatically

- **\`${MAIN_GUARD_WORKFLOW_PATH}\`** fails any pull request into
  \`${PROD_BRANCH}\` that does not come from \`${INTEGRATION_BRANCH}\` or a
  \`release-*\` branch, and fails any commit pushed straight onto
  \`${PROD_BRANCH}\` instead of arriving as a merge.
- **Branch protection** on \`${PROD_BRANCH}\`, where the repository's plan
  allows it, refuses direct pushes and force-pushes outright. Branch protection
  is a paid feature for private repositories; on a free plan the workflow above
  still reports the problem, but cannot block the merge itself.

Do not edit \`${MAIN_GUARD_WORKFLOW_PATH}\` — Swimlane Cloud rewrites it when
the project is reconnected.

## Files

| Path | What it is |
| --- | --- |
| \`.swimlane.json\` | Which folder holds diagrams, the project title, and the theme. |
| \`diagrams/\` | The diagrams themselves (the folder \`.swimlane.json\` points at). |
| \`templates/\` | Shared role, block and side-note definitions reused across diagrams. |
| \`rule.md\` | This file. |

A diagram is a \`.md\` file: metadata in the frontmatter, the diagram inside a
\`kai-swimlane\` fenced block, and any notes you like around it.
`;

/** True when `text` is already exactly the rules this version writes. */
export function isCurrentRepoRules(text: string | null): boolean {
  return text === REPO_RULES;
}
