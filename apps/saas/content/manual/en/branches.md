# Branches & workflow

Every project has exactly three kinds of branch, and they mean the same
thing in every project.

| Branch                    | Japanese label       | Meaning                                                                                           |
| ------------------------- | -------------------- | ------------------------------------------------------------------------------------------------- |
| `main`                    | 公開済み (Published) | The current released version. Never edited directly.                                              |
| `preview`                 | 承認済み (Approved)  | Under review. Also never edited directly — it only changes when a pull request is merged into it. |
| `<you>/<timestamp>/<key>` | —                    | **Your** edit branch. Where all editing actually happens.                                         |

You will never see or need to type a branch name like
`kaisei/1699999999/flow`— it is created for you automatically the moment you
click **Start editing**, and you work on it without thinking about it again.

## The usual flow

1. **Start editing.** Creates your personal edit branch from `preview`.
2. **Edit.** Every change autosaves as you go — nothing is lost if you close
   the tab.
3. **Push to GitHub.** Turns everything you've autosaved into one real
   commit on your edit branch.
4. **Request review.** Opens a pull request from your edit branch into
   `preview`. Someone with edit access reviews and merges it.
5. **Publish** (owners only). Snapshots everything on `preview`, tags it as
   a version, and promotes it to `main` — see
   [Versions & publishing](?section=versions).

## Why you can't edit `main` or `preview` directly

So that what a reviewer sees on `preview` is always something that was
actually reviewed, and what's live on `main` is always something that was
actually published — never a change that slipped in unreviewed. If you try
to edit either one, Swimlane Cloud will offer to start an edit branch for
you instead.

## If someone else pushed while you were editing

Pushing is guarded: if the branch moved underneath you (someone else pushed
first), your push is refused rather than silently overwriting theirs. You'll
see a "branch moved" message — refresh and reapply your change.

## An edit branch under review is locked

Once you've opened a pull request from your edit branch, that branch is
locked until the pull request is merged or closed — this keeps the reviewer
looking at exactly what they approved. You can still switch to a different
file or a different branch in the meantime.
