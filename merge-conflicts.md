# Managing conflicts on merge

How this product should behave when an edit branch and `preview` have both moved. Written
after `Kuisin/template-docs#7` sat unmergeable for a day, because that conflict turned out to be
representative rather than unlucky.

## What actually conflicted

Three files, every hunk the same shape:

```
<<<<<<< the edit branch
[role_staff: Individual Entering of Parked Documents] <block_entry> @ACT-AC-020-001-003 +FV50
=======
[role_staff: Individual Entering of Parked Documents] <block_entry> +FV50
  id: ACT-AC-020-001-003;
>>>>>>> preview
```

Nobody disagreed about anything. A step's own id used to be an `@id` suffix and became the
property line `id: <id>;` (commit `4d7da9e`). `preview` took that migration; the edit branch,
created just before it, kept editing in the old spelling. The migration touches every step that
has an id, and so does the person editing, so git conflicted on all of them.

Two things made it worse than it needed to be:

1. **`migrateLegacyDsl` had no rule for the `@id` suffix.** So "Update DSL" — the button whose
   whole job is to bring a document across a grammar change — reported nothing to do, while the
   reader refused the file with `unknown directive "@ACT-…"`. The branch could not be fixed by
   the tool built to fix it, only by hand.
2. **Nothing carried the migration to open edit branches.** The migration landed on `preview`
   and stopped there, which guarantees a conflict with every draft that is open at the time.

Both are fixed in this change. The rule is in `legacy-migrate.js`, and running it on the real
stranded files reproduces the hand-written fix **byte for byte**.

## The principle

> A conflict should mean two people disagreed. Anything else is the tool's problem, not the
> user's.

Everything below follows from that, in the order it pays off.

### 1. Prevention: a migration is not finished until every open branch has it

`migrate-dsl` now fans out. When the target is the integration branch it also runs over every
branch with an open `edit_sessions` row, one commit each. This is safe to do unasked because the
rewrite is mechanical and idempotent; a draft with unpushed changes is reported rather than
rewritten, since the next push would bring the old grammar back.

This is the highest-value change and it needed no new machinery — `migrateLegacyDsl`, the route,
and the `edit_sessions` table all already existed. It was only never wired together.

### 2. Resolution: merge the document, not the lines

`mergeDsl(base, ours, theirs)` in `packages/diagram-converter/src/merge-dsl.js`. The app owns the
file format, so it can merge on structure where git can only merge on text:

- **Normalise first.** All three inputs go through `migrateLegacyDsl`. A side whose only change
  was a migration becomes equal to the base and drops out of the merge entirely. This alone
  resolves the conflict above to nothing.
- **Keyed sections merge per key.** `/meta/`, `/page/`, `/option/`, `/i18n/` are sets of
  properties and `/role/`, `/block/`, `/prop/` are sets of `<id>`-headed definitions — unordered,
  by the grammar. Two people adding different lanes is not a conflict; two people editing the
  same lane is, and only that lane is reported.
- **Ordered sections get a real diff3.** In `/title/` and `/line/` position *is* meaning, so
  those merge over lines against the anchors common to all three sides, in whole runs. Merging
  `/line/` per step id would be more precise but risks moving a nested block away from its
  `end-if`, and a merge that silently restructures a flow is worse than one that asks.
- **Nothing is re-serialised.** Unchanged regions come through byte for byte, so a merge never
  reformats a file or drops a construct the reader keeps but the writer would not reproduce
  (unknown `/role/` keys, trailing comments — the round-trip losses that PRs #70/#71/#76 fixed).

What is left is a real disagreement, reported per unit as
`{ section, key, base, ours, theirs }` — enough for the UI to ask "whose version of this lane?"
instead of handing someone `<<<<<<<` markers in a diagram editor.

### 3. Honesty: stop telling people to reload

A genuine merge conflict and a stale-head optimistic-lock failure were both `409 { conflict:
true }`, and both rendered as _"This branch moved on GitHub while you were editing. Reload and
try again."_ Reloading never clears a merge conflict. There is now a
`GitHubMergeConflictError` (a subclass, so existing `instanceof GitHubConflictError` checks still
catch it), a `mergeConflict` flag on the response, and a message that names the actual next step.

### 4. Direction still holds

Auto-resolution must never run toward the published branch. `assertMergeTarget` in
`branch-model.ts` already refuses `tmp-* → main`; nothing here widens it. Structural merge is for
`tmp-* → test`, where a wrong guess is caught in review.

## What was deliberately not done

- **`-X theirs` as a policy.** It is what resolved #7 by hand, and it was only safe because every
  conflicting hunk was verified to be the id spelling and nothing else. Generalised, it silently
  discards real edits. The point of `mergeDsl` is to get that outcome by knowing *why* the sides
  differ, rather than by assuming one side is right.
- **Merging `/line/` per step id.** Attractive now that every step can carry a stable `id:`, but
  the nesting rules (`if`/`end-if`, `fork`/`case`/`end-fork`, group closers must match their
  opener — constraint 3) make reordering hazardous. Worth revisiting once the model round-trips
  through a serializer that lives beside the parser; today `serializeDSL` is in
  `packages/editor`, and a merge in the engine cannot reach it.
- **Auto-resolving on the server during a merge request.** The engine is here and tested; wiring
  it into `pulls/[number]/merge` should be its own change, so that "the merge button rewrote my
  branch" is a reviewed decision rather than a side effect.
