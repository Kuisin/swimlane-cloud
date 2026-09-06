# DSL grammar proposals

Seven candidate grammars for the next generation of the swimlane DSL. Grammar **A** is an
evolution of the current `@kai-swimlane` syntax and, now the accepted target, is specified in full
in [dsl-rule.md](dsl-rule.md); grammar **G** is a
programming-language-style grammar designed for whitespace-free storage; the others start from
a clean sheet. They are not mutually exclusive: every one of them parses into the same
intermediate representation (**F**), so the product can accept several and the GUI, mobile view,
SVG renderer and SaaS validation only ever see one model. Section 1 defines the multilingual
model that all of them share: one diagram, authored once, rendered in every language it declares.
Section 2 defines the storage rule they are measured against: a file must survive having all
insignificant whitespace removed, and a canonical formatter restores it on save.

The same scenario is written in every grammar so they can be compared line for line:

> **受注処理** — 営業 が見積を作成し（申請書チップ付き）、上長 が承認を判断する。承認なら
> システム が受注登録、否認なら 営業 が修正して判断へ戻る。その後 システム のメール送信と
> 倉庫 の出荷準備が並行し、監査枠の中で システム が監査ログを保存する。キャンセル要求があれば
> 営業 が受け付けて終端へ直接合流、なければ 上長 が通常クローズ。最後に 営業 の「完了」。

---

## 0. What the next grammar has to carry

Current constructs that any successor must express losslessly:

| Construct                          | Today                                      |
| ---------------------------------- | ------------------------------------------ |
| Lanes (actors only)                | `/role/` + `<id>` + `key: value;`          |
| Reusable step styles / doc chips   | `/block/`, `/prop/`                        |
| Page chrome + display flags        | `/page/`, `/option/`                       |
| Step                               | `[role: text] <block>` + property lines    |
| Per-step docs                      | `label`, `desc`, `remark`, `remark-desc`   |
| Exclusive branch, loop, mid-merge  | `if … is … than` / `[loop]` / `merge: id;` |
| Parallel                           | `fork` / `and` / `endfork`                 |
| Visual frame, side line            | `section` / `branch`                       |
| Connector style                    | `arrow: dashed;`                           |
| Comments that survive formatting   | `//` inside `/line/`                       |

Roadmap items ([plan.md](plan.md), [README.md](README.md)) that the grammar should make easy
rather than bolt on later:

- **Project section templates and forced sections.** A diagram should be able to *reference*
  a project-level `page` / `option` / `role` / `block` / `prop` fragment instead of pasting
  it. Validation of a forced section then becomes "does the file import the pinned
  template", not a normalized text diff.
- **Many diagrams per repository.** Steps should be able to link to another diagram
  (sub-process), and one repo should be able to share a lane catalogue.
- **Mobile card view and a future mobile editor.** The tree the mobile view builds
  (`step / branch / group / loop / merge`) should fall out of the syntax directly.
- **GUI round-trip and git-friendly diffs.** Stable step ids, one fact per line, a single
  canonical formatting so GUI saves do not churn history.
- **Public API and AI authoring.** A JSON-schema-validated model that an LLM can emit and a
  client can post.
- **Multilingual diagrams.** The same procedure must be readable in Japanese and English
  (and more) without maintaining two files that drift apart, and the same lane or term must be
  translated identically across every diagram in a project.
- **Whitespace-free storage and canonical formatting.** The text must parse with every
  insignificant space and newline removed, and a deterministic formatter must restore one
  canonical layout on save, so diffs, hashes and share links reflect meaning only.
- **Things users of swimlane tools ask for that the DSL cannot say today:** horizontal
  phases (time bands), free-form notes, metadata (owner, status, tags), loops back to an
  arbitrary step, non-tree flows.

---

## 1. One diagram, several languages

A diagram is authored once and rendered in any of the languages it declares. The requirement
is *consistency*: the same lane, term or step must read the same way in every diagram of a
project, in every language, and a translation must never fall out of step with the structure
it labels. Every grammar below implements this one model; only the spelling differs.

### The model

- **Declared languages.** A diagram lists its languages as BCP 47 tags; the first is the
  *source* language. `languages: ja, en` means "written in Japanese, also available in
  English".
- **Localized text.** Every human-readable string in the IR is either a plain string (source
  language only) or a map `{ ja: …, en: … }`. Nothing else in the model changes shape.
- **What is translatable.** Title; page header, footer and description; gutter column
  titles; lane labels; prop labels and hover titles; step text, `label`, `desc`, `remark`,
  `note`; decision question and case labels; fork path labels; section, branch and phase
  names. Ids, colours, shapes, icons, paths and option flags are never translated.
- **Three places to put a translation**, resolved in this order:
  1. **Inline**, next to the source text (`見積作成 | Create quote`) — for short strings
     while authoring. Segments follow the declared language order; a missing trailing
     segment falls back; `\|` is a literal bar.
  2. **Per-node override**, keyed by node id and field (`quote.desc.en: …`) — for long text,
     and for the case where one source string must translate differently in one place.
  3. **Catalog**, keyed by the source string (`"監査ログ保存" en: Store audit log`) —
     gettext-style. A translation given once applies everywhere that string appears. A
     diagram may carry its own catalog and import a project one
     (`templates/i18n/glossary`); that import is how lane names and recurring terms stay
     identical across every diagram in the repository, and a forced-template policy can
     pin it.
- **Fallback.** Missing translation → source language, and the render is tagged with the
  missing keys. `i18n-strict: true` turns that into an error (recommended for the
  `test` → `main` promotion check).
- **Selecting the language.** `lang: en` in the options sets the default render language;
  the CLI, share page, VS Code preview and SaaS viewer override it per request. A flagged
  version stores one DSL snapshot and renders one SVG per language, deduped by content
  hash plus language.
- **Layout.** Text width differs per language, so layout runs per language. With
  `i18n-uniform-layout: true` every cell takes the widest of its translations, so all
  language renders share one geometry and can be compared side by side or overlaid.
- **Tooling.** The formatter normalises language order to the declaration and can *hoist*
  inline translations into the catalog or *inline* catalog entries back (a project setting,
  so history stays stable). The linter reports coverage per language
  (`en: 18/20 — missing quote.desc, audit.note`) and unused catalog entries. The SaaS
  "Fill missing translations" action opens a `tmp-*` branch with machine-translated catalog
  entries for human review before merge to `test`.
- **Lands on v1 first.** Suffixed keys (`label.en: Sales;`) and an `/i18n/` section are
  additive; the current parser can accept them before any other v2 change ships.

---

## 2. Squash, format on save, and diff by meaning

### The rule

Whitespace and newlines are never significant outside a string. Every grammar that is a
storage format must accept its own *squashed* form: the file with all insignificant
whitespace removed, typically one line. The formatter is the inverse: it takes any parse and
emits one canonical human layout. `format(parse(x))` is deterministic, idempotent, and
depends only on the IR, so two texts with the same meaning always format identically.

### Why

- **Diffs show meaning.** After format-on-save, a git diff never contains re-indentation,
  reflowed lines or trailing-space churn. A GUI save and a hand edit that produce the same
  IR produce byte-identical files.
- **Hashes mean identity.** The SaaS already dedups rendered SVGs by content hash. Hashing
  the canonical form (or the canonical JSON of the IR) makes "unchanged" independent of how
  the file was typed.
- **Compact transport.** The squashed form fits a share-page URL fragment, a QR code, a
  clipboard paste into chat, or a query parameter for the stateless hub viewer, with no
  server round trip.
- **Robust paste.** Text pasted from mail, Slack or a spreadsheet cell, which strips or
  mangles indentation, still parses.

### Canonical layout (what the formatter writes)

- Two-space indentation, one statement per line, one blank line between top-level
  declarations; `;` always written; strings always double-quoted; hex colours lowercase.
- Fixed key order per node type, languages in declared order, translations inlined or
  hoisted per the project setting (section 1).
- Ids written only when referenced or present in the source.
- Comments are tokens attached to the following statement and are re-emitted there; a
  comment at the end of a block stays at the end of that block.
- Full-width punctuation typed through a Japanese IME (`（）「」；｛｝：`) is accepted by the
  lexer wherever the ASCII form is, and normalised to ASCII on format.

### Where it runs

- **Editor host:** `format` before every `writeDraft` and checkpoint, in every app (web,
  desktop, VS Code, SaaS). The text mode shows the canonical form after save.
- **CLI / CI:** `swimlane fmt` and `swimlane fmt --check` for repositories that also edit
  files outside the product, mirroring this repository's own `format:check`.
- **Compact:** `swimlane fmt --compact` emits the squashed form for links and embedding.

### Structural diff

Because ids are stable and the canonical form is a function of the IR, the engine can also
diff *models*: `swimlane diff a b` reports steps added, removed, moved (matched by id, then
by lane plus text), lanes renamed, translations changed, styles changed. The SaaS review
screen for `tmp-*` → `test` shows this instead of a line diff, with the line diff available
underneath.

### What each grammar can do

| Grammar        | Squashable | Reason                                                                 |
| -------------- | :--------: | ---------------------------------------------------------------------- |
| A v2           |     ◎      | steps `[…]` and control words self-delimit; properties end in `;`       |
| B Outline      |     ×      | indentation *is* structure; the formatter can only re-indent            |
| C swim.md      |     ×      | Markdown lists are indentation-based; only Markdown normalisation       |
| D Wire         |     ◎      | once every node, edge and frame statement ends in `;`                   |
| E Prose        |     ○      | sentence-delimited (`。` / `.`); case indentation is replaced by `なら` / `If` |
| F IR           |     ○      | JSON yes (canonical: sorted keys, no whitespace); YAML no               |
| G Script       |     ◎      | designed for it: braces, `;`, quoted strings, nothing else              |

Consequence: B and C cannot be storage formats under this rule. They remain useful as a
*view* (B for the mobile editor) and as an import/export (C for documentation), see the
recommendation.

---

## A. `kai-swimlane 2` — the evolved current syntax

**Goal.** Keep the shape of the current file, remove the three biggest sources of syntax errors
(`;`, `than`, the asymmetric `if … is … than` / `elseif`), and add the roadmap features. Version 2
is the only version the reader accepts: a bare `@kai-swimlane` header is refused with a pointer to
the converter, no legacy spelling is a production of this grammar, and there is no second reader.
**The formatter re-spells what it read and never repairs:** every rule below is stated once, for
one reader. Existing files are converted once, by the standalone converter described under
*Converting from v1*, in a reviewable diff.

**This grammar is the accepted target syntax.** Its full specification — lexical rules, sections,
steps, control flow, imports, multilingual authoring, the formatter, the grammar sketch, 125 edge
cases, the diagnostics catalogue and the converter from the previous syntax — is
[dsl-rule.md](dsl-rule.md); a complete worked example is
[examples/kai-swimlane-2](examples/kai-swimlane-2/README.md). This section keeps what the
comparison with the other grammars needs.

### Example

Canonical output of the formatter, followed by the same file squashed; the two carry an identical
token sequence and re-parse to one IR.

```
@kai-swimlane 2
@use templates/role/standard.swim;

/meta/
owner: sales-ops;
status: draft;
tags: order, approval;

/title/
受注処理;

/option/
show-right-gutter: true;
right-title: 備考;

/block/
<hex>
  background-color: #ffe0b3;
  shape: hex;

/prop/
<RQ>
  label: 申請書;
  side: right;

<LG>
  label: 承認ログ;
  side: left;
  max-chars: 10;

/line/
phase (見積) #gray
  [sales: 見積作成] <hex> @quote +RQ
    desc: 顧客要件を確認して見積を作成;
    remark: 金額が 100 万円超なら本部承認;
  if [manager] (承認する？)
  // 上長の一次判断のみ
  case (はい) #green
    [system: 受注登録]
  case (いいえ) #red
    [sales: 見積を修正] ..>
    loop @quote
  end-if
end-phase

fork (通知) #purple
  [system: メール送信]
and (出荷)
  [warehouse: 出荷準備] => ./shipping-prep.swim
end-fork

section (監査) @audit #blue
  [system: 監査ログ保存] +LG
    note: 保存期間は 7 年;
    note-side: left;
end-section

if (キャンセル要求は？)
case (あり) #red
  [sales: キャンセル受付]
  goto @done
else
  [manager: 通常クローズ処理]
end-if

[sales: 完了] @done

@end
```

```
@kai-swimlane 2@use templates/role/standard.swim;/meta/owner:sales-ops;status:draft;tags:order,approval;/title/受注処理;/option/show-right-gutter:true;right-title:備考;/block/<hex>background-color:#ffe0b3;shape:hex;/prop/<RQ>label:申請書;side:right;<LG>label:承認ログ;side:left;max-chars:10;/line/phase(見積)#gray[sales:見積作成]<hex>@quote+RQ desc:顧客要件を確認して見積を作成;remark:金額が 100 万円超なら本部承認;if[manager](承認する？)/* 上長の一次判断のみ */case(はい)#green[system:受注登録]case(いいえ)#red[sales:見積を修正]..>loop@quote end-if end-phase fork(通知)#purple[system:メール送信]and(出荷)[warehouse:出荷準備]=>./shipping-prep.swim end-fork section(監査)@audit#blue[system:監査ログ保存]+LG note:保存期間は 7 年;note-side:left;end-section if(キャンセル要求は？)case(あり)#red[sales:キャンセル受付]goto@done else[manager:通常クローズ処理]end-if[sales:完了]@done@end
```

### What changed from v1

| Area | v1 | v2 |
| --- | --- | --- |
| Header | `@kai-swimlane` | `@kai-swimlane 2`, matched as a **prefix**, not as a line; the bare header is refused as version 1 |
| Terminator | `;` on every property | `;` on properties, directives and the `/title/` payload only; everything else self-delimits |
| Whitespace | newline-significant, one row per line | insignificant; the squash is a token-stream transform, and `/title/` is a `;`-terminated statement |
| Imports and metadata | — | `@use <path>;` merges `/page/ /option/ /role/ /block/ /prop/ /i18n/`, recursively, prologue-only, local last; `/meta/` adds five reserved typed keys plus opaque free ones, never rendered |
| Definitions and step suffixes | `<id>` alone on its line; `<block>` only, ids on the next line | `<id>` may carry properties on the same line; suffixes `<block> @id +prop* glyph => path`, read in **any** order and written in that one |
| Property block | attaches to the nearest preceding **step** | attaches to the preceding **statement**, each of which declares a closed key set |
| Exclusive branch | `if (q) is (a) than #c` / `elseif (b) than` | `if [lane] (q) @id #c`, then uniform `case (a) #c` and `else #c`; the v1 spellings are converter input only |
| Loop and mid-merge | `[loop]`, back to the same `if` only; `merge: id;`, `if`-only | `loop` = the nearest enclosing `if` through any frame, `loop @id` = any upstream node; `goto @id`, legal in every body, containment an error and direction a warning |
| Parallel, frames and closers | `fork` / `and` / `endfork`; two untyped stacks | plus `fork (label)` and `and (label)`, one path legal; one block stack; every closer is spelled `"end-" + opener` and nothing else closes a frame |
| Phases, sub-process and notes | — | `phase (name) @id #c` … `end-phase`, a horizontal band at root scope, transparent to jumps; `=> <path>` sets `link` and defaults the shape; `note:` plus `note-side:` |
| Comments | preserved only inside `/line/` | preserved everywhere; `// text` at the start of a physical line, `/* text */` anywhere |
| Languages, ids and spacers | `id: <free text>;`, lone `:` row, `skip;` | `@lang ja, en;`, inline `a \| b`, `key.lang:`, the `/i18n/` catalog; `@id`, Unicode and case-sensitive; `[]` spacer; `key;` is the flag form of any boolean key |
| Diagnostics | line-keyed message strings | camelCase codes with `severity` and `impact`; unknown colours, icons, shapes and keys are warnings that round-trip byte for byte |

### What this needs from sections 1, 2 and F

- **Section 1.** Its closing bullet, "lands on v1 first", is withdrawn: the multilingual model ships
  with version 2 and the converter carries nothing multilingual. It must state that the converter
  escapes a literal `|` in an existing file once; that an inline
  segment and a `field.lang:` line are one IR slot with two spellings, so supplying both is a
  duplicate key; that hoisting is controlled by `/option/ i18n-storage:` in the file and not by
  host configuration; that `i18n-strict` is `severity: error, impact: none`; and that a catalog key
  carries its tag as a dotted suffix, `"監査ログ保存".en:`, the space-separated form being
  `i18nEntryMalformed`, while an extensionless glossary path is `missingExtension`, so its example
  path is `templates/i18n/glossary.swim`.
- **Section 2.** "Strings always double-quoted" cannot be met, grammar A's text being delimited by
  its construct and a v1 value being free to begin with `"`; it must become "quoted exactly when
  the published quoting predicate requires it". "Whitespace and newlines are never significant
  outside a string" must become invariant 2's token-stream rule, stated with the six structural
  whitespace characters and the `//` → `/* */` respelling. It further needs two hashes instead of
  one, block-scoped comment attachment, full-width punctuation in delimiter position only, `/i18n/`
  keys and `field.lang:` lines counted as id references, the two-producer save rule in place of
  "format before every write", error spans re-emitted verbatim, and diff by exact keys. Compact
  transport must also carry the payload in the URL **fragment**, never a query parameter, because a
  query sends the diagram to the server and the `#` that opens every colour and icon token
  truncates it; and "robust paste" must read "text whose indentation has been stripped or mangled
  still parses, and once formatted, so does text whose newlines have been removed".
- **Grammar F.** Fields this section writes and F does not have: a fork path as an object with
  `id`, `label`, `color` and `body`; `if.color`; hex strings in `color`; the `#` sigil kept on
  `icon`; `step.skip` and an empty `step.text`; a spacer node; comments on every node and trailing
  comments on every body, section and file; an explicit cleared value, plus per-key provenance and
  a source/resolved flag; `note` and `note-side` on every control kind and on `page`; an ordered
  `unknown` bag; provisional lanes and props; the resolved import closure; and a catalog split into
  id-keyed and string-keyed sub-spaces, so a source string reading `quote.remark` and the node
  field `quote.remark` are different keys. F must also merge `i18n` under `use`, define
  `resolve(ir, lang)` as the four-level chain, publish a strict schema plus a partial one carrying
  the recovery `error` node, and state the `LocalizedText` string convention normatively: an IR
  string is authored source text with the DSL escapes resolved by the lexer, except that a `\`
  before a non-table character is retained as two characters — without which A → IR → A is not
  lossless.
- **Comparison and detection tables.** A's squashability ◎ is earned only under the token-stream
  rule and its reason line must say so; its losslessness and GUI round-trip ◎s are provisional on
  the F fields above. The detection row must accept a leading BOM and a trailing `\r` and match the
  header as a prefix, or a squashed one-line file is never detected; an unrecognised version, and the bare
  `@kai-swimlane` header that today selects v1, must dispatch to `unsupportedVersion` and stop
  rather than fall through to another grammar's row; and
  the extension is a tie-break only among candidates that produced no header.
- **Recommendation.** Step 3, "ship A as the compatibility grammar" with a v1 reader kept for
  one major version, becomes "ship A with `swimlane convert`": the v1 reader is retired, every
  repository is converted once on a `tmp-*` branch, and the `unsupportedVersion` host contract —
  destructive today, since an unknown version reads as a blank file — lands first. Step 2's single
  canonical hash splits into `sourceHash` and `renderHash` plus an import reverse index.

### Trade-offs

- **Pro:** zero relearning. The file keeps its shape — sections, `[role: text]`, `key: value;` —
  and the parser is an extension of the current one: row kinds unchanged, `phase` a new group mode,
  `note` a step field, `@use` a pre-pass.
- **Pro:** one reader, one spelling per construct. No legacy productions, no coexistence window,
  and the converter is checked by `renderHash` over the corpus rather than trusted.
- **Pro:** the `than` / `elseif` error class is gone, and value-level problems no longer hard-lock
  a diagram: an unknown colour today blocks formatting and can lose the token on save, where here
  it is a warning that renders, formats and round-trips byte for byte.
- **Pro:** whitespace-insensitive under a token-stream squash, so it meets section 2 while still
  looking like the current syntax, and path-anchored diagnostics keep working where line-keyed ones
  break.
- **Con:** still a keyword-terminated language, so nesting depth is invisible until the formatter
  has run.
- **Con:** every existing file must be converted before it opens, in one pass per repository; the
  converter refuses four inputs rather than guess, and those files need a hand edit first.
- **Con:** the surface is large — two hashes, two IRs, a provenance layer, a closed escape table
  and sixty-odd diagnostic codes — and several ◎ ratings are provisional: `fork (label)`,
  `if.color`, `skip`, the spacer node, comment nodes, the icon sigil and hex colours need IR fields
  the current sketch lacks, so until they land A → IR → A is lossy.

---

## B. Outline — indentation is structure

**Goal.** No `end*` keywords, no brackets around steps. Nesting is indentation, so the file
*is* the tree the mobile view and GUI already work with, and every edit is a local line change.

### Example

```
swimlane 2
use: ./templates/page/corporate.swim
title: 受注処理
meta:
  owner: sales-ops
  status: draft

lanes:
  sales     営業     #0066cc/#e6f2ff  icon=user
  manager   上長     #7c3aed/#f3e8ff  icon=badge-check
  system    システム #334155/#f1f5f9  icon=server
  warehouse 倉庫     #92400e/#fef3c7  icon=package

blocks:
  hex       shape=hex bg=#ffe0b3
  terminal  shape=rounded border=#aa5500

props:
  RQ  申請書  right
  LG  承認ログ left max=10

flow:
  phase 見積 #gray
    sales: 見積作成 <hex> @quote +RQ
      desc: 顧客要件を確認して見積を作成
      remark: 金額が 100 万円超なら本部承認
    if 承認する？
      - はい #green
        system: 受注登録
      - いいえ #red
        sales: 見積を修正 ..>
        loop @quote
  fork #purple
    -
      system: メール送信
    -
      warehouse: 出荷準備 => ./shipping-prep.swim
  section 監査 #blue
    system: 監査ログ保存 +LG
      note: 保存期間は 7 年
  if キャンセル要求は？
    - あり #red
      sales: キャンセル受付
      goto done
    - else
      manager: 通常クローズ処理
  sales: 完了 <terminal> @done
    label: 完了
```

### Rules

- Two-space indentation, tabs rejected. A line's parent is the nearest less-indented line.
- `lane: text …` is a step. `- label` under `if` is a case, under `fork` a path. Reserved
  keys (`desc remark remark-desc label note props arrow skip id`) indented under a step are
  properties; a lane may not be named after a reserved key.
- Multi-line text: `desc: |` followed by an indented block, like YAML.
- Compact lane / block / prop definitions are positional (`id label fg/bg key=value…`); the
  long form `sales:` + indented `key: value` lines is also allowed.

### Mapping to the IR

Direct: each indented block is a `body` array. `if` → `if.cases[]`, `- ` under `fork` →
`fork.paths[]`, `section` / `branch` / `phase` → `group`. No stack of open/close keywords
to reconcile, so unbalanced-block errors disappear as a class.

### Multiple languages

```
swimlane 2
languages: ja, en
use: ./templates/i18n/glossary.swim

lanes:
  sales   営業|Sales    #0066cc/#e6f2ff icon=user
  manager 上長|Manager

flow:
  sales: 見積作成 | Create quote <hex> @quote +RQ
    desc: 顧客要件を確認して見積を作成
    desc.en: Check the customer requirements and draft the quote
  if 承認する？ | Approve?
    - はい | Yes #green
      system: 受注登録 | Register order
    - いいえ | No #red
      sales: 見積を修正 | Fix quote
      loop @quote
  section 監査 | Audit #blue
    system: 監査ログ保存

i18n:
  en:
    監査ログ保存: Store audit log
    quote.remark: Head-office approval above ¥1M
```

- Same inline `|` and `.lang` suffix as A. The catalog is a top-level `i18n:` block grouped
  **by language first**, which is the shape translators prefer (one block per language to
  hand off); the parser also accepts source-string-first nesting.
- Because the flow is a tree of indented lines, the linter can point at a *node* that lacks
  a translation, not just a string, and the mobile editor can show a per-card language tab.

### Trade-offs

- **Pro:** shortest of the six; structure visible at a glance; trivially serialized from the
  GUI with a stable canonical form; mobile editor can edit a subtree in isolation.
- **Pro:** unbalanced `endif` / `endfork` / `end-section` errors cannot occur.
- **Con:** whitespace-significant. Pasting into chat, email or a cell strips indentation and
  silently changes meaning. Mitigation: the formatter re-derives indentation from a `.` prefix
  fallback (`..sales: …`) on import.
- **Con:** not a superset of v1; migration is a one-way conversion through the IR.
- **Con:** fails the squash rule of section 2 by construction. Kept as the mobile editor's
  internal outline view, not as a storage format.

---

## C. `swim.md` — the diagram is a Markdown document

**Goal.** Diagrams live in GitHub repositories. A grammar that GitHub, VS Code and any Markdown
viewer already render as a readable procedure means the repository is useful even where the
engine is not installed, and the SaaS can treat `README`-style docs and diagrams as one thing.
Front matter carries the sections that templates standardize; the body carries the flow.

### Example

```markdown
---
swimlane: 2
use: [./templates/page/corporate.swim, ./templates/role/standard.swim]
title: 受注処理
owner: sales-ops
status: draft
option: { show-right-gutter: true, right-title: 備考 }
blocks:
  hex: { shape: hex, background-color: "#ffe0b3" }
  terminal: { shape: rounded, border-color: "#aa5500" }
props:
  RQ: { label: 申請書, side: right }
  LG: { label: 承認ログ, side: left, max-chars: 10 }
---

# 受注処理

## 見積 {.phase color=gray}

1. **営業** 見積作成 {.hex #quote +RQ}
   顧客要件を確認して見積を作成
   > 金額が 100 万円超なら本部承認

2. **上長** 承認する？
   - **はい** {color=green}
     1. **システム** 受注登録
   - **いいえ** {color=red}
     1. **営業** 見積を修正 {arrow=dotted}
     2. ↩ @quote

## 出荷

- **並行** {color=purple}
  - 1. **システム** メール送信
  - 1. **倉庫** 出荷準備 → [shipping-prep](./shipping-prep.swim.md)

- **監査** {.section color=blue}
  1. **システム** 監査ログ保存 {+LG}
     <!-- note: 保存期間は 7 年 -->

3. **営業** キャンセル要求は？
   - **あり** {color=red}
     1. **営業** キャンセル受付
     2. ⇢ @done
   - **それ以外**
     1. **上長** 通常クローズ処理

4. **営業** 完了 {.terminal #done label=完了}
```

### Rules

- Front matter (YAML) = `/meta/ /page/ /option/ /block/ /prop/` and `use`. `lanes` may be
  listed there or imported; **lanes are referenced by their label**, in bold, at the start of
  a list item. Unknown bold label = error listing the declared lanes.
- An ordered-list item `N. **Lane** text {attrs}` is a step. Trailing `{…}` uses Pandoc
  attribute syntax: `#id`, `.block-or-role-class`, `key=value`, plus `+prop`.
- A step whose text ends in `？`/`?` and is followed by a bullet list is a decision; each
  bullet `- **label** {color=…}` is a case. The step itself stays in the lane (the diamond is
  drawn in that lane), which fixes a v1 gap: today a decision has no owner lane.
- `- **並行**` / `- **fork**` with nested lists = parallel paths; `- **name** {.section}` /
  `{.branch}` = frame or side line; `## heading {.phase}` = phase band.
- `↩ @id` = loop, `⇢ @id` = goto, `→ [text](path)` = sub-process link. ASCII fallbacks
  `<- @id`, `-> @id` and a plain link are accepted.
- Continuation paragraph under a step = `desc`; blockquote = `remark`; HTML comment
  `<!-- note: … -->` = note (invisible on GitHub, rendered on the canvas).

### Multiple languages

Two forms, matching how documentation repositories already work.

**Inline attributes** for short strings (Pandoc syntax, so it still renders cleanly):

```markdown
---
swimlane: 2
languages: [ja, en]
use: [./templates/i18n/glossary.swim]
title: { ja: 受注処理, en: Order handling }
---

1. **営業** 見積作成 {#quote .hex +RQ en="Create quote"}
   顧客要件を確認して見積を作成
   <!-- en: Check the customer requirements and draft the quote -->
2. **上長** 承認する？ {en="Approve?"}
   - **はい** {color=green en="Yes"}
     1. **システム** 受注登録 {en="Register order"}
```

**Parallel documents** for full translations: `order.swim.md` (source) and
`order.en.swim.md` (translation). The translation carries `translates: ./order.swim.md` in
its front matter and the same list structure with the same `{#id}` attributes; bold lane
names are resolved against the lane labels *in that document's language* (`**Sales**`).

```markdown
---
translates: ./order.swim.md
lang: en
---

1. **Sales** Create quote {#quote}
   Check the customer requirements and draft the quote
2. **Manager** Approve?
   - **Yes**
     1. **System** Register order
```

- The engine merges parallel documents into one IR by id and position, and the linter
  fails on any structural difference (missing step, extra case, different nesting), so a
  translation cannot silently diverge from the source.
- Both documents render on GitHub as ordinary procedures in their own language, which is
  the point of this grammar.

### Trade-offs

- **Pro:** renders as a readable document everywhere; diff-friendly; front matter is the
  natural place for template references; docs and diagrams in the same tree and same search.
- **Pro:** decisions get a lane; phases come from headings for free.
- **Con:** Markdown list nesting is fragile (indent width, mixed markers); the parser must
  own its own list tokenizer rather than rely on a generic Markdown parser.
- **Con:** lane-by-label means renaming a lane touches every step; the formatter should
  offer a rename refactor.
- **Con:** fails the squash rule of section 2 (list nesting is indentation). Positioned as
  an import/export format: `swimlane export --md` writes it for documentation, and the
  importer reads it back.

---

## D. Wire — nodes and edges

**Goal.** Everything above is a *structured* language: flows are trees with one entry and
one exit, which is what makes the layout deterministic. Some real procedures are not trees
(two decisions merging into one step, a loop back three steps, an exception path that joins
mid-fork). Wire declares nodes and edges explicitly, Graphviz-style, and lets the engine
*recover* structure when it is there and fall back to free routing when it is not.

### Example

```
wire 2
use ./templates/role/standard.swim;

# nodes:  id : lane  "text"  <block> +prop  key=value
quote     : sales     "見積作成"        <hex> +RQ  desc="顧客要件を確認して見積を作成";
approve?  : manager   "承認する？";
register  : system    "受注登録";
fix       : sales     "見積を修正";
notify    : system    "メール送信";
prep      : warehouse "出荷準備"        => ./shipping-prep.swim;
audit     : system    "監査ログ保存"    +LG  note="保存期間は 7 年";
cancel?   : sales     "キャンセル要求は？";
accept    : sales     "キャンセル受付";
close     : manager   "通常クローズ処理";
done      : sales     "完了"            <terminal> label="完了";

# edges
quote    -> approve?;
approve? -[はい #green]-> register;
approve? -[いいえ #red]-> fix ..> quote;
register => notify, prep => audit;  # => splits and joins in parallel
audit    -> cancel?;
cancel?  -[あり #red]-> accept -> done;
cancel?  -[else]-> close -> done;

# frames
phase   "見積" #gray { quote approve? register fix };
section "監査" #blue { audit };
```

### Rules

- Node line: `id : lane "text"` + optional `<block>`, `+prop…`, `key=value…`, `=> path`.
  An id ending in `?` is a decision (rendered as a diamond in its lane).
- Edge line: a chain `a -> b -> c`. Glyphs: `->` solid, `~>` dashed, `..>` dotted,
  `-.>` dash-dot, `-->` long-dash. Label and colour go inside `-[label #color]->`.
  `a => b, c => d` fans out to `b` and `c` in parallel and joins at `d`.
- `phase` / `section` / `branch` name a set of node ids.
- Every node, edge, frame and `lang` entry ends in `;`, so newlines are insignificant and
  the file squashes to one line (section 2). `#` comments run to end of line.
- Row order = topological order of the edge graph, ties broken by declaration order.
  Back-edges (target declared earlier and reachable) become loops; forward jumps that skip
  the structural join become `goto`.

### Mapping to the IR

A structure-recovery pass (standard "structured control-flow reconstruction"): a decision
whose out-edges all reconverge at one post-dominator is an `if`; a `=>` fan-out with a
common join is a `fork`; otherwise the file is marked `layout: free` and the renderer uses
the routing engine instead of the row grid. Files that reduce fully are indistinguishable
from A/B/C in the IR and can be converted to them; free-form files can only be stored as
Wire or IR.

### Multiple languages

Every node already has an id, so the per-node override is the primary form; a `lang` block
groups one language's strings, and edge labels are addressed as `node[label]`.

```
wire 2
lang ja, en;
use ./templates/i18n/glossary.swim;

quote     : sales   "見積作成"  <hex> +RQ  desc="顧客要件を確認して見積を作成";
approve?  : manager "承認する？";
register  : system  "受注登録";

lang en {
  quote            "Create quote"  desc="Check the customer requirements and draft the quote";
  approve?         "Approve?";
  approve?[はい]   "Yes";
  approve?[いいえ] "No";
  register         "Register order";
  sales            "Sales";  # lane label
  "監査ログ保存"   "Store audit log";  # catalog entry (source-string keyed)
}
```

- Inline `"見積作成" | "Create quote"` is also accepted on node lines.
- `lang xx { … }` blocks can live in a separate `.i18n.wire` file that is `use`d, so a
  translator never touches the edge list.

### Trade-offs

- **Pro:** expresses every flow, including the non-tree cases that produce "cannot express
  this" today; ids are mandatory, so GUI and mobile edits always have stable anchors.
- **Pro:** the same grammar can describe sequence-style diagrams later (lanes become
  lifelines) without a new language.
- **Con:** twice the text of B for the same tree-shaped flow; order is implicit; a typo in
  an id silently creates an orphan node (must be an error).
- **Con:** free-form layouts lose the numbered-step gutter and the guarantee that the SVG is
  the same across renders. Reserve for the minority of diagrams that need it.

---

## E. Prose — a controlled natural language

**Goal.** A grammar a domain expert can dictate on a phone or an LLM can produce from a
paragraph of requirements, with no punctuation to learn. It is a *controlled* language:
sentences follow a fixed pattern, so parsing is deterministic, but the result reads as
ordinary text. Intended as an input and review format, converted to A/B/IR on save, never as
the storage format.

### Example (Japanese)

```
受注処理。役割は 営業、上長、システム、倉庫。

営業 が 見積を作成 する（申請書）。
上長 が 承認する？ を判断する。
  はい なら、システム が 受注を登録 する。
  いいえ なら、営業 が 見積を修正 して、「見積を作成」に戻る。
同時に、システム が メールを送信 し、倉庫 が 出荷を準備 する（→ shipping-prep）。
監査 として、システム が 監査ログを保存 する（承認ログ）。
営業 が キャンセル要求は？ を判断する。
  あり なら、営業 が キャンセルを受け付け て、「完了」に進む。
  それ以外は、上長 が 通常クローズ処理 をする。
営業 が 完了 する。
```

### Example (English)

```
Order handling. Roles: Sales, Manager, System, Warehouse.

Sales creates a quote (RQ).
Manager decides "Approve?".
  If yes, System registers the order.
  If no, Sales fixes the quote and goes back to "creates a quote".
In parallel, System sends the email and Warehouse prepares shipment (-> shipping-prep).
As "Audit", System stores the audit log (LG).
Sales decides "Cancel requested?".
  If yes, Sales accepts the cancellation and jumps to "Done".
  Otherwise, Manager runs the normal close.
Sales is done.
```

### Rules (per language pack)

- First sentence: title. `役割は …` / `Roles: …` declares lanes (labels; styling comes from
  `@use` or project defaults).
- A step is `<Lane> が <text> する` / `<Lane> <verb phrase>`. The lane is matched against
  declared labels; everything up to the verb marker is the step text. Parenthesised tokens
  after the text are prop ids or `→ path` sub-process links.
- `<Lane> が <question> を判断する` / `<Lane> decides "<question>"` opens a decision; the
  following indented `<label> なら、…` / `If <label>, …` sentences are cases; `それ以外は` /
  `Otherwise` is `else`.
- `「text」に戻る` / `goes back to "text"` = loop to the step with that text; `「text」に進む` /
  `jumps to "text"` = goto. Text must match one step exactly (the formatter inserts ids).
- `同時に、A し、B する` / `In parallel, A and B` = fork with one path per clause.
- `<name> として、…` / `As "<name>", …` = section for the following sentence or indented
  block.
- Colours are not expressible; the converter assigns theme defaults. Everything else (desc,
  remark, arrow style) is added after conversion in A or G.
- Sentences are delimited by `。` / `.`, so the text squashes to one line; case
  indentation is cosmetic because `なら` / `If` and `それ以外は` / `Otherwise` carry the
  structure. The formatter writes one sentence per line and indents cases.

### Multiple languages

Prose is translated the way prose always is: one document per language, same sentence
order. The English example above is exactly that: the translation of the Japanese one.

- Lanes are matched by *position* in the `役割は …` / `Roles: …` line, not by name, so
  `営業` ↔ `Sales` needs no mapping table.
- The converter parses each document with its own language pack, then merges by sentence
  position; a structural mismatch (a different number of cases, a missing "In parallel")
  stops the import at that sentence with both texts shown.
- Because the IR can be rendered back to prose in any language pack, a reviewer who reads
  only English can approve a diagram authored in Japanese, and vice versa.
- Still lossy in the same ways as single-language prose: no colours, no layout options.

### Trade-offs

- **Pro:** lowest barrier of all; ideal LLM target (few tokens, no brackets to balance);
  reads as documentation.
- **Pro:** doubles as a *review* view: the SaaS can render any IR back to prose so a
  non-technical approver reads a paragraph instead of a diagram.
- **Con:** lossy (no colours, no layout options); one grammar per human language; step
  references by text are brittle. Hence: input/review only, with A or B as the saved form.

---

## F. IR — the canonical model (YAML / JSON)

**Goal.** One schema that every grammar above parses into and serializes from; the shape the
GUI edits, the mobile view walks, the public API accepts, the LLM emits with structured
output, and the SaaS validates forced templates against. Hand-authoring is possible in YAML
but not the point.

### Example

```yaml
swimlane: 2
meta: { owner: sales-ops, status: draft, tags: [order, approval] }
use: [./templates/page/corporate.swim, ./templates/role/standard.swim]
title: 受注処理
option: { show-right-gutter: true, right-title: 備考 }
lanes:
  - { id: sales, label: 営業, text-color: "#0066cc", background-color: "#e6f2ff", icon: user }
  - { id: manager, label: 上長 }
  - { id: system, label: システム }
  - { id: warehouse, label: 倉庫 }
blocks:
  hex: { shape: hex, background-color: "#ffe0b3" }
  terminal: { shape: rounded, border-color: "#aa5500" }
props:
  RQ: { label: 申請書, side: right }
  LG: { label: 承認ログ, side: left, max-chars: 10 }
flow:
  - phase:
      name: 見積
      color: gray
      body:
        - step: { id: quote, lane: sales, text: 見積作成, block: hex, props: [RQ],
                  desc: 顧客要件を確認して見積を作成, remark: 金額が 100 万円超なら本部承認 }
        - if:
            question: 承認する？
            lane: manager
            cases:
              - label: はい
                color: green
                body: [ { step: { lane: system, text: 受注登録 } } ]
              - label: いいえ
                color: red
                body:
                  - step: { lane: sales, text: 見積を修正, arrow: dotted }
                  - loop: { to: quote }
  - fork:
      color: purple
      paths:
        - [ { step: { lane: system, text: メール送信 } } ]
        - [ { step: { lane: warehouse, text: 出荷準備, link: ./shipping-prep.swim } } ]
  - section:
      name: 監査
      color: blue
      body: [ { step: { lane: system, text: 監査ログ保存, props: [LG], note: 保存期間は 7 年 } } ]
  - if:
      question: キャンセル要求は？
      cases:
        - label: あり
          color: red
          body: [ { step: { lane: sales, text: キャンセル受付 } }, { goto: done } ]
        - else: true
          body: [ { step: { lane: manager, text: 通常クローズ処理 } } ]
  - step: { id: done, lane: sales, text: 完了, block: terminal, label: 完了 }
```

### Design points

- **Nested, not flat.** The current parser emits a flat row list with `depth` and paired
  `branchStart` / `branchEnd` rows. The IR nests bodies; a thin adapter produces today's
  row list for the existing layout code so the renderer does not change on day one.
- **JSON Schema published** with the engine. It gives: editor validation, API request
  validation, LLM structured output, and a versioned contract (`swimlane: 2`) for
  migrations.
- **Every node may carry `id`.** Text grammars omit ids they do not need; the GUI assigns
  them on first edit; serializers back to A/B/C only write ids that are referenced or were
  present in the source, so files stay clean.
- **`use` is resolved by the host**, not the parser (SaaS: repo tree at the branch ref;
  desktop: relative path; web: unsupported and reported). The resolved fragments are merged
  into `lanes` / `blocks` / `props` / `page` / `option` with a provenance tag so a forced
  section can be checked by identity (`use` includes the pinned path and the file does not
  override any of its keys).
- **`layout: free`** (Wire only) switches the renderer from the row grid to the routing
  engine; all other files are `layout: grid` (default).
- **Canonical JSON** (sorted keys, no whitespace, ids only where referenced) is the form
  that is hashed for SVG dedup and version identity; YAML is the human-readable view.

### Multiple languages

```yaml
swimlane: 2
languages: [ja, en]          # first = source
option: { lang: ja, i18n-strict: true, i18n-uniform-layout: false }
use: [./templates/i18n/glossary.swim]
title: { ja: 受注処理, en: Order handling }
lanes:
  - { id: sales, label: { ja: 営業, en: Sales }, icon: user }
  - { id: manager, label: { ja: 上長, en: Manager } }
flow:
  - step:
      id: quote
      lane: sales
      text: { ja: 見積作成, en: Create quote }
      desc: { ja: 顧客要件を確認して見積を作成, en: Check the customer requirements and draft the quote }
  - if:
      question: { ja: 承認する？, en: Approve? }
      cases:
        - label: { ja: はい, en: Yes }
          body: [ { step: { lane: system, text: { ja: 受注登録, en: Register order } } } ]
  - step: { lane: system, text: 監査ログ保存 }        # plain string → resolved via catalog
i18n:
  en:
    監査ログ保存: Store audit log
    quote.remark: Head-office approval above ¥1M
```

- Schema: `LocalizedText = string | { [bcp47]: string }`, used for every field in the
  translatable list. `i18n` is `{ [lang]: { [sourceString | "id.field"]: string } }`.
- `resolve(ir, lang)` returns an IR whose strings are all plain, plus `missing[]`; the
  renderer, mobile view and public API read only resolved IRs. The unresolved IR with its
  catalog is the storage and round-trip form.
- The GUI edits the map form directly (one input per declared language); the API accepts
  either form and normalises.

### Trade-offs

- **Pro:** removes the "which grammar is real" question; every other grammar becomes a
  front-end; mobile / GUI / API share one contract.
- **Con:** verbose; not what people write by hand; YAML has its own foot-guns (`#` colours
  must be quoted, `yes`/`no` are booleans).

---

## G. Script — a programming-language grammar

**Goal.** A grammar that a developer reads without a manual: declarations with braces,
statements with `;`, quoted strings, identifiers, `//` comments. Nothing is delimited by
whitespace, so it is the natural fit for section 2: squash it to one line, format it back.
Steps read as *lane does text*: `sales("見積作成")`. Ids are assignments; `goto` and `loop`
reference them and are checked like variables. A TextMate grammar and a language server
(completion of lanes, blocks, props and ids; go-to-definition; rename) follow directly.

### Example

```
swimlane "受注処理" | "Order handling" {
  lang ja, en;
  use "./templates/page/corporate.swims";
  use "./templates/i18n/glossary.swims";

  meta   { owner: "sales-ops"; status: draft; tags: [order, approval]; }
  option { show-right-gutter: true; right-title: "備考" | "Remarks"; }

  lane sales     { label: "営業" | "Sales"; text-color: #0066cc; background-color: #e6f2ff; icon: user; }
  lane manager   { label: "上長" | "Manager"; }
  lane system    { label: "システム" | "System"; }
  lane warehouse { label: "倉庫" | "Warehouse"; }

  block hex      { shape: hex;     background-color: #ffe0b3; }
  block terminal { shape: rounded; border-color: #aa5500; }

  prop RQ { label: "申請書" | "Request form"; side: right; }
  prop LG { label: "承認ログ" | "Approval log"; side: left; max-chars: 10; }

  flow {
    phase("見積" | "Quotation", gray) {
      quote = sales("見積作成" | "Create quote", hex) {
        props: [RQ];
        desc: "顧客要件を確認して見積を作成" | "Check the customer requirements and draft the quote";
        remark: "金額が 100 万円超なら本部承認";
      }
      if ("承認する？" | "Approve?") {
        case ("はい" | "Yes", green) { system("受注登録" | "Register order"); }
        case ("いいえ" | "No", red) {
          sales("見積を修正" | "Fix quote") { arrow: dotted; }
          loop quote;
        }
      }
    }

    fork(purple) {
      path { system("メール送信" | "Send email"); }
      path { warehouse("出荷準備" | "Prepare shipment") { link: "./shipping-prep.swims"; } }
    }

    section("監査" | "Audit", blue) {
      system("監査ログ保存") { props: [LG]; note: "保存期間は 7 年" | "Retained for 7 years"; }
    }

    if ("キャンセル要求は？" | "Cancel requested?") {
      case ("あり" | "Yes", red) { sales("キャンセル受付" | "Accept cancellation"); goto done; }
      else { manager("通常クローズ処理" | "Normal close"); }
    }

    done = sales("完了", terminal) { label: "完了"; }
  }

  i18n en {
    "監査ログ保存": "Store audit log";
    "完了": "Done";
    quote.remark: "Head-office approval above ¥1M";
  }
}
```

The same file squashed (what a share link or a clipboard paste carries; the formatter
restores the layout above on save):

```
swimlane"受注処理"|"Order handling"{lang ja,en;lane sales{label:"営業"|"Sales";}lane manager{label:"上長"|"Manager";}lane system{label:"システム"|"System";}flow{quote=sales("見積作成"|"Create quote",hex){props:[RQ];}if("承認する？"|"Approve?"){case("はい"|"Yes",green){system("受注登録"|"Register order");}case("いいえ"|"No",red){sales("見積を修正"|"Fix quote"){arrow:dotted;}loop quote;}}done=sales("完了",terminal);}i18n en{"完了":"Done";}}
```

### Grammar sketch

```
file      := "swimlane" text? "{" item* "}"
item      := "lang" tag ("," tag)* ";"
           | "use" string ";"
           | ("meta" | "option" | "page") props
           | ("lane" | "block" | "prop") id props
           | "flow" "{" stmt* "}"
           | "i18n" tag "{" (( string | id "." key ) ":" string ";")* "}"
props     := "{" (key ":" value ";")* "}"
stmt      := (id "=")? laneId "(" text ("," blockId)? ")" (props | ";")   -- a step
           | "if" "(" text ")" "{" ("case" "(" text ("," color)? ")" body | "else" body)+ "}"
           | "fork" ("(" color ")")? "{" ("path" ("(" text ")")? body)+ "}"
           | ("section" | "branch" | "phase") "(" text ("," color)? ")" body
           | "loop" id? ";" | "goto" id ";"
body      := "{" stmt* "}"
text      := string ("|" string)*                       -- one string per declared language
value     := text | number | bool | color | id | "[" value ("," value)* "]" | props
string    := '"' chars '"' | ' multi-line '      -- escapes: \" \\ \n \|
comment   := "//" … EOL | "/*" … "*/"
```

### Rules

- Keys keep the shared vocabulary (`show-right-gutter`, `max-chars`): a `-` inside an
  identifier before `:` is part of the identifier. `camelCase` spellings are accepted and
  normalised by the formatter, so both habits work.
- A step with a property block needs no `;` (like a function declaration); a step without
  one ends in `;`. The formatter enforces whichever applies.
- Bare words in value position are enumerations or references (`draft`, `hex`, `dotted`,
  `user`); anything user-visible is a string. This is what makes squashing safe: no
  heuristic ever decides where text ends.
- `loop` with no id returns to the enclosing `if`; `loop quote` targets any upstream step
  or decision; `goto done` any downstream one. Unknown ids are errors with the declaring
  line suggested (edit distance), like an undefined variable.
- Full-width `（）「」；｛｝：` from a Japanese IME are accepted and normalised (section 2).
- Detection: first token `swimlane` followed by a string or `{`; extension `.swims`;
  Markdown fence ```` ```swims ````.

### Mapping to the IR

One-to-one. Braces are `body` arrays, `case` / `path` are the case and path arrays, the
property block is the node's fields, `text` with `|` is `LocalizedText`, `i18n` is the
catalog. Serialising the IR back to G is the formatter itself.

### Trade-offs

- **Pro:** whitespace-free by design; the shortest path to squash / format / hash / share
  links; unambiguous lexing; familiar to every developer and to LLMs, which are strongest
  at C-style syntax; stable ids give the structural diff and the language server their
  anchors.
- **Pro:** nesting is visible, so section, phase and fork depth read at a glance after
  formatting; unbalanced braces are reported at the exact position by the lexer.
- **Con:** braces and quotes are noise for non-programmers; the GUI, the IME normalisation
  and format-on-save are the mitigation, and the prose grammar (E) is the on-ramp.
- **Con:** not a superset of v1; A remains the compatibility path, with A ↔ G lossless
  through the IR.

---

## Comparison

| Criterion                          | A v2 | B Outline | C swim.md | D Wire | E Prose | F IR | G Script |
| ---------------------------------- | :--: | :-------: | :-------: | :----: | :-----: | :--: | :------: |
| Learning cost from v1              |  ◎   |     ○     |     ○     |   △    |    ◎    |  △   |    ○     |
| Terseness (lines for the sample)   |  ○   |     ◎     |     △     |   △    |    ◎    |  ×   |    ○     |
| Structural errors impossible       |  ×   |     ◎     |     △     |   ○    |    ○    |  ◎   |    ○     |
| GUI round-trip stability           |  ◎   |     ◎     |     △     |   ○    |    ×    |  ◎   |    ◎     |
| Mobile tree mapping                |  ○   |     ◎     |     ○     |   △    |    ○    |  ◎   |    ◎     |
| Non-tree flows                     |  ×   |     ×     |     ×     |   ◎    |    ×    |  ◎   |    ×     |
| Readable on GitHub without engine  |  △   |     △     |     ◎     |   △    |    ◎    |  △   |    △     |
| LLM authoring                      |  ○   |     ○     |     ○     |   △    |    ◎    |  ◎   |    ◎     |
| Template / `use` support           |  ◎   |     ◎     |     ◎     |   ○    |    △    |  ◎   |    ◎     |
| Lossless vs. v1                    |  ◎   |     ◎     |     ○     |   ◎    |    ×    |  ◎   |    ◎     |
| Paste-safe (whitespace)            |  ◎   |     ×     |     △     |   ◎    |    ◎    |  ○   |    ◎     |
| Multilingual authoring             |  ◎   |     ◎     |     ◎     |   ○    |    ○    |  ◎   |    ◎     |
| Squashable + canonical formatter   |  ◎   |     ×     |     ×     |   ◎    |    ○    |  ○   |    ◎     |
| Editor tooling (highlight, LSP)    |  ○   |     ○     |     △     |   ○    |    ×    |  ○   |    ◎     |

◎ strong · ○ good · △ weak · × not a goal

---

## Detection and coexistence

One `parse(text, {filename})` entry point dispatches on the first non-blank line, with the
file extension as a tie-breaker:

| First line / extension                     | Grammar |
| ------------------------------------------ | ------- |
| `@kai-swimlane` (bare)                     | v1 (current parser, unchanged) |
| `@kai-swimlane 2`, `.swim`                 | A       |
| `swimlane 2`, `.swim.out`                  | B       |
| `---` front matter with `swimlane:`, `.swim.md` | C  |
| `wire 2`, `.swim.wire`                     | D       |
| `.swim.yaml` / `.swim.json`, top-level `swimlane:` | F |
| `swimlane "…" {` or `swimlane {`, `.swims`  | G       |
| Prose                                      | never auto-detected; explicit "Import from text" action |

Markdown fences keep working: ```` ```kai-swimlane ```` = v1, ```` ```swim ```` = A,
```` ```swim-outline ```` = B, ```` ```swim-wire ```` = D, ```` ```swims ```` = G.

---

## Recommendation and order of work

1. **Build F first, by extraction.** Wrap the current parser output in the nested IR,
   publish the JSON Schema, define canonical JSON, and make the GUI and mobile view consume
   the IR. No user-visible change; it de-risks everything after.
2. **Build the formatter and the structural diff on the IR next.** Both are grammar
   independent. Wire format-on-save into the editor host, `swimlane fmt --check` into
   project CI, and hash the canonical form for SVG dedup and version identity (section 2).
3. **Ship A as the compatibility grammar.** Whitespace-insensitive with `;` kept, uniform
   `case`, `goto` / `loop @id`, `@use`, `/meta/`, `phase`, `note`, `=>`. The formatter's
   "Upgrade syntax" rewrites v1; the v1 reader stays for one major version.
4. **Ship G as the default for new diagrams.** TextMate grammar for VS Code and the web
   editor, then the language server (completion, go-to-definition, rename). A ↔ G is
   lossless through the IR, so a project picks its default grammar in `.swimlane.json` and
   individual files may differ.
5. **Ship multilingual support in two steps.** First, additively on v1 and A: `LocalizedText`
   in the IR, `key.lang:` suffixes, the `/i18n/` section, `lang:` in the options, a language
   switch in the viewer and share page. Then inline `|`, the glossary import, coverage lint
   and `i18n-strict` on promotion. Glossaries live under `templates/i18n/` so the existing
   section-template and forced-policy machinery covers them.
6. **Demote B and C to views.** Neither survives squashing. B becomes the mobile editor's
   internal outline; C becomes `swimlane export --md` plus an importer, for repositories
   that want a GitHub-readable copy next to the source.
7. **Add D only when free-form flows are requested**, gated so that files which reduce to
   a tree are converted to G on save.
8. **Treat E as an AI and review surface**, not a file format: "Describe the process" → IR →
   G; and IR → prose for the approval view in the SaaS.
