# Versions & publishing

**Publishing** (project owners only) is how everything approved on
`preview` becomes the released, public version of a project on `main`.

## What Publish does, in one click

1. Takes a snapshot of every diagram currently on `preview`.
2. Suggests the next version number (it looks at the highest existing one
   and offers to increment it — you can change it).
3. Tags that exact commit with the version, e.g. `v1.3.0`.
4. Opens and merges a pull request that promotes it to `main`.

Nothing is rendered ahead of time and stored as an image — the diagram's
picture (SVG) is generated on request from the snapshot whenever someone
looks at that version, so publishing itself is fast regardless of how many
diagrams a project has.

## The version history

Every project has a **Versions** tab listing every published version, each
one showing exactly which diagrams it contains and letting you view any of
them as they were at that point — even if the diagram has since changed
completely on `main`.

## Leftover drafts don't block publishing

If someone left unpushed drafts on `preview` from before it became
review-only, those drafts are simply not part of what gets published —
they're invisible to Publish, not a blocker.
