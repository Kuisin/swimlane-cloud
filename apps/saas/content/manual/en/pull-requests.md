# Review & pull requests

Once you've pushed your changes to your edit branch, **Request review**
opens a pull request from that branch into `preview` — a real pull request
on GitHub or GitLab, not a Swimlane Cloud-only concept.

## What a reviewer sees

The **Pull requests** tab lists every open request for the project. Opening
one shows a side-by-side diff of every changed diagram — rendered as an
actual picture of the change, not a text diff of the underlying syntax — so
a reviewer can see exactly what moved, what was added, and what was
removed, without reading DSL.

## Approving and merging

Anyone with editor access or higher can comment or approve. Once it's
approved, merging it is what actually updates `preview` — remember,
`preview` never changes except through a merged pull request. After the
merge, your edit branch is done and can be deleted; a fresh one will be
created next time you click **Start editing**.

## Closing without merging

If a change turns out not to be needed, closing the pull request without
merging leaves `preview` untouched and unlocks your edit branch for further
work.
