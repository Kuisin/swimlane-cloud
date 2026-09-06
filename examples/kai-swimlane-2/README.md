# `kai-swimlane 2` — worked example

A complete order-to-cash flow written in `kai-swimlane 2`, the DSL specified in
[`dsl-rule.md`](../../dsl-rule.md). It exists so the specification can be read against a
realistic file rather than fragments. No shipped tool
parses version 2 yet; every file here is in the **canonical formatted layout** the
proposal's formatter would write.

| File                          | What it is                                                         |
| ----------------------------- | ------------------------------------------------------------------ |
| `order-to-cash.swim`          | the main diagram: two phases, a three-path fork, a section, jumps  |
| `shipping-prep.swim`          | the sub-process linked from the fork with `=> ./shipping-prep.swim` |
| `templates/page/corporate.swim` | a `/page/` fragment: header and footer, imported with `@use`      |
| `templates/role/standard.swim`  | the shared lane catalogue, imported with `@use`                    |
| `templates/i18n/glossary.swim`  | the project glossary: source-string translations reused everywhere |

## What the main file exercises

| Feature                                         | Where in `order-to-cash.swim`                                   |
| ----------------------------------------------- | --------------------------------------------------------------- |
| Prologue directives, all `;`-terminated         | `@lang ja, en;`, three `@use …;` lines                          |
| `/meta/` reserved keys                          | `owner`, `status`, `tags`, `version`, `updated`                 |
| `;`-terminated `/title/` with inline segments   | `受注から請求まで \| Order to cash;`                             |
| Fenced multi-line values with a `.lang` variant | `/page/ description` and the `desc` of `@credit-check`          |
| Overriding an import and clearing a key         | `/role/ <sales>` with `unset: icon;`, `<credit>` with `icon: none;` |
| Definitions in expanded canonical form          | `/block/`, `/prop/`                                             |
| Phases at root scope                            | `phase (受付 \| Intake) @intake #gray`, `phase (与信と承認) @approval` |
| `if` with a lane, an id and its own property block | `if [sales] (受注チャネルは？ …) @channel` + `desc:` lines     |
| Uniform `case` / `else`, colours per case       | every `if`                                                      |
| Notes on a control statement                    | `note:` / `note.en:` under `case (いいえ \| No)`                |
| Nested `if` inside a case, `loop @id` to an upstream step | `loop @credit-check` inside `case (条件付き …)`        |
| Forward jump to a downstream step               | `goto @closed` (twice)                                          |
| `branch` merging into the next row              | `branch (監査記録 \| Audit trail)` before `[manager: 受注を承認]` |
| `fork` with labelled paths and a nested `if`    | `fork (出荷 \| Shipping)` / `and (請求 …)` / `and (通知 …)`      |
| Sub-process link                                | `=> ./shipping-prep.swim`                                       |
| Every step suffix in canonical order            | `<external> @import +PO`, `+CR ..>`, `<terminal> @closed`       |
| All five arrow glyphs except the default        | `~>`, `..>`, `-.>`, `-->`                                       |
| `section` frame, bare `loop`                    | `section (クロージング \| Closing)`                              |
| Escaped literal bars in a translatable value    | `remark: 記録形式は「品目 \| 数量 \| 納期」;`                    |
| Content parentheses inside step text            | `[sales: 注文書（控え）を起票 …]`                                |
| Flag form of a boolean key                      | `skip;` on the final step                                       |
| The three translation layers                    | inline `a \| b`; `desc.en:` lines; `/i18n/` id-keyed, string-keyed and imported entries |
| A quoted `/i18n/` value containing `;`          | `credit-check.remark.en: "…; …";`                               |
| Comments attached to the next statement         | `// 受付チャネルで入口が分かれる`, one inside a case             |

Two kinds of thing are absent on purpose. Version 1 spellings (`is … than`, `elseif`, `[loop]`,
`merge:`, `id:`, `props:`, `arrow:`, un-hyphenated closers) are not part of the grammar at all;
the converter rewrites them once. And the canonical form never contains the solid `->` glyph,
`@id` on nodes nothing references, full-width delimiters, or `/* */` comments (those appear only
in the compact one-line form).

## Reading it against the specification

- Import paths beginning with `./` resolve against this directory, so the fragments under
  `templates/` are what `@use` merges; local `/role/` rows override them key by key.
- `goto @closed` from the intake phase lands on a step inside a later `section`; sections and
  phases are layout frames, so they never block a jump.
- `loop @credit-check` jumps out of two nested `if` bodies to a root-scope step, which the
  containment rule allows (leaving a scope is always allowed, entering one is not).
- `phase (与信と承認)` has no inline English on purpose: its name comes from the id-keyed
  `/i18n/` entry `approval.name.en`, and `[sales: 完了]` and `[sales: 督促]` come from the
  string-keyed glossary and local catalog respectively.
