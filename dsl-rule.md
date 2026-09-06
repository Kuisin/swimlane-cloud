# kai-swimlane 2 — DSL specification

This is the specification of the swimlane DSL, version 2. It is the grammar chosen from the
candidates in [dsl-proposals.md](dsl-proposals.md) (grammar A there), where the shared
multilingual model (§1), the squash and format-on-save rule (§2) and the intermediate
representation (grammar F) are motivated; this document states the rules. A complete worked
example lives in [examples/kai-swimlane-2](examples/kai-swimlane-2/README.md).

Version 2 is the only version the reader accepts. Files in the previous syntax are converted
once by `swimlane convert` (see *Converting from v1*). The engine in
`packages/diagram-converter` still implements the previous syntax until the version 2 reader
lands; nothing in this document describes shipped behaviour.

**Goal.** Keep the shape of the current file, remove the three biggest sources of syntax errors
(`;`, `than`, the asymmetric `if … is … than` / `elseif`), and add the roadmap features. Version 2
is the only version the reader accepts: a bare `@kai-swimlane` header is refused with a pointer to
the converter, no legacy spelling is a production of this grammar, and there is no second reader.
**The formatter re-spells what it read and never repairs:** every rule below is stated once, for
one reader. Existing files are converted once, by the standalone converter described under
*Converting from v1*, in a reviewable diff.

## Design invariants

1. **One terminator.** `;` ends a property, a directive and the `/title/` payload; every other
   statement self-delimits, and a `;` written after one is accepted and dropped.
2. **Squash is a token transform.** It removes whitespace outside runs, strings, fences and
   comments, keeping one U+0020 wherever two adjacent tokens would otherwise re-lex differently.
3. **One closed escape table.** `\` before a table character yields that character; `\` before
   anything else is two literal characters.
4. **Minimal quoting.** Every text, value, control-text and path position takes a bare run or a
   quoted string; the formatter quotes only where the bare form would not re-lex to the content.
5. **One comment concept, two spellings.** `// text` expanded, `/* text */` compact; a comment
   attaches to the next statement in the same block.
6. **One id rule.** Unicode, NFC, case-sensitive, no quoted form, never invented by the parser.
7. **One case rule.** Every terminal spelled lowercase folds on input and is emitted lowercase;
   identifiers and content never fold.
8. **Two axes on every diagnostic.** `severity ∈ {error, warning, info}` and `impact ∈ {none,
   format, render}`, monotone, with `impact >= format ⇒ severity == error`.
9. **Attachment is to the preceding statement**, not to the preceding step, and indentation is
   never significant.
10. **Two IRs, two hashes.** The unresolved IR is what the formatter writes; resolving imports and
    picking one string per translatable field yields the resolved IR the renderer reads.

## Example

Canonical output of the formatter, followed by the same file squashed: the two carry an identical
token sequence and re-parse to one IR. The squashed form keeps the `@use` line, which `--keep-use`
selects; the default compact form inlines its closure, and the lanes it names come from it.

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

Eleven of the surviving spaces are separators. Ten are invariant 2's fusion case — the left token
ends in an `idChar` and the right begins with one: `@kai-swimlane 2`, `@use templates/…`, `+RQ
desc:`, `@quote end-if`, `end-if end-phase`, `end-phase fork`, `end-fork section`, `+LG note:`,
`end-section if` and `@done else`. The eleventh is a path's side of the same rule: a bare `=>` path
ends only at structural whitespace, `;`, `]` or another suffix token. Two more are comment padding,
and four are bytes inside a run, `金額が 100 万円` and `保存期間は 7 年`. What looks like a separator and is
not: `loop@quote`, `goto@done`, `@quote+RQ`, `@audit#blue`, `]and(`, `@done@end` and `#gray[sales:`
— `@`, `+`, `#` and `(` cannot continue the word to their left, the four directive names are never
an `@id` suffix, and a colour token ends at the first character outside `[A-Za-z0-9-]`.

## What changed from v1

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

## Lexical rules

**Statement boundaries and words.** The lexer is position-independent: there are no line starts,
only statement boundaries. At a boundary it reads one **maximal word** — the longest run of
`idChar` and `-`, ending at the first character that is neither, so `label：` scans as the word
`label` then a delimiter — and classifies it with one character of lookahead, in this order.

1. The next character is `:`, `：` or `.` → the word is a **property key**; structural whitespace
   between the word and its `:` is skipped and is deleted by the formatter.
2. Otherwise the next character is `;` → the word is a **flag**, `key;` ≡ `key: true;`, if it is a
   boolean key declared for the enclosing statement or section. Where the position declares no
   boolean key — `/meta/`, whose free keys are untyped, is the only one — the word is a malformed
   property, retained verbatim, and never reaches 3.
3. Otherwise the word is looked up **exactly** in the closed keyword table, with no longest-prefix
   matching, so `end-ifx` is one unknown statement.

At `@`-statement position the `@` is followed by one maximal word matched **exactly** against the
four-entry directive table `kai-swimlane`, `use`, `lang`, `end`, so `@endpoint` is one word —
`unknownDirective` at statement position, one `@id` in suffix position, never `@end` then `point`.
Those four names are **never read as a step's `@id` suffix**: there an `@` followed by one of them
ends the suffix run and starts a new statement, so `[sales: 完了] @end` is a step and then the file
marker. Keyword table: `if case else end-if fork and end-fork section end-section branch
end-branch phase end-phase loop goto`; nothing else is a keyword.

**Structural whitespace** is exactly U+0009, U+000A, U+000D, U+0020, U+00A0 and U+3000, outside
runs, fences, strings and comments; inside those all six are content. The last two are included because Japanese input produces them in delimiter position, and the
formatter normalises a structural U+00A0 or U+3000 to U+0020. `\r\n` and
a lone `\r` become `\n` on read; output is always LF, one at the end of the expanded file and none
in the compact form. One leading U+FEFF is skipped before detection and never written.

**Ids.** `id := idChar (idChar | "-" idChar)*`, `idChar` being `XID_Continue` or `_`. A `-`
continues an id only when the next character is an `idChar`, so `@step-1-->` lexes as `@step-1`
then `-->`; `.` is never an id character, so `key.tag` and `id.field` split by construction. Ids
are NFC-normalised and compared **case-sensitively**, and there is no quoted-id form: one that does
not fit is `invalidId`. `use`, `lang`, `end` and `kai-swimlane` are reserved
after `@`; an id that is also a control keyword is legal, a sigil telling the two apart, and
is reported `idIsKeyword`, a warning. Flow-node
ids share one flat per-file namespace, `/role/`, `/block/` and `/prop/` ids three.

**Case.** Every terminal spelled lowercase — keywords, section and directive names, property keys,
palette names, hex digits, shape, arrow-line and `side` values, booleans, and the `#`-form of
`icon:` — folds on input and is emitted lowercase **provided the token validates**; folding runs
after a token is scanned, so it never moves a boundary. Language tags fold and are emitted in
computed BCP 47 canonical case; identifiers and content never fold.

**Escapes.** The table is closed and has fourteen entries, in two groups.

| entries | decoded character |
| --- | --- |
| `\\` `\"` `\;` `\|` `\｜` `\]` `\[` `\)` `\(` `\（` `\）` `\/` | the escaped character itself |
| `\n` `\t` | U+000A and U+0009 — the only entries whose decoded character is not the one written |

It applies in every run, value, control text, path and quoted string and nowhere else, so `desc:
a\nb;` is a two-line value. `\` before anything else is **not** an escape and both characters
survive into the IR, leaving the renderer's decoration escape a later layer: `desc: \*x\*;` stores
`\*x\*` and renders `*x*`. There is no `\s`, edge whitespace being expressed by quoting, and no
`\,`, so a tag holding a comma needs a quoted value, `tags: "a,b", c;`. HTML entities are literal
text everywhere. A value's terminator is never escaped on emission — a value containing `;` is
written quoted — and the formatter escapes in this order and never otherwise:

1. `\` immediately followed by a table character → `\\`, first, exactly once.
2. `]` in step text closing no `[` opened inside the run, and `)` or `）` in control text closing no
   `(` or `（` opened inside it, so a balanced pair is unescaped.
3. In a path, a `;` or a `]`.
4. `|` and `｜` in a translatable position, always, since a separator is never balanced.
5. `"` inside a quoted string.
6. U+000A → `\n`, U+0009 → `\t`, inline spelling only.
7. In comment context and the compact spelling only, `\` → `\\`, and a `/` preceded by a `*`.
8. In fence context the escape set is **empty**: rules 1 to 6 do not run, a fenced value being
   written byte for byte.

**Runs, strings and fences.** Every text, value, control-text and path position, and the `/i18n/`
entry key, holds a bare **run** or a quoted string; a property value and an `/i18n/` entry value
additionally hold a fence. One scanning procedure decides which, its steps in this order.

1. **Fence, first, in a property or entry value only.** When the value's first non-whitespace
   content is three backticks **and that opener is the last non-whitespace content of its line**,
   the value is a fence; steps 2 to 5 do not run and a fenced value is one segment. An opener not
   last on its line is ordinary content, so `desc: ```code```;` is an ordinary value, and where
   such a value reaches step 6's bound with no `;`, `fenceOpenerNotAlone` names the likely intent.
2. **Skip structural whitespace and try a string.** If the next character is `"`, read a quoted
   string — escapes honoured, a raw LF or CR ending the attempt in failure — and accept it only if
   its closing `"` is followed by a member of the position's terminator or separator set; otherwise
   **backtrack** and read the segment bare. The `/i18n/` entry key, having no bare alternative, is
   the one position that does not backtrack.
3. **Otherwise scan bare to the first unescaped terminator.** The terminator set is `;` for a
   property value, a directive operand and the `/title/` payload; `]` for step text; `)` or `）` for
   control text; `;`, `]`, structural whitespace or the first character of another suffix token for
   a `=>` path; `.` for a quoted `/i18n/` entry key. The scan is quote-aware — a `"` whose string
   closes on the same physical line suppresses terminator, separator and depth recognition between
   the two quotes, so `desc: "a;b" のこと;` is one value — while outside such a pair a `"` is plain
   content shielding nothing. Depth is counted only for `[` `]` in step text and `(` `)` or `（` `）`
   in control text, from 1, each ignoring the other.
4. **Trim** structural whitespace from both edges of a bare run; interior whitespace
   is content, byte for byte.
5. **Cut segments.** In a translatable position the extent is cut at every unescaped `|` and `｜`
   outside a shielding quoted segment, and steps 2 to 4 then run once per segment; the same
   shielded split cuts a typed list at `,`. Everywhere else the extent is one segment.
6. **Recovery bound.** A run whose terminator never appears also ends, with the position's own
   diagnostic, at the first token of the sync set published under *Squash and the formatter*
   occurring at depth 0 outside a string and a fence; an unclosed fence or `/* */` takes that bound
   too.

A fence is a **raw** context — no escape, comment, marker, separator or normalisation is recognised
inside it — and the only carrier of a raw newline. It ends at a line whose trimmed content is three
backticks with an optional `;`; both are legal input and the formatter writes the one carrying the
`;`. A value one of whose own lines has that shape has **no** fence spelling and falls to the
inline spelling with `\n`, where rules 1 to 6 do apply. The stored value is the body dedented by
`min(N, own indent)` for an opener indent `N`, with no further trimming. `--compact` never emits a
fence.

**Comments.** A comment's text never contains a newline. `// text` is recognised at a statement
boundary **preceded, on that physical line, only by structural whitespace**; it runs to the next
LF, and a `//` following a token on the same physical line is an error. `/* text */` is legal at
any statement boundary, does not nest, and ends at the first unescaped `*/`; a multi-line one
splits at parse into one node per line. `//` and `/*` inside a run, value, path or fence are
content. Comment text is the delimited content trimmed at both edges, and both emitters write one
U+0020 between delimiter and text. Three asterisks are decoration wherever they appear and never a
comment.

**Full-width punctuation.** Exactly four characters are accepted, and only in delimiter position:
`（` `）` where a paren is expected, `：` where the `:` of `[roleId:` or `key:` is expected, and `｜`
where a segment separator is expected; the kind is fixed at the opening character, so `（…)` is an
error. `；` is **never** a terminator in any position, and `「」｛｝［］` have no delimiter role at all.
Inside any run, value, string, fence, id, path or comment every full-width character is content and
is never rewritten; a full-width delimiter is emitted ASCII, and that rewrite is reported.

**Colours and icons.** An `icon:` value takes one of three forms: `#name`, a Lucide glyph;
`@id`, an image imported with `@use`; or any other run, shown literally, which is how an emoji or
a single character becomes an icon. `#` is a sigil in exactly three positions: after a control keyword or its
`(…)` run, as the first character of a `-color` value, and as the first character of an `icon:`
value; everywhere else it is content. `colorToken := "#" [A-Za-z0-9-]+`, `iconToken` likewise,
maximal munch. A colour is valid iff its body is a palette name or a hex of exactly 3, 4, 6 or 8
digits, `black blue gray green orange pink purple red teal yellow`, with `grey → gray`. An icon is valid iff its body
is in the closed Lucide enum. A **valid** token is folded and emitted lowercase; an **invalid** one
is a warning with a documented fallback, retained verbatim, case included.

## File and sections

**Header and version.** The header is a statement, not a line: `HEADER := "@kai-swimlane" ([ \t]+
VERSION)?` with `VERSION := [0-9]+ ("." [0-9]+)?`, ended by a statement boundary. Major 2 → this
grammar, advisory minor recorded and dropped on format. Version absent or major 1 is a version 1
file and major ≥ 3 a newer one; both are `unsupportedVersion`, the source returned unmodified with
an empty flow, the first naming the converter. `@kai-swimlane v2` is
`malformedHeader`, `v2` being no `VERSION`, and so is `@kai-swimlane2`, whose statement does not
end at a boundary. Detection is one ordered procedure: strip one U+FEFF, split on `\n` stripping
one trailing `\r`, and take as **probe line** the first line non-empty once trimmed. (1) `HEADER`
matches as a **prefix** of it → dispatch and stop; (2) the probe line begins with `@kai-swimlane`
but does not match → `malformedHeader` and stop; (3) otherwise scan for the first line whose
trimmed content begins with `HEADER` → dispatch on it and report `textOutsideDiagram`; (4)
otherwise `headerMissing`, the sole code licensing starter-template initialisation. A file holds
one diagram, so a header inside a run, string, fence or comment is content.

**A header-less region is version 2.** A Markdown fence, a template fragment or an API body that
omits the header is read by this grammar; an explicit header inside the region wins, and a bare
`@kai-swimlane` there is `unsupportedVersion` like anywhere else. The *Fragments* rule under
*Imports* chooses a reader **shape** only. A `kai-swimlane-parts` fence is the same mechanism,
narrower: a header-less fragment whose only legal sections are `/block/` and `/prop/`.

**Directives.** `@lang tag (, tag)*;` and `@use path;` are legal **only in the prologue**: after
the header, before the first section marker, at most one `@lang`. Anywhere else is
`misplacedDirective`, an error that blocks nothing so that the hoist stays reachable: the directive
is still *applied*, with prologue semantics, and format-on-save hoists it to the **end** of the
existing `@use` run, never before it. An `@word` that is none of the four directive names and is
not a step's `@id` suffix is `unknownDirective`, a **warning**, retained verbatim and re-emitted at
its position.

**Sections.** The set is closed: `meta title page option role block prop line i18n`. A `/word/`
marker always **closes the current section**, known or not, at any position. A marker naming a
section already opened **reopens it and appends**, the bodies becoming one section the formatter
writes merged, once. Canonical order is `/meta/ /title/ /page/ /option/ /role/ /block/ /prop/
/line/ /i18n/`; a section header is emitted iff it serialised at least one non-blank line, except
`/title/` and `/line/`, always emitted. A `[…]` at a statement boundary in another section is
`flowRowOutsideLine`, and a `/line/` with zero rows is legal, rendering chrome, lanes and gutters
with an empty flow.

**`/title/`.** `/title/` is a `;`-terminated statement like every other payload: a newline inside
it is structural whitespace, and a payload that reaches the next section marker, a directive,
`@end` or EOF without its `;` is `unterminatedTitle`. An empty payload is legal.

**Definitions.** `def := "<" id ">" property*`, with no newline anywhere in the production: a
definition ends at the next `<` at a statement boundary, the next section marker, the next
directive, or EOF. The formatter always writes the expanded form — `<id>` alone on its line,
properties two spaces beneath it in the fixed key order, with **no column alignment**.

**Properties and values.** `property := kv | flag | unsetKv`; `kv := key ("." tag)? colon value
";"`; `flag := key ";"`, legal for any boolean key and meaning `key: true;`. A key is `("x-")?
[A-Za-z][A-Za-z0-9-]*` and may never contain `.`, nor may a language tag, so a dotted key holds at
most one dot and splits by construction: `unset` is reserved in every section, so `unset:` is
always the clearing form of *Imports*, and `remark-desc.zh-Hant` can only be `remark-desc` +
`zh-Hant`. Three values are special: `key:;` is an **error**; `key: "";` is an explicitly empty
string, present in the IR and re-emitted; and `key: none;` — the bare keyword, matched as a whole
token — **clears** the key, including one inherited through `@use`, and is emitted even when
nothing is inherited. Quoted `"none"` is the literal string. **Booleans** are `true` and
`false`; any other value is `badValue` and leaves the previously parsed value in place. Within one property block a key may appear at most
once — aliases count as one key (`hint ≡ title`), a suffix counts as its property key, and `.lang`
is part of key identity, so `label:` and `label.en:` may coexist. The accumulating spellings are
the only exceptions: `+prop`, and `remark-desc:`, which appends to `remark` with one blank line
between paragraphs, may repeat, is never emitted, and must follow its block's `remark:`. **A key
legal on two candidates at once** — one in the key set of *both* the immediately preceding control
statement and the nearest preceding step, such as `note:` under a `case` — attaches to the control
statement, as invariant 9 says; there is no other candidate. `desc:` under an `if` lands on the
`if`, while `desc:` under a `case` is `keyNotAllowedHere`.

**Per-statement key sets** are closed, and `keyNotAllowedHere` lists the allowed set verbatim from
this table.

| statement | suffixes | keys |
| --- | --- | --- |
| step | `<block> @id +prop* glyph => path` | `label desc remark remark-desc note note-side skip` |
| `if` | `[lane] @id #color` | `question` *(the parenthesised run)*, `lane`, `desc`, `note`, `note-side` |
| `case` / `and` / `fork` | `@id #color` | `label` *(the parenthesised run; on `fork` it names path 1)*, `note`, `note-side` |
| `else` | `@id #color` | `note`, `note-side` — `else` carries no parenthesised run |
| `section` / `branch` / `phase` | `@id #color` | `name` *(the parenthesised run)*, `desc`, `note`, `note-side`; with no name the display name is the translatable constant `Section` / `Branch` / `Phase` |
| closers, `loop`, `goto`, `[]`, markers | — | **none** |

**Canonical key and entry order** is published per node type. `x-*` and unknown keys come last
within their node by code point; a `.lang` variant follows its base key; `unset:` is last in every
body that carries it.

| node type | order |
| --- | --- |
| prologue | `@lang` first (one line, tags `, `-joined, declared order), then every `@use` in **source order**, which the formatter never reorders because sibling order decides merge precedence |
| `/meta/` | `owner, status, tags, version, updated`, then every other key by code point |
| `/page/`, `/option/` | `description` and the six header/footer slots; the display booleans, then `show-notes, auto-define, branch-color-arrows, i18n-strict, i18n-uniform-layout, i18n-storage, lang, lane-order`; then the four gutter titles |
| `/role/`, `/block/`, `/prop/` | `label, text-color, background-color, icon`; `label, background-color, text-color, border-color, shape, icon`; `label, side, background-color, border-color, text-color, title, max-chars` |
| step | `label, desc, remark, note, note-side, skip` |
| control statements | `desc, note, note-side` on `if`, `section`, `branch` and `phase`; `note, note-side` on `case`, `and`, `fork` and `else` |
| `/i18n/` | id-keyed subjects first, in the first-appearance order of the node they address in `/line/`; then quoted-source subjects by `keyForm` code point; within a subject, fields in the owning node's key order and languages in `@lang` order |

`/option/` is a typed table. Booleans defaulting `true`, the seven display flags `show-left-gutter
show-right-gutter show-header show-footer show-description show-step-block-captions
merge-at-previous-block`, plus `show-notes` and `auto-define`; defaulting `false`:
`branch-color-arrows`, `i18n-strict`, `i18n-uniform-layout`. `i18n-storage` is the enum
`as-written | catalog | inline`, default `as-written`; `lang` is a tag declared by `@lang`;
`lane-order` is a list of role ids; `left-title left-subtitle right-title right-subtitle` are
translatable text defaulting `Procedure` / `Description` / `Remark` / `""`, readable from `/page/`
too, `/option/` winning when both carry one. `/meta/` has five reserved typed keys — `owner` (one
string, a comma being a character), `status` (`draft | review | approved | deprecated`), `tags` (a
list), `version` (text) and `updated` (`YYYY-MM-DD`) — and every other key, `x-*` included, is one
opaque string, never split, typed, flagged or translated. `/meta/` is never rendered and is in
`sourceHash` and out of `renderHash`.

## Steps

```
step   := "[" roleId colon text "]" suffix* property*
suffix := "<" blockId ">" | "@" id | "+" propId | glyph | "=>" suffixPath
```

Each slot occurs at most once except `+prop`. The **reader accepts any order**, each slot having a
unique first token, and the **formatter writes** `[role: text] <block> @id +prop* glyph => path`. A
suffix after a property row is an error, as is a repeated slot; `+prop` ids keep source order. The
suffix run ends at the first token that opens none of the five slots.

`suffixPath` is its own production and is not the `@use` path. A bare suffix path ends at the first
structural whitespace, `;`, `]`, or first character of another suffix token, so one containing a
space must be quoted, `=> "./a b.swim"`, and one truncated at its own `;` or `]` is
`unbalancedBracket`; an `@use` operand ends at `;` alone. The seven ordered `@use` value checks
under *Imports* apply **unchanged** to a `=>` path.

Inside `[` … `]` the text run ends at the first unescaped ASCII `]` closing no unescaped ASCII `[`
opened inside the run, depth counting from 1, and `［］` never affect depth. The `roleId` is the run
up to the first `:` or `：`, further colons being text, and a step head takes no `;`.

`label:` and the bracket text are **two render slots, not one**: the bracket text is the step
box's own text, `label:` names the step's **left-gutter caption**, and they are separate IR fields,
`text` and `label`. `+prop` **accumulates** in source order, duplicates dropped keeping the first;
`@id` and the glyph are single-valued, a second one being `badSuffix`.

Two step spellings look alike and are not: `[]` is a **spacer** — no lane, no text, one row, never
numbered, no id, no properties — while `[sales:]`, and
identically `[sales: ]`, is an empty step that renders an empty box *and is numbered*. A step's
gutter number is its 1-based position among flow steps that name a lane and do not carry `skip`, in
document order.

`=> path` is a **link, not a call**: it sets `link`, defaults the shape to the `<block>`'s `shape:`
and otherwise to `subroutine`, and leaves control flow untouched — one inbound edge, one outgoing
edge, flow continuing to the next row, the callee never inlined and its ids never shared. `shape:`
stays a `/block/` key with one published enum — `rect · rounded · hex · ellipse · cloud · note ·
subroutine · arrow-down`.

## Control flow

A **row** is one flow item, and `rowIndex` is its position in the flattened `/line/` row list.
**Every opener and every closer occupies a position in that list**, so `rowIndex` is total over the
rows a jump can name or sit between. A **control frame** — an `if` case, a `fork` path, a `branch`
— opens a flow scope; a **layout frame** — `section`, `phase` — opens a body but no scope and is
transparent to every flow rule, so it never appears in `scopePath`, a row's chain of flow scopes
from the root. A body **terminates** when its last row is a jump, or an `if` or `fork` all of whose
bodies terminate. Every opener takes an optional id in the slot order `keyword [lane]? (text)?
@id? #color?`, `@id` and `#color` read in either order; the parenthesised run is optional on every
opener but `if`, and an opener without one takes the display constant named in *Per-statement key
sets*. `if`, `fork`, `section` and `phase` ids are jump targets; `case`, `else`, `and` and `branch`
ids exist only for translation overrides and GUI and diff stability.

### `if` / `case` / `else`

`if` takes an optional lane, written `[roleId]` immediately after the keyword; it is an ordinary
role reference populating the IR's `if.lane`, and when it is omitted the renderer keeps today's
derived placement and the formatter never materialises one. A bracket run containing an unescaped
`:` is a step head and one without is a lane reference, and an opener's bracket always follows a
keyword. Between the `if` opener and its first `case` only comments and the `if`'s own property
block may appear. An `if` has one or more `case` rows; `else` is optional, occurs at most once and
must be last; a `case` requires a non-empty label, because `else` *is* the unlabelled case; an
empty case **body** is legal and renders as a bare edge to the join.

### `loop` and `goto`

Bare `loop` is a back-edge to the question of the **nearest enclosing `if`**, searched outward
through *every* frame kind, and `unknownId` where there is none. `loop @id` names a node. The two
are different constructs and no tool converts one into the other, so a bare `loop` never gains a
generated id on save. A jump target always carries the `@` sigil, at the declaration and at every
reference. `goto` and `loop` are ordinary rows, legal in **every** body and taking no suffixes and
no properties. Two static clauses govern a jump `G` and the row `T` defining its target.

- **Containment.** `scopePath(T)` must be a prefix of `scopePath(G)`. A target inside a case, fork
  path or branch body that does not contain the jump is an **error**, whatever the row index.
- **Direction.** `rowIndex(T) > rowIndex(G)` for `goto`, `<` for `loop` — an integer comparison,
  not graph reachability. It is a **warning**.

A step target is that step; an `if` or `fork` target is its gateway row. A `section` or `phase`
target is the **first row of its body that can receive an inbound edge**, decided by one closed
scan from the first row of the body: a step, a spacer or an `if` or `fork` gateway is the landing
row and stops the scan; a `section` or `phase` opener is descended into, resuming after its closer
if that body has no landing row; a `branch` opener is skipped whole, closer included; a jump, a
comment or a property row is skipped; and reaching the frame's own closer is `unknownId`, an error.
A `case`, `else`, `and` or `branch` id is not a target at all. A jump contributes exactly one edge,
so its body terminates there, and anything not reachable from the flow entry is `unreachableRow`,
computed in one worklist pass.

### `fork` / `and`

`fork` takes the same optional label as `and`, naming path 1 exactly as `and (出荷)` names path 2;
there is no name for the block as a whole, and the rows immediately after `fork` are path 1. **The
split gateway is always drawn**, one out-edge per path; **the join is drawn iff at least one path
reaches it**, with arity equal to the number that do; if none does, the whole `fork` terminates its
enclosing body. A single-path `fork` is legal and keeps both gateways, and an empty `and` renders
as a bare edge.

### `section`, `branch` and `phase`

`section` changes nothing about the flow; it draws a dotted box, and being a layout frame it is
transparent to jump containment.

A `branch` head receives no inbound edge, and its tail merges into the first of the following,
searched forward from the closer **in the same flow scope**: a step → that step; an `if` or `fork`
opener → its gateway; a `section` or `phase` opener → continue inside it; another `branch` → skip
the whole block; a jump → that row's target; the scope's closer → that scope's join. The scan
**stops at the enclosing flow scope's closer**, so a branch at the end of a case merges into the
`end-if` join rather than escaping past it. A branch body that terminates in a jump contributes no
merge edge; if the search reaches the end of the root body the tail is drawn as a terminal, and a
branch that is the first flow row of its scope draws a start terminal, both warnings; and `@end` is
a file marker, never a merge target. A `branch` may not appear anywhere inside another `branch` —
the test is a predicate over the whole open-frame stack — while `if`, `fork` and `section` may
appear inside one.

A **phase** is a horizontal band with its label in the left gutter. `phase` and `end-phase` must
sit in the same body, and a phase may contain complete `if`, `fork`, `section` and `branch` blocks.
A phase may open only where its flow scope is the **root body**, which makes one inside a
root-level `section` legal, one inside a `section` nested in a case illegal, and — since a phase is
open at every row of its own body — one phase inside another illegal. A phase is a layout region
over a row range, not a scope: jumps cross bands freely, a back-edge into an earlier band does not
reopen it, and a band whose rows are all skipped is still drawn at full height.

### Frames, closers and arrows

`if`, `fork`, `section`, `branch` and `phase` push onto **one** block stack. A closer must name the
kind of the innermost open frame; any other closer is `closerMismatch`, an **error**, and the frame
is closed anyway so nothing cascades. `case`, `else` and `and` do not push: they close the current
alternative and open the next inside the top frame, and are errors when that frame is not an `if`,
or not a `fork`. Every closer is spelled `"end-" + openerKeyword` and nothing else closes a frame.

The trailing glyph sets `step.arrow` and styles that step's **single outgoing edge**, whatever it
connects to — the next row, a following gateway, the entry row of a following frame, the enclosing
join when the step is last in its case or path, the merge edge when it is last in a branch body, or
the jump edge when the next row is a jump. Glyphs lex longest-match: `->` solid, `~>` dashed, `..>`
dotted, `-.>` dash-dot, `-->` long-dash. The glyph is the only spelling of the arrow style, and solid is emitted as **no glyph at all**.

## Imports (`@use`)

`@use` imports one of two things, decided by the target's extension: an **image**, bound to an id
and drawn as an icon, or a **fragment**, whose definition sections merge into this file. The image
extensions are the closed set `svg png jpg jpeg gif webp avif`; every other extension is a
fragment. Both forms take the same paths and the same checks.

### Images

```
@use assets/kai-mark.svg;
@use assets/warehouse-badge.png as badge;
```

An image import binds an **asset id**: the file's stem by default — `kai-mark.svg` gives
`kai-mark` — or the name after `as`, which is how two folders holding one file name stop
colliding. Two imports resolving to one id is `duplicateAsset`, not a silent winner. `as` on a
fragment import is an error, since a fragment has no name to bind.

`icon: @<id>;` uses an asset wherever `icon:` is legal, so a lane and a step block can carry a
company mark instead of a Lucide glyph:

```
/role/
<brand>
  label: ブランド | Brand;
  icon: @kai-mark;

/block/
<marked>
  shape: rounded;
  icon: @kai-mark;
```

Four rules govern how an asset reaches the page.

- **The reference is what the file stores.** `icon:` holds `@kai-mark`, never the image, so a save
  writes back the reference it read and a diagram stays as small as its text.
- **The renderer embeds, it does not link.** The image is emitted as an `<image>` element carrying
  a `data:` URI, so an exported SVG is self-contained: it renders with no network access, from a
  share page or a private repository alike, and its content hash covers the image.
- **Markup is never inlined.** An imported drawing is drawn *as an image*, never spliced into the
  document as SVG elements, so a script, an event handler or an external reference inside a file
  someone committed cannot execute in the page that displays the diagram.
- **Size is capped:** 2 MiB for one image and 8 MiB across a diagram, counted over the decoded
  bytes. Past either, the import is an error rather than a page nobody can load.

An image the host cannot supply is a warning, `assetNotFound`, and the icon is omitted: a missing
picture never costs a rendered diagram. A reference to an id nothing imported is `unknownAsset`,
also a warning, and draws nothing — `@kai-mark` is a reference, so there is no glyph to fall back
on.

**Resolution is the host's.** The parser never reads a file: it validates the path, then asks the
host through `resolveAsset(path)`, which returns a base64 `data:` URI or null. A value that is not
one is an error, so a host cannot smuggle a remote URL into a diagram that is supposed to be
self-contained. Because parsing is synchronous and reading a repository is not, a host prefetches
with `scanImports(text, filename)`, which lists every `@use` target and whether it is an image,
without parsing the file.

### Fragments

`@use` is recursive and prologue-only. Resolution is two passes: a depth-first pre-order closure
with dedup at first visit, then a merge in **post-order of that spanning tree** — each file after
all of its imports, siblings in written order, later application overriding earlier. Granularity is
`(section, definition-id, key)`, `(section, key)` for `/page/` and `/option/`, and `(entry-key,
language)` for `/i18n/`. Exactly six sections merge: `/page/ /option/ /role/ /block/ /prop/
/i18n/`. `/meta/`, `/title/` and `/line/` never do — so **an import can never add a step, and
therefore never introduce a lane by reference** — and an imported `/meta/` is dropped with an info.

`unset: key (, key)*;` names **imported provenance** and is writable in every one of the six, at
the granularity that section merges at: a section key at the top of `/page/` or `/option/`, a key
of a definition inside it, an entry key at the top of `/i18n/`, where `unset: "監査ログ保存".en;` clears
one `(entry-key, language)` pair and `unset: "監査ログ保存";` every language of that subject. It is
applied **when the frame containing it is merged**, clearing every key it names that is present at
that point and was not written by that frame. A local `none` and an `unset:` naming one key in one
block are one fact written twice: the formatter emits the `unset:` and drops the `none`. A local
*assignment* and an `unset:` naming one key are two nodes writing one key, `duplicateKey`. An
`/i18n/` `unset:` key must be a quoted source string, an `unset:` in a section that does not merge
is `keyNotAllowedHere`, and removing a whole definition is not provided.

**Paths.** `./` and `../` resolve against the directory of the importing file at every level;
everything else against the **repository root**, the folder holding `.swimlane.json`. Resolution is
**lexical** — `.` segments and every `x/..` pair collapse textually, never through the filesystem —
and the resolver performs exactly one lookup: no probing, no index, no case-insensitive retry. The
extension is **not semantic**, the reader being chosen by the file's first line, so the `.swim`
written here and the `.txt` the product stores behave identically; a path must nevertheless carry
one. Value checks run in this fixed order **before any I/O**, the first failure being the only
diagnostic: empty → `emptyImportPath`; contains `:` → `importColon`; contains `\` →
`importBackslash`; begins with `/` → `absoluteImportPath`; normalises to a leading `..` →
`importEscapesRoot`; first segment `.git` or `.github` → `forbiddenImportPath`; last segment has no
extension → `missingExtension`. On filesystem hosts the resolver realpaths the target and re-checks
containment, and **every import diagnostic quotes the path and nothing else**, never a byte of the
imported file.

**Fragments.** An imported file may omit the header and `@end`. Its **reader shape** is chosen by
the probe line of *Header and version* applied to the fragment, and chooses a shape only: an
explicit header selects a **document** and supplies its version; `@lang` or `@use` selects a
**fragment with a prologue**; a section marker selects a **fragment**; anything else is
`notAFragment`. In every header-less case the version is the one the extractor supplied, and a
marker-less mirrored template is fixed by prepending its marker, never by inferring it.

**Caps, provenance and failures.** Depth ≤ 8, closure ≤ 32 files, closure ≤ 1 MiB, all errors.
Re-entering a path on the resolution stack is `importCycle` and the offending edge alone is
dropped; re-entering one in the memo is the ordinary first-visit dedup. **The parser never
resolves**: it records the file's import list and returns, the host supplies the resolver, and a
host with no filesystem reports `importsUnsupportedHere`, an **info**. **Format never inlines**:
`format` accepts only the unresolved IR and emits only `local`-provenance content. Every key
carries its **provenance** — `local`, or the canonical path of the `@use` it arrived through — and
forced-template validation is a provenance test over the closure: the pinned path must be
reachable, no pointer it sets may be shadowed by a local key, a later import or an `unset:`, and
additions outside it must satisfy the policy. A pin reached through an intermediate bundle complies
unless the policy sets `direct: true`; a bundle that shadows a pinned key fails; and a
byte-identical re-declaration of a pinned key is still an override.

**Lane order.** A lane's position is where its id is first introduced in the merge sequence:
imported roles in merge order, then local `/role/` declarations in source order, then roles first
seen in `/line/`. A local definition overriding an imported role keeps its imported position, and a
lane is **drawn** iff a step references it, it is declared locally, or `/option/ lane-order:` names
it.

## Multiple languages

```
@kai-swimlane 2
@lang ja, en;
@use templates/i18n/glossary.swim;

/title/
受注処理;

/line/
[sales: 見積作成 | Create quote] @quote
  desc: 顧客要件を確認して見積を作成;
  desc.en: Check the customer requirements and draft the quote;
  remark: 金額が 100 万円超なら本部承認;
if (承認する？ | Approve?)
case (はい | Yes) #green
  [system: 監査ログ保存]
end-if

/i18n/
quote.remark.en: "Head-office approval above ¥1M; ask sales-ops";

"監査ログ保存".en: Store audit log;
```

`@lang` declares the languages and the first is the source; `/option/ lang:` picks the default
render language, and `i18n-uniform-layout: true` measures geometry against every declared language
rather than the rendered one. **An inline `|` segment and a `field.lang:` line write the same IR
slot**, so they are two spellings of one value: supplying both for one `(node, field, language)` is
`duplicateKey` and `key.<source-tag>:` is exactly the bare key. Resolution of `(node, field,
language)` is strict first-match-wins over four levels: the node-local value → `/i18n/
id.field.tag` → `/i18n/ "source".tag` → the source language, recording a missing translation.

`|` and `｜` are separators **unconditionally in every translatable position of every v2 file**:
there is no "two or more languages declared" mode. A literal bar is `\|` or `\｜`, and with one
declared language an unescaped bar in a translatable position is an error; a file with no `@lang`
declares one unnamed source language, every `.lang` suffix in it is an error, and `/i18n/` has no
legal tag there. Everywhere else — `icon:`, a path, `tags:`, an `/i18n/` value — a bar is ordinary
content.

The translatable set is closed: `/title/` the title; `/page/` `description`, the six header and
footer slots and the four gutter titles; `/option/` the four gutter titles **only**; `/role/`
`label`; `/block/` `label`; `/prop/` `label` and `title`; a step's bracket text and its `label`,
`desc`, `remark`, `remark-desc` and `note`; `if` `question`, `case`, `and` and `fork` `label`,
`section`, `branch` and `phase` `name`; `/meta/` **none**, `tags` included. Every other key is a
token value and a `.lang` suffix on it is an error. For `K` segments and `M` declared languages,
`K > M` is an error; `K < M` leaves the remaining languages with no value *at this level*, falling
through the chain, as does an empty segment at any position > 1; an empty **first** segment is an
error.

`/i18n/` entries are ordinary properties with a structured key, `subject[.field].tag: value;`,
split at the **last** `.` — unambiguous because neither ids nor tags contain `.`. A key beginning
with `"` is a quoted source string; `id.field` addresses a flow node, and `field` is the **IR field
name**, not the DSL key that writes it: a step's left-gutter caption is `label` and its box text is
`text`; an `if`'s question is `question`; a `case`'s or `and`'s label is `label`; a `section`'s,
`branch`'s or `phase`'s name is `name`; every other translatable field's IR name is its key. Both
sides of a lookup are reduced to `keyForm` — edge-trimmed and NFC — and compared byte-exactly: no
case, width, kana or punctuation folding and no markup stripping. Only quoted-source entries are
importable; `id.field` entries are file-local, one in a file with no `/line/` is an error, and the
tag must be declared, the source language never being an `/i18n/` tag. Because the two spellings
write one slot the formatter normalises: fence-capable fields — `desc`, `remark`, `note`, `/page/
description` — are written as `key:` plus `key.lang:` lines, and every other span as inline
segments. Where the *value* lives is set in the file, `/option/ i18n-storage: as-written |
catalog | inline;`, so `format(parse(x))` stays a pure function of the IR, and hoisting runs only
when it changes no rendered string.

## Squash and the formatter

**What the formatter emits.** Two spaces per open frame; openers, separators and closers at frame
depth, bodies one deeper; a statement's properties one level deeper than the statement. Blank lines
are a total function of `(node kind, depth)` with no lookahead: exactly one before a section marker
that is not the start of the file, one between the prologue and the first marker, one between two
definitions in `/role/ /block/ /prop/` and between two subjects in `/i18n/`, one between two
depth-0 statements inside `/line/`, and one before a trailing `@end` where the source had one. The
unit either side of such a line is the same in every section: a step or definition with its
property block, a complete block from opener to closer, a jump, or a comment group, and a blank
line always **precedes** the comments attached to the unit that follows it. Never anywhere else:
never after a marker or an opener, never before a closer, never inside a property block or a fence,
never at depth > 0, never twice in a row.

**Identities.** `format(format(x)) == format(x)`; `compact(compact(x)) == compact(x)`; `parse(x) ≡
parse(format(x))`; `parse(compact(x))` is `parse(x)` with the import closure inlined;
`format(parse(compact(x))) == format(x)` **under `--keep-use` only**, the default compact form
inlining that closure and so changing which constructs the file contains; `renderHash(x) ==
renderHash(compact(x))`.

**Comments live in the IR.** Every node carries an optional ordered list of leading comments and
every block body, section and the file carries trailing comments, storing text without delimiters.
Attachment is one buffer-and-flush rule: a comment joins the buffer of the body it appears in, and
the buffer drains either into the next statement pushed into that same body or, when the body ends
— at its closer *or* at a sibling `case`, `else` or `and` — into that body's trailing comments.

**Ids are never invented.** A node's id is set only by an explicit `@id` in the source or by the
explicit, idempotent `assignIds` transform, whose callers are the GUI immediately before its first
structural mutation of a node, the id command, and a pre-format pass under a project setting that
defaults to "referenced". The formatter writes `@id` iff the node's id is set and the referenced
set that keeps an id alive is `{goto targets} ∪ {loop targets} ∪ {/i18n/ id
keys} ∪ {per-node field.lang lines} ∪ {ids present in the source}`.

**Error positions are offsets, not lines.** Every node carries a span, a node path and the path of
its nearest flow-node ancestor-or-self; line and column are derived for display and no component
may branch on them. The GUI lock is a **path-prefix test**: a node is locked iff some
format-blocking diagnostic owns a path equal to, or a segment-aligned prefix of, the node's path. A
host that loads text whose parse has no format-blocking diagnostic and whose canonical form differs
MUST display the canonical form.

**Parse never aborts.** Every input, the empty string included, returns a complete IR plus a
diagnostic list; the two size caps, 1 MiB and 10 000 nodes, stop the read (`limitExceeded`) and still
return what was built. The sync set is fixed: `[`; a section marker; `@use` / `@lang` / `@end` / `@kai-swimlane`;
`<id>` in a definition section; any control keyword at a token start; `;`; a `//`
that opens a comment; `/*`; EOF. **There is no newline in it**. On an unexpected token the parser
emits exactly one diagnostic, skips to the next sync token, and appends an `error` node holding the
raw span from the failing statement to the innermost open container. `serialize` is **total**:
error nodes re-emit their raw span verbatim.

**Two producers, no third case.** A producer of raw bytes — text mode, an editor buffer, a paste —
writes the input back byte for byte, flagged unformatted, when any format-blocking diagnostic is
present, and the canonical form otherwise; a producer that mutates the IR always writes the
serialization of the mutated parse. `--compact` emits the squashed form from the IR, with comments
spelled `/* */`, no fence — a multi-line value becoming a quoted string with `\n` — and the `@use`
closure **inlined** by default; `--keep-use` opts out.

**Two hashes.** `sourceHash` is over the canonical text and covers comments, `/meta/`, `@use` as
written and every id present. `renderHash` is over the canonical JSON of the *resolved* IR with
unreferenced ids stripped, plus the engine version and theme key, and excludes `/meta/`, comments,
imports and spans.

## Grammar sketch

```
file         := bom? header prologue section* end?
header       := "@kai-swimlane" ([ \t]+ version)?    -- a statement, not a line; prefix-matched
version      := [0-9]+ ("." [0-9]+)?                 end := "@end"
prologue     := (directive | comment)*               -- at most one "@lang"
directive    := "@lang" tag ("," tag)* ";" | "@use" path ("as" id)? ";"

section      := "/meta/" property*  | "/title/" text ";" | "/page/"   property*
              | "/option/" property* | "/role/"  def*    | "/block/"  def*
              | "/prop/"  def*       | "/line/"  row*    | "/i18n/"   (entry | unsetKv)*

def          := "<" id ">" property*                 -- no NEWLINE in this production
property     := kv | flag | unsetKv                  field := id -- an IR field name, not a key
kv           := key ("." tag)? colon value ";"       flag  := key ";" -- bool keys; == key: true;
unsetKv      := "unset" colon entryKey ("," entryKey)* ";"
entry        := (string | id ("." field)?) "." tag colon value ";"
entryKey     := key | string ("." tag)?              -- an /i18n/ unset: key is a quoted string

row          := statement | property | comment | errorNode
              -- a bare property row attaches to the preceding statement (invariant 9); one after
              -- a closer, a jump, a spacer or a marker is `keyNotAllowedHere`
statement    := (step | spacer | jump) property* | block
step         := "[" id colon text "]" suffix*        spacer := "[" "]"
suffix       := "<" id ">" | "@" id | "+" id | glyph | "=>" suffixPath
suffixPath   := string | bare(";" | "]" | WS | suffixStart)
suffixStart  := "<" | "@" | "+" | glyph
glyph        := "->" | "~>" | "..>" | "-.>" | "-->"  -- longest match; "->" is never emitted

block        := ifBlock | forkBlock | sectionBlock | branchBlock | phaseBlock
ifBlock      := ifOpen comment* caseClause+ elseClause? "end-if"
ifOpen       := "if" lane? lparen text rparen idSlot? color? property*
caseClause   := "case" lparen text rparen idSlot? color? property* row*
elseClause   := "else" idSlot? color? property* row*
forkBlock    := forkOpen row* andClause* "end-fork"
forkOpen     := "fork" (lparen text rparen)? idSlot? color? property*
andClause    := "and" (lparen text rparen)? idSlot? color? property* row*
sectionBlock := "section" (lparen text rparen)?
                idSlot? color? property* row* groupClose
branchBlock  := "branch" (lparen text rparen)? idSlot? color? property* row* groupClose
phaseBlock   := "phase" (lparen text rparen)? idSlot? color? property* row* groupClose
groupClose   := "end-section" | "end-branch" | "end-phase"   -- must match the opener: constraint 3
jump         := "goto" "@" id | "loop" ("@" id)?
lane         := "[" id "]"                           idSlot := "@" id
color        := "#" (paletteName | hex)              -- hex is 3, 4, 6 or 8 digits

text         := seg (SEP seg)*                       -- segments only in a translatable position
seg          := (escape | passthrough | plain)*
value        := "none" | string | fence | bare(";")  -- in a translatable position the bare form
                                                     -- is `text`: same extent, cut at SEP
path         := string | bare(";")                   -- @use only; see suffixPath for "=>"
string       := '"' (escape | ~('"' | "\\" | LF | CR))* '"'
bare(D)      := (escape | passthrough | balancedPair | ~(D | LF | CR))+
escape       := "\" ("\\" | '"' | ";" | "|" | "｜" | "]" | "[" | ")" | "(" | "（" | "）"
                     | "n" | "t" | "/")              -- "n" and "t" decode to LF and TAB
passthrough  := "\" <any other character>            -- two literal characters in the IR
fence        := FENCE LF rawLine* (FENCE ";" | FENCE) -- FENCE is three backticks; raw context,
                                                      -- opener last on its line, FENCE ";" emitted
comment      := "//" ~LF*                            -- statement boundary AND start of a line
              | "/*" ("\\\\" | "\\/" | ~"*/")* "*/"  -- any statement boundary; does not nest
key          := ("x-")? [A-Za-z] [A-Za-z0-9-]*       -- never contains "."
tag          := [A-Za-z]{2,8} ("-" [A-Za-z0-9]{1,8})*
id           := idChar (idChar | "-" idChar)*        -- idChar = XID_Continue | "_"; NFC
lparen       := "(" | "（"      rparen := ")" | "）"
colon        := ":" | "："      SEP    := "|" | "｜"
```

Six constraints the productions cannot state, all checked as predicates over the open-frame stack
or over the whole file: (1) a `phaseBlock` may open only where the flow scope is the root body,
which also forbids a phase inside a phase; (2) no `branchBlock` and no `phaseBlock` may open while
a `branch` is anywhere on the stack; (3) a closer must match the innermost open frame in kind; (4)
a jump's target must satisfy containment; (5) each statement kind has a closed property-key set;
(6) `unset:` is legal only in a section that merges through `@use`.

## Edge cases

| case | behaviour | diagnostic |
| --- | --- | --- |
| **Lexing.** A run beginning with `"` that does not end with one (L01); `;` inside a value (L02) | literal text, as in `[sales: "完了" を押す]`; a bare value ends at the first unescaped `;`, its canonical spelling being quoted | `quoteNotDelimiter`; `unknownStatement` on the remainder |
| `（承認する？)`; `desc: 条件A；条件B;` (L03) | the closer must match the kind that opened the run; `；` is content and the value ends at the ASCII `;` | `unbalancedParen`; `fullWidthPunctuation` where such a value reaches its bound with no `;` |
| `[sales: 予算[確定] を承認]` (L04); `if (金額 (税込) は 100 万超？)` (L12) | matching-kind depth counting from 1; the other bracket kind is content; text after the closer that is not a colour is an error | `unbalancedBracket`, `unbalancedParen` |
| `case (はい) #greenish`, `icon: #Circle-Chek;` (L05) | theme default, icon omitted; the token is re-emitted verbatim, case included | `unknownColor` |
| `/title/ 受注処理 2026/09 版;` (L06) | `/09 版` is content: a marker is recognised only at a statement boundary | none |
| `<営業 01>`, `@end` written as an id (L07); `<HEX>` where only `<hex>` exists (L08) | ids are Unicode but hold no space and may not spell a directive name; ids are case-sensitive and there is no retry | `invalidId`; `undefinedReference` |
| `end-ifx` (L09) | one maximal word, exact lookup, never a prefix match | `unknownStatement` with a did-you-mean |
| `[sales: 見積  作成 ]`, `[sales: " 見積作成"]` (L10) | edges trimmed, interior preserved; quoting is the only way to keep edge whitespace | `edgeWhitespaceQuoted` |
| `quote.remark en: …;` (L11) | a space is not a tag separator; squashed the row is `quote.remarken:` | `i18nEntryMalformed` |
| `<hex> shape: hex; <terminal> shape: rounded;` on one line (L13); `@use "./role/sales standard.swim";` (L14) | one definition ends at the next `<` at a statement boundary; a path is an ordinary value, bare to `;` or quoted, never folded | none |
| **Control flow.** `goto @top` where `@top` is upstream (C01); `loop @c` where `@c` is downstream (C06) | accepted and drawn; direction is a warning and no tool substitutes one keyword for the other | `jumpDirection` |
| `goto` from `case (a)` into `case (b)` (C02); `goto @side` naming a `branch` (C17) | rejected: the row can never reach the target; a branch head has no inbound edge | `unreachableRow`, `unknownId` |
| A fork path ending in `goto` (C03); a `fork` with one path (C13) | the split is always drawn, the join iff ≥ 1 path reaches it, with that arity; one path keeps both gateways | `forkArity` |
| `goto` at the root, in a `section` or in a `phase` (C04); a row after `loop @quote` (C05) | jumps are legal in every body; nothing is deleted, so the diagnostic survives format-on-save | none; `unreachableRow` |
| `loop @retry` where `@retry` names an `if` (C07) | legal — every opener takes an optional `@id`, which is also what makes control text addressable | none |
| Bare `loop` inside a `section` inside a case; with no enclosing `if` (C08) | searches outward through every frame kind; the fix offers each upstream node that already has an id | `unknownId` |
| `if [manager] (承認する？)`, `if []` (C09) | the lane populates the IR's `if.lane`; omitted means "keep today's derived placement" | `emptyValue` |
| A step between `if` and its first `case` (C10); `case` after `else`, two `else`s, an `if` with no case, `case ()` (C11) | all rejected; an empty case *body* is legal and draws a bare edge | `malformedIf`, `emptyValue` |
| `fork (通知)` (C12) | names path 1 exactly as `and (出荷)` names path 2; there is no name for the block | none |
| `end-if` while a `section` is open; `end-branch` closing a `section` (C14) | refused, the frame closed anyway so nothing cascades | `closerMismatch` |
| A `branch` followed only by `@end`; a `branch` at the end of a case (C15, C16) | the tail is drawn as a terminal; inside a case it merges into the `end-if` join and the escaping edge is unconstructible | `branchNoNeighbour`; none |
| A `phase` containing a complete `if` (C18); a `phase` in a fork path, or nested (C19); `loop` across `end-phase` (C20) | legal; rejected, since a band covers a contiguous range of root-level rows; legal, a phase being a region and not a scope | none; `frameNotAllowedHere`; none |
| `[sales: X] ~>` last in a case (C21); two glyphs on one step | styles the edge into the `end-if` join; the arrow slot is single-valued | `arrowNoEdge` where there is no edge; `badSuffix` |
| `[warehouse: 出荷準備] => ./a.swim @ship`, two `=>` on one step (C22); a `[…]` row in `/page/`, a `/line/` with zero rows (C23) | any suffix order is read and written canonically; a step links to at most one diagram; the first is rejected, the second legal | `badSuffix`; `flowRowOutsideLine` |
| **Properties.** `skip;`, `skip: true;`, `skip-reason:`; `[]`, `[sales:]` (P01) | the first two are one fact and the third an unknown key; `[]` is never numbered while `[sales:]` is | `unknownKey`; none |
| `+RQ +RQ`, a second `@id` (P02); `+RQ` written after a property row | `+prop` accumulates and dedupes; `@id` and the glyph are single-valued; suffixes precede the property block | `badSuffix` |
| `hint:` and `title:` in one block (P03); `remark-desc:` before `remark:` (P04) | aliases are one key, while `label:` and `label.en:` are not; `remark-desc` appends, so it must follow the block's `remark:` | `duplicateKey`; `duplicateKey` |
| `lang: fr;` with `@lang ja, en;`; a gutter title in both `/page/` and `/option/` (P05) | rejected, since it selects what renders; `/option/` wins, as in v1 | `unknownLanguage`; `titleInBothSections` |
| `colour:` in `/role/`, `x-figma-node: 12:345;` (P06); `status: wip;`, `updated: 2026/09/05;`, `max-chars: 十;` (P07) | kept verbatim in an ordered `unknown` bag and re-emitted after the known keys; `x-` is opaque; each falls back to its default | `unknownKey`; none; `badValue` |
| `icon: ;` vs `icon: "";` vs `icon: none;` (P08) | error, explicitly empty, clears an inherited value and is always re-emitted | `emptyValue` |
| `[sales: 見積作成] +RQ` with no definitions (P09); `desc:` under a `case`, `note:` after `end-if` (P10) | stubbed from the id and flagged provisional; closers, jumps, `[]` and markers take no properties | `undefinedReference`; `keyNotAllowedHere` |
| `shape: arrow-down;`, `shape: hexagon;` (P11); two `note:`, `note-side:` with no `note:` (P12) | documented and parses; falls back to `rounded`; a note is single assignment, the default side the constant `right` | `badValue`; `duplicateKey`, `noteSideWithoutNote` |
| **Imports.** `@use assets/logo.png;` then `icon: @logo;` | the stem binds the id; the image is embedded as a `data:` URI in an `<image>`, never inlined as markup | none |
| Two imports whose stems agree; `@use a/logo.png as brand;` | refused rather than one silently winning; `as` names it | `duplicateAsset` |
| An image the host cannot supply; `icon: @nope;` | the icon is omitted and the diagram still renders; a reference has no glyph to fall back on | `assetNotFound`; `unknownAsset` |
| An image over 2 MiB, or a resolver returning a URL | refused, so a diagram stays loadable and self-contained | `assetTooLarge`, `assetNotAnImage` |
| `@use ../../assets/a.svg;` from `diagrams/brand/` | `../` resolves against the importing file, so this is inside the repository and legal | none |
| `@use ./templates/role/standard.swim` with no `;` (I01) | the directive is `;`-terminated; the `;` is inserted only by the quick-fix, never by a save | `missingSemicolon` |
| A root importing `base` and `role/standard`, `base` also importing `role/standard` (I02) | merge order is `standard, base, root` — the diamond is merged once, at first visit | `redundantOverride` on a directive with no effect |
| `@use /templates/role/standard.swim;` (I03); `@use templates/role/standard;` (I04) | `./` and `../` resolve against the importing file, everything else against the repository root; exactly one lookup, no probing | `absoluteImportPath`; `missingExtension`, `importNotFound` |
| `@use diagrams/sales/order.swim;` (I05) | the six mergeable sections merge; `/title/`, `/meta/` and `/line/` never do | `importIsDiagram`, `redundantOverride` |
| `shared/lanes.swim` holding only `<sales> label: 営業;` (I06) | no header and no section marker means it is not a fragment; the marker is prepended, never inferred | `notAFragment` |
| Nine levels, 80 fragments (I07); two templates importing each other (I08) | the caps are errors and the offending edge alone is dropped, so the diagram still renders | `importCycle` |
| A README fence containing `@use` (I09); format-on-save on a file with an `@use` (I10) | the local content renders, marked partial; `format` reads the unresolved IR and emits `@use` plus `local` keys only | `importsUnsupportedHere`; `redundantOverride` on a local key identical to the one it shadows |
| A template's colour is edited (I11) | every dependant's `sourceHash` is unchanged and its `renderHash` changes, so each cached render misses | none |
| A pinned key overridden locally (I12); a pin reached through a project bundle (I13) | provenance, not text, decides; a transitive reach complies, and a bundle that shadows a pinned key cannot launder the override | `forcedTemplateOverride`, `forcedTemplateMissing` |
| `@use` written after `/line/` (I14); a five-role template imported by a one-step diagram (I15) | still applied with prologue semantics and hoisted, never dropped; one column, not five | `misplacedDirective`; `laneOrderUnknown` on a `lane-order` entry naming no role |
| `@use https://example.com/theme.swim;`, `../../../../etc/hosts` (I16) | checked before any I/O, first failure only, path echoed and nothing else | `importColon`, `importEscapesRoot` |
| **Multilingual.** `[sales: 承認\|却下 を判断]` with one declared language (N01); `[sales: 見積作成 ｜ Create quote]` (N08) | separators are unconditional, so an unescaped bar is loud rather than silent; `｜` separates wherever `\|` does and folds to ASCII, an escaped `\｜` not | `segmentCount` |
| `remark-desc.zh-Hant:`; `version.major:` (N02); `<sales> icon.en: #flag;` (N03) | keys and tags never contain `.`, so the split is by construction; the translatable set is closed | `badKeySuffix` |
| `desc: \*not italic\* ** bold ** \| bar;` (N04) | the lexer consumes only the fourteen table sequences; `\*` survives into the IR for the renderer | `danglingEscape` on a trailing `\` |
| A local `"完了".en:` and a glossary `"完了".en:` (N05); a glossary declaring `ja, en, zh` imported by a `ja, en` diagram (N06) | local beats imported silently; two imports disagreeing is reported; the importer's `@lang` is authoritative and the extra entry is inert, while a glossary whose source language differs is an error at the `@use` | `importConflict`; `redundantOverride`, `notAFragment` |
| `"監査ログ保存 ".en:`; a decorated and an undecorated occurrence of one sentence (N07, N15) | keys compare byte-exactly after edge-trim and NFC — no folding of any kind, no markup stripping | `staleCatalogEntry` |
| `見積 \| \| Angebot` with three languages; `\| Done` (N09) | an interior empty segment falls through to the catalog; an empty *first* segment is an error | `segmentCount` |
| `case (あり) @need-yes` plus `/i18n/ need-yes.label.en:` (N10); `@done` reached only by `/i18n/ done.label.en:` (N11) | control heads take `@id`, with reserved field names per kind; a catalog key and a `field.lang:` line both count as references, so the id survives every format | `badKeySuffix` for `else.label`; `unknownId` on a positional id |
| An inline `\| Create quote` plus `quote.text.en:` (N12); `desc:` plus `desc.ja:` (N13); `label.fr:` with `@lang ja, en;` (N14) | node-local wins, so the catalog entry can never render; `key.<source>:` is exactly the bare key; an undeclared tag is a reference failure and stays an error | `unusedCatalogEntry`; `duplicateKey`; `unknownLanguage` |
| A fenced `desc:` containing a Markdown table (N16); a two-line `/title/` (N17) | nothing is structural inside a fence; a newline inside the title is one structural space, so it segments as its one-line form | `i18nEntryMalformed` on a multi-line quoted key; `segmentCount` quoting the joined text |
| Two occurrences of `確認` translated differently under `i18n-storage: catalog;` (N18); a hand edit of a step whose text keys a catalog entry (N19) | nothing is hoisted, hoisting running only when it changes no rendered string; the entry is never rekeyed or deleted by the formatter | `unusedCatalogEntry`; `staleCatalogEntry`, `missingTranslation` |
| **Squash and format.** A `desc:` fence whose body contains a line `手順は @end で終わる` (S01) | markers are consumed from the token stream, never a raw-line pre-scan, so the fence body is content | none; `unterminated` when the fence never closes |
| `@quote+RQdesc:` (S02) | the squash keeps one space wherever two tokens would fuse; without it this is one prop reference and no lexer can tell | `undefinedReference` with a did-you-mean |
| `desc: 参照は https://example.com/a//b を参照;` (S03) | `//` inside a run is content; a comment opens only at the start of a physical line | none; `fenceOpenerNotAlone` |
| `if　(q)` with U+3000; `[sales: 見積​作成]` with U+200B (S04) | a separator outside a run and content inside one, so it parses today and keeps parsing; the invisible character is kept, deleting one not being a formatter's job | none; `invisibleCharacter` |
| `fmt --compact` on a file with an unresolvable `@use` (S05) | writes nothing rather than emitting a viewer-dependent one-liner | `importNotFound` |
| `***重要***` at row start or inside a `desc:` (S06) | decoration in both positions, never a comment | none |
| A fenced value at indent 4 inside `if`/`case` (S07); a comment alone in an empty `case` body (S08) | parse dedents by `min(N, own indent)` and emit adds exactly the statement's indent; the comment becomes that body's trailing comments | none |
| `desc: "引用";` versus `desc: "引用" のこと;` (S09) | a whole extent wrapped in `"` is a quoted string; a run that does not also end in `"` keeps the quotes as content | none; `quoteNotDelimiter` |
| A file with no `/page/` content (S10); blank lines anywhere in the source (S11) | no `/page/` header is emitted; one separator, never significant, output blank lines being a function of kind and depth | none |
| The same diagram as a file, a Markdown fence or an API body (S12) | identical bytes and identical `sourceHash`; `@end` is optional and emitted iff it was present | `textOutsideDiagram` |
| `[sales: 予算]確定]を承認]` (S13) | an *unbalanced* `]` ends the run at the first `]`; escape it or quote the run | `unbalancedBracket` |
| **Converting from v1.** A bare `@kai-swimlane` header (V06, V10); `@kai-swimlane 3`, `@kai-swimlane2` (V08) | a version 1 file is refused with a pointer to `swimlane convert`; a newer file is refused read-only; a malformed header is never a fallthrough | `unsupportedVersion`; `malformedHeader` |
| A squashed one-line file; `@kai-swimlane v2` (V03) | detected exactly as an expanded one, the header being prefix-matched | `malformedHeader` |
| `merge: done;`, `[loop]` (V01); `merge: x;` pointing upstream (V17) | the converter writes `goto @done` or `loop @x` by position, and bare `loop` | converter report |
| `&lt;hex&gt;` in step text or in suffix position (V02) | the converter decodes entities in the positions v1 unescaped, so a `&lt;hex&gt;` suffix becomes `<hex>`; the reader decodes nothing | converter report |
| `end-branch` closing a `section`; `end-point` (V04) | the converter writes the opener's closer for a same-family mismatch and `end-section` for `end-point`; a cross-family mismatch is refused | converter report; `closerMismatch` |
| `label.en:`, `/i18n/`, `/option/ lang:` (V05) | version 2 features; the converter carries nothing multilingual, and adding them is an edit after conversion | none |
| `if (q) is (a) than #blue` (V07); `else than #gray` (V18) | the converter writes `if (q) #blue` plus `case (a) #blue`, and `else #gray`, since v1's one token coloured the diamond and the first case | converter report |
| A build predating version 2 opening a version 2 file (V09) | must report `unsupportedVersion`, never a missing marker, which would license overwriting | `unsupportedVersion` |
| Format-on-save (V11); `desc: ``` … @end … ```;` (V12) | never writes a version 1 file; the fence-aware scan keeps a fenced `@end` as content | none; `missingEnd` |
| Two headers in one file (V13); `/meta/` after `/role/` (V14) | the first header wins and the trailer is an error; a marker always closes the current section | `textOutsideDiagram`; none |
| A `/role/` fragment posted for validation (V15) | validated in fragment mode as version 2, never by string-wrapping it in a synthetic document | none |
| Any valid v1 file (V16); `id: 完了 ステップ;` (V19) | the converter's output renders the same picture, checked by `renderHash`; an out-of-charset id is slugified once with every reference rewritten | converter report |
| **Tooling.** Two steps sharing one `<block>` (T01) | a step's id comes only from `@id` or the explicit transform, never from its `<block>` reference | `duplicateId` on a real collision |
| A diagnostic in a squashed file (T02); a `/meta/ status:` edit (T03) | anchored by offset and node path, the GUI lock being a path-prefix test; `sourceHash` changes and `renderHash` does not | none |
| A host rendering the IR as something other than the diagram (T04) | it walks the same node kinds, and a jump resolves through an index built over every kind and not steps only, so a target that is an `if` or a frame shows a label | none |
| `if (承認する？) case (はい` … (T05) | one diagnostic, recovery to the next sync token, and the bracketed step still lands in the はい case | `unbalancedParen`, `unclosedBlock` |
| A GUI reorder saved while a `desc:` is broken (T06); `section (監査) #turquoise` with `max-chars: 10;` (T07) | the reorder is written and the broken statement survives character for character; both are warnings and both tokens round-trip | none; `unknownColor`, `badValue` |
| The compact form used as transport (T08); a squashed one-liner posted to a host that stores it (T09) | it inlines the import closure by default, `--keep-use` opting out; the host normalises but never repairs | `importNotFound`; `missingSemicolon` with an offset-anchored insert |

## Diagnostics

One flat camelCase namespace, one severity per code. `impact: render` means no SVG can be produced;
`impact: format` refuses whole-file `format` and locks the owning node and its descendants, the
file still rendering; `impact: none` blocks nothing, an error carrying it failing CI and the
promotion gate but never a save, format or render. Two settings change a classification and no
others: `i18n-strict: true` promotes `missingTranslation` and `staleCatalogEntry` to errors, and
`auto-define: false` promotes `undefinedReference`, both keeping `impact: none`; the second is
suspended whenever import resolution produced any error. Every value-level problem is a warning
with a documented fallback and a verbatim round trip, except a value that is itself a reference, a
delimiter or a key — exactly the value-level codes listed below as errors.

| code | severity | impact | message | quick-fix |
| --- | --- | --- | --- | --- |
| `unterminated` | error | render | unterminated string, fence or `/* */` | Insert the closer before the next statement |
| `danglingEscape` | error | render | `\` must be followed by the character it escapes | Write `\\` |
| `headerMissing` | error | render | `@kai-swimlane` marker not found | — (the sole code licensing starter-template init) |
| `malformedHeader` | error | render | malformed header: "…" is not a version | Replace with `@kai-swimlane 2` |
| `unsupportedVersion` | error | render | version 1 — run `swimlane convert`; version N — this file needs a newer build | — (read-only, source returned unmodified) |
| `limitExceeded` | error | render | file exceeds 1 MiB / 10 000 nodes | — |
| `missingSemicolon` | error | format | "…" must end with `;` | Insert `;` before the next sync token |
| `unterminatedTitle` | error | format | `/title/` value must end with `;` | Insert `;` |
| `unknownStatement` | error | format | unknown statement, section marker or step head | did-you-mean / Insert `:` after the role id |
| `emptyValue` | error | format | "…" has no value; empty `()` or `[]` — omit it instead | Write `""` / Write `none` / Delete |
| `unbalancedBracket` | error | format | unbalanced `[` or `]` in step text, or a run ended at a delimiter | Escape it / Quote the run |
| `unbalancedParen` | error | format | `(` is not closed, closed by the other width, or followed by text | Insert `)` / Quote the run |
| `fenceOpenerNotAlone` | error | format | a fence opener must be last on its line, and `//` must be first | Move the content / Convert to `/* … */` |
| `duplicateKey` | error | format | "…" is already set on … | Remove one / Swap the lines / Merge |
| `duplicateId` | error | format | duplicate id or `<…>` definition | Rename to `…-2` (updates N references) |
| `invalidId` | error | format | invalid, empty or reserved id "…" | Rename to `…` (updates N references) |
| `unknownId` | error | format | no node with id "…"; a jump needs a target; `case`, `else`, `and` and `branch` heads and empty frames are not targets; bare `loop` needs an enclosing `if` | did-you-mean / Add `@id` |
| `unreachableRow` | error | format | nothing reaches this statement, or the target is in a scope this row cannot reach | Move above the jump / Delete |
| `badSuffix` | error | format | "…" is given twice, or after the first property row | Remove the second / Move it |
| `keyNotAllowedHere` | error | format | "…" is not a property of "…" (allowed: …); `unset:` needs a mergeable section | Change to `note:` / Move under the step |
| `flowRowOutsideLine` | error | format | flow row outside `/line/` | Move into `/line/` |
| `malformedIf` | error | format | row before the first `case`; `if` with no case; `case` after `else`; two `else`s | Insert `case (…)` / Move above the `else` |
| `closerMismatch` | error | format | "…" closes "…", or closes nothing, while "…" is still open | Insert the missing closer / Delete |
| `unclosedBlock` | error | format | "…" is not closed (missing "…") | Insert the closer at the closure point |
| `frameNotAllowedHere` | error | format | `phase` must be at the top level and phases do not nest; `branch` may not nest inside `branch` | Replace with `section (…)` / Move it out |
| `badKeySuffix` | error | format | keys may not contain "."; at most one `.lang` suffix; "…" is not translatable | Replace "." with "-" / Remove the suffix |
| `unknownLanguage` | error | format | "…" is not a declared BCP 47 language tag | Add "…" to `@lang` (appends) / Delete |
| `segmentCount` | error | format | K segments but this file declares M languages; the first segment must not be empty | Escape the extra bar / Add a language |
| `i18nEntryMalformed` | error | format | an entry must be written `<key>.<lang>: <text>;`, single-line, never the source language, and `id.field` needs a `/line/` | Replace the space with `.` / Rekey |
| `textOutsideDiagram` | error | format | text before the header or after `@end`, or a second header | Delete / Move into a comment |
| `emptyImportPath` | error | format | an import path must not be empty | — |
| `importColon` | error | format | a path must not contain `:` | — (no fetch is issued) |
| `importBackslash` | error | format | path separators are `/` | Replace `\` with `/` |
| `absoluteImportPath` | error | format | a path is relative to the repository root | Drop the leading `/` |
| `importEscapesRoot` | error | format | "…" is outside the repository | — (never fetched) |
| `forbiddenImportPath` | error | format | "…" is not importable | — |
| `missingExtension` | error | format | a path must include a file extension | Append `.swim` |
| `notAFragment` | error | format | "…" is not a swimlane fragment, or its catalog's source language is "…" | Insert `/role/` / `/block/` / `/prop/` |
| `duplicateAsset` | error | format | two imported images resolve to the id "…" | Name one with `as` |
| `assetTooLarge` | error | format | "…" is larger than the 2 MiB limit, or the diagram's images exceed 8 MiB | — |
| `assetNotAnImage` | error | format | "…" did not resolve to a base64 image data URI | — |
| `misplacedDirective` | error | none | `@use` and `@lang` must come before the first section | Move to the prologue |
| `importNotFound` | error | none | cannot resolve "…" — definitions fall back to theme defaults | did-you-mean / Delete |
| `importCycle` | error | none | import cycle a → b → a, or nesting or closure too large (8 deep, 32 files, 1 MiB) | Delete this directive |
| `forcedTemplateMissing` | error | none | `/…/` must `@use` project template "…", and directly where the policy says so | Add `@use "…";` |
| `forcedTemplateOverride` | error | none | "…" overrides or shadows project template "…", or adds a key outside it | Delete this line / Pin the bundle |
| `unknownColor` | warning | none | unknown colour or icon "…" — theme default used, icon omitted | Change to `#gray` / did-you-mean |
| `assetNotFound` | warning | none | cannot resolve the image "…" — the icon is omitted | did-you-mean / Delete |
| `unknownAsset` | warning | none | no imported image named "…" | Add `@use <path>;` / did-you-mean |
| `badValue` | warning | none | "…": expected a boolean, one of an enum, a date, a number, a side, an arrow or a shape | Use the first legal value |
| `unknownKey` | warning | none | unknown key "…" — kept, not rendered; `/meta/` keys are untyped and take no flag form | did-you-mean / Rename to `x-…` |
| `unknownDirective` | warning | none | unknown directive "@…" — kept verbatim, not applied | did-you-mean |
| `undefinedReference` | warning | none | lane, prop or block "…" is not declared — created from its id | Define it / Fix the reference |
| `laneOrderUnknown` | warning | none | `lane-order` names "…", which is not a role | did-you-mean (edit distance 1 only) |
| `jumpDirection` | warning | none | target "…" is upstream of a `goto`, or downstream of a `loop` | Replace with `loop @…` / `goto @…` |
| `idIsKeyword` | warning | none | id "…" is also a control keyword | Rename |
| `forkArity` | warning | none | the join has K of N incoming paths; a `fork` with one path | Add `and` / Remove the frame |
| `branchNoNeighbour` | warning | none | the branch tail is drawn as a terminal, or its head as a start terminal | Add a step / End with `goto @id` |
| `arrowNoEdge` | warning | none | arrow glyph on a step with no outgoing edge | Delete the glyph |
| `noteSideWithoutNote` | warning | none | `note-side:` with no `note:` | Delete the line |
| `titleInBothSections` | warning | none | "…" is set in both `/page/` and `/option/` — `/option/` wins | Delete the `/page/` line |
| `staleCatalogEntry` | warning | none | catalog key "…" matches no source string, or matches only after folding | Rekey to the exact source string |
| `unusedCatalogEntry` | warning | none | `/i18n/` entry "…" is never reached — the node's own value wins, or nothing uses it | Delete the entry |
| `importConflict` | warning | none | "…" differs between two imports — "…" wins; N id-keyed entries were not imported | — |
| `importIsDiagram` | warning | none | "…" is a diagram; only definitions were imported | Extract its definitions to a fragment |
| `invisibleCharacter` | warning | none | invisible character U+…; it changes the render | Remove it / Keep it |
| `quoteNotDelimiter` | warning | none | `"` at the start of an unquoted run is literal text | Quote the run and escape the inner quotes |
| `fullWidthPunctuation` | info | none | a full-width delimiter was normalised to ASCII; `；` is never a terminator | Replace with `;` (never auto-applied) |
| `missingEnd` | info | none | missing `@end` marker | Append `@end` |
| `edgeWhitespaceQuoted` | info | none | this run has significant edge whitespace and will be quoted | — |
| `redundantOverride` | info | none | "…" repeats the value from "…", is already imported, is an ignored imported `/meta/`, or supplies an undeclared language | Delete this line |
| `importsUnsupportedHere` | info | none | this host cannot resolve imports | — |
| `missingTranslation` | info | none | `<lang>`: N/M — missing … | Rekey / Add an inline segment |

## Converting from v1

Version 1 files are not read by this grammar. `swimlane convert`, and the SaaS "Convert to version
2" action that opens a `tmp-*` branch, rewrites a file once, reports every change, and is checked
by one identity over the whole corpus: the converted file renders the same picture,
`renderHash(render(v1)) == renderHash(convert(v1))`. Spelling rewrites:

| v1 construct | written as |
| --- | --- |
| `if (q) is (a) than #c` | `if (q) #c` + `case (a) #c` — v1's one token coloured the diamond and the first case |
| `elseif (b) than #c`; `else than #c` | `case (b) #c`; `else #c` |
| `[loop]`, `[loop];`; `merge: id;` | `loop`; `goto @id` or `loop @id` by position |
| `id: name;`, `props: A,B;`, `arrow: dashed;` | the suffixes `@name`, `+A +B`, `~>` (`solid` → nothing) |
| `section-start (n)`, `start-point`, `end-point`; `endif` and the other un-hyphenated closers | `section (n)`, `section`, `end-section`; `"end-" + opener` |
| a group closer naming another member of the group family | the opener's closer |
| a lone `:` row; `remark-desc:` | `[]`; folded into `remark:` |
| `***` comment rows | `// …` |
| `shape: if;` | `shape: rounded;` |
| `yes on 1` / `no off 0` | `true` / `false` |
| a `/title/` with no `;` | the lines joined with one space, then `;` |

Byte-changing rewrites, each because v1 gave the bytes a different meaning: HTML entities are
decoded in the positions v1 unescaped; an unbalanced `]` or `)` is escaped; a literal `|` or `｜`
in a translatable position is escaped once; a `\` before a table character is doubled; a value
containing its own terminator, a bare `none`, and a run whose whole extent is wrapped in `"` are
quoted; `key: ;` becomes `key: "";`; a Unicode space outside the six structural ones in delimiter
position becomes U+0020; a missing `;` is inserted at the end of the statement's last token; the
earlier of two rows writing one key is deleted, keeping v1's winner; each non-final `else` becomes
`case (else)`, the label v1 draws; out-of-charset ids are slugified and every reference rewritten
(`slug()`: NFKC and trim, every run outside the id charset to one `-`, collapse and strip `-`, the
literal `id` when empty, `-2`, `-3` on collision in declaration order); a property row that v1
attached to the last step across a control row is moved under that step; fenced bodies are
re-indented, v1 having trimmed the join once and never dedented; text outside the diagram is moved
into a comment; the lanes and props v1 invented silently are materialised; and the header is set
last. Four inputs are refused rather than guessed — a closer crossing the group/control boundary,
a `merge:` into a sibling case, a row after a jump, and a nested `branch` — and the file is left
untouched with the offending rows named.

## Trade-offs

- **Pro:** zero relearning. The file keeps its shape — sections, `[role: text]`, `key: value;` —
  and the parser is an extension of the current one: row kinds unchanged, `phase` a new group mode,
  `note` a step field, `@use` a pre-pass.
- **Pro:** one reader, one spelling per construct. No legacy productions, no coexistence window,
  and the converter is checked by `renderHash` over the corpus rather than trusted.
- **Pro:** the `than` / `elseif` error class is gone, and value-level problems no longer hard-lock
  a diagram: an unknown colour today blocks formatting and can lose the token on save, where here
  it is a warning that renders, formats and round-trips byte for byte.
- **Pro:** whitespace-insensitive under a token-stream squash, so it meets the squash rule of [dsl-proposals.md](dsl-proposals.md) §2 while still
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
