# `kai-swimlane 2` — worked example

A complete diagram repository in version 2 of the DSL, byte-identical to
[Kuisin/swimlane-sample](https://github.com/Kuisin/swimlane-sample) so the specification in
[dsl-rule.md](../../dsl-rule.md) can be read against files the engine actually renders.

Every diagram here parses with zero errors and renders to SVG through `textToSvg`, in both
declared languages. The converter package's `examples.test.js` asserts that on
every run, resolving the imports the way a host must.

## Layout

```
.swimlane.json                   diagramsRoot, title, theme, integration branch, dslVersion
diagrams/
  brand/asset-showcase.txt       imported images used as lane and block icons
  sales/order-to-cash.txt        intake → credit and approval → shipping ∥ billing ∥ notice → closing
  sales/shipping-prep.txt        sub-process linked from the shipping path
  support/incident-response.txt  detection → response (Sev1 fork / Sev2 loop) → retrospective
  support/rollback.txt           sub-process linked from the Sev1 mitigation path
  hr/onboarding.txt              offer → pre-boarding fork → day one phase
assets/                          images imported with `@use` and drawn as icons
templates/                       the section-template mirror a project seeds
```

Files carry `.txt` because that is what the product stores. The extension is not semantic: the
reader takes the version from the first line, so `@kai-swimlane 2` in a `.txt` file is a version 2
diagram.

## What the diagrams exercise

| Feature | Where |
| --- | --- |
| Declared languages and inline segments | `@lang ja, en;` and `受注から請求まで \| Order to cash` in every file |
| Per-field translation | `desc.en:` and `remark.en:` throughout `order-to-cash.txt` |
| Escaped literal bar | `remark: 記録形式は「品目 \| 数量 \| 納期」;` |
| `/meta/` reserved keys | owner, status, tags, version, updated |
| Fenced multi-line value | `/page/ description` and the credit-check `desc` |
| Phases at root scope | `phase (受付 \| Intake) @intake #gray` |
| `if` with a lane, an id and cases | `if [sales] (受注チャネルは？ …) @channel` |
| Nested `if` inside a case | the special-approval decision in `order-to-cash.txt` |
| `loop` to a named upstream step | `loop @credit-check`, `loop @mitigate`, `loop @orientation` |
| Bare `loop` back to its own decision | the overdue-payment case, and both sub-processes |
| Forward `goto` past a phase | `goto @closed`, `goto @close`, `goto @wrap-up` |
| `branch` merging into the next row | `branch (監査記録 …)`, `branch (記録 …)` |
| `fork` with labelled paths | `fork (出荷 …)` / `and (請求 …)` / `and (通知 …)` |
| `fork` nested inside a case | the Sev1 case of `incident-response.txt` |
| Sub-process link | `=> ./shipping-prep.txt`, `=> ./rollback.txt` |
| Every arrow glyph but the default | `~>`, `..>`, `-.>`, `-->` |
| Prop chips on both sides | `+PO`, `+CR`, `+INV`, `+TICKET`, `+RUNBOOK`, `+NDA`, `+PC` |
| Block styles | `<external>` subroutine, `<terminal>` rounded |
| Flag form of a boolean key | `skip;` on a final step |
| Imported vector and raster images | `@use ../../assets/kai-mark.svg;` and `… warehouse-badge.png as badge;` in `brand/asset-showcase.txt`, used as `icon: @kai-mark;` and `icon: @badge;` |

## Notes

- Definitions are written in each diagram rather than imported, so the five process diagrams need
  no resolver. `@use` is part of the grammar and the reader supports both forms through
  host-provided resolvers, but no app supplies one yet: parsing is synchronous while a host's file
  read is async, so each host needs a prefetch cache, for which `scanImports` lists the targets.
  Until then `brand/asset-showcase.txt` renders without its icons in the apps, and `templates/`
  holds the project's section-template mirror only.
- `phase` currently draws as a frame rather than a horizontal band, and `note:` parses but is not
  drawn.
