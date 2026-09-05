# Swimlane Diagrams for VS Code

Edit [kai-swimlane](https://github.com/Kuisin/swimlane-cloud) `.txt` diagrams with a live SVG
preview, backed by your own git history and by GitHub for review and release.

## What it does

- **Full editor in a panel** — folder tree, GUI and text modes over one DSL document, live preview.
- **Your git is the version control.** Checkpoints are ordinary commits on your branch.
- **GitHub for the rest** — push an edit branch, open a pull request, tag a release.

## Commands

| Command                                  | What it does                                                                |
| ---------------------------------------- | --------------------------------------------------------------------------- |
| `Swimlane: Open Diagram Editor`          | Opens the editor over the workspace's `.txt` diagrams                       |
| `Swimlane: Start Edit (new branch)`      | Cuts a new branch (`<login>/<timestamp>/<key>`) from the integration branch |
| `Swimlane: Checkpoint (commit diagrams)` | Commits the changed diagrams, and only those                                |
| `Swimlane: Push and Open Pull Request`   | Pushes the edit branch and opens a PR                                       |
| `Swimlane: Show Git Log`                 | Every git command the extension ran                                         |

## How it treats your repository

This extension edits files in a repository you are also working in, so it is deliberately
conservative:

- **It commits by pathspec.** `git commit -- <the diagrams you changed>` takes working-tree content
  for exactly those paths. A half-staged refactor elsewhere in the repo stays staged and
  uncommitted.
- **It never runs** `checkout`, `stash`, `reset`, `clean`, or `git add -A`. The one exception is
  creating an edit branch, which asks first and refuses if anything outside the diagrams folder is
  dirty. It will never stash your work to get out of the way.
- **It never force-pushes.**
- **It refuses rather than guesses** — detached HEAD, a merge or rebase in progress, unresolved
  conflicts, a sparse checkout, or a missing `user.email` all stop it before it touches anything.
- **Git operations require a trusted workspace,** because committing runs the repository's hooks.

Every git invocation is logged to the `Swimlane Git` output channel.

## Configuration

| Setting                      | Default   | Meaning                                                                  |
| ---------------------------- | --------- | ------------------------------------------------------------------------ |
| `swimlane.diagramsRoot`      | `""`      | Folder holding the diagrams. Overridden by `.swimlane.json` in the repo. |
| `swimlane.integrationBranch` | `preview` | Branch edit branches are cut from and merged back into.                  |
| `swimlane.productionBranch`  | `main`    | Release branch. Never a direct edit target.                              |

## Installing

Not on the Marketplace. Download the `.vsix` from
[the downloads page](https://kuisin.github.io/swimlane-downloads/) and:

```
code --install-extension swimlane-diagrams-<version>.vsix
```
