# kai-swimlane — DSL specification, version 1

This is the grammar of a file whose header is a bare `@kai-swimlane`. It is **shipped, live and the
default**: the editor's new-file template and every starter template are version 1, so this is the
syntax most documents in the wild are written in. The reader is
`packages/diagram-converter/src/parser.js`, and the writer — what the **Format** button and every
GUI save produce — is `serializeDSL` in `packages/editor/src/lib/serialize-dsl.js`. Where the two
disagree, this document follows the reader and says what the writer emits.

Version 2 (`@kai-swimlane-v2`) is a different language with its own reader,
`packages/diagram-converter/src/parser-v2.js`, specified in [dsl-rule.md](dsl-rule.md). Both readers
are live and `parseDSL` picks one from the header line, so nothing here is affected by anything
there. A short _Differences from version 2_ table closes this document.

## Design of the reader

1. **The line is the unit.** Every statement is one line, trimmed; leading indentation is
   decoration and is never significant. The only multi-line construct is the fenced property value.
2. **`;` ends a property.** `key: value;` everywhere — in `/page/`, `/option/`, a definition body
   and a step's property block. A property line without its `;` is an error that names the key.
3. **Keywords self-delimit.** `if`, `case` closers, `fork`, `section` and the markers take no `;`,
   though a trailing one is tolerated on `[merge]`, `[loop]` and a step line.
4. **Attachment is to the nearest preceding step**, not to the preceding statement: a property
   line after `if …` still lands on the last step read, wherever that step was.
5. **Unknown is kept, not dropped.** An unknown key in `/role/`, `/block/` or `/prop/` is a
   _warning_; the key and its value are carried in the model and re-emitted on save, so a file
   written for a newer build survives a round trip through this one.
6. **Parsing never aborts.** Every input returns a complete model plus a diagnostic list. An error
   disables **Format** and marks the file broken; a warning blocks nothing.

## File and sections

**Header.** A line whose trimmed content is exactly `@kai-swimlane` opens the diagram; the first
line matching it wins. Text before it is ignored. Without one the whole parse is the single error
`@kai-swimlane marker not found` — the one condition the app treats as "this file is not a diagram
yet" and offers to initialise from a starter template.

The version is read from the **first non-empty line of the file**: bare `@kai-swimlane`, or no
header at all, selects this grammar; `@kai-swimlane-v2` selects version 2; `@kai-swimlane-v3` or
later is refused with `unsupported version N — this file needs a newer build`.

**`@end`.** The first line whose trimmed content is `@end` after the header ends the diagram;
everything after it is ignored. It is not optional — a file without one still parses, with the error
`missing @end marker`.

**Sections.** A line whose trimmed content is exactly `/page/`, `/title/`, `/option/`, `/role/`,
`/block/`, `/prop/` or `/line/` opens that section and closes the current one. The markers are
lowercase and take no spaces. Sections may appear in any order and a repeated marker **appends** to
what that section already holds. Any other `/word/` line is not a marker: it stays content of the
current section, where it is an error. A line before the first marker is discarded.

Every `@…` line inside the body other than `@end` is skipped silently — v1 has no directives, so
`@lang` or `@use` in a v1 file does nothing and is not reported.

The serializer writes, in this order: `/page/` (only when it carries content), `/title/`,
`/option/` (only when it carries content), `/role/`, `/block/` and `/prop/` (only when non-empty),
`/line/`, then `@end`.

**Comments.** A line whose trimmed content starts with `//` — or with `***`, kept for backward
compatibility — is a comment, in every section. Comments inside `/line/` attach to the next flow row
and are written back; comments in every other section are **dropped on save**. There is no
end-of-line comment: a `//` after content on the same line is ordinary text.

**Blank lines** are ignored everywhere and are inserted freely by the serializer.

**Escapes.** In `/line/` rows only, the four HTML entities `&lt;` `&gt;` `&amp;` `&quot;` are decoded
before the row is matched, so `&lt;block01&gt;` is read exactly like `<block01>`. There is no
backslash escape and no quoting: a value runs to the `;` that ends its line.

**Case.** Keywords, section-body property keys and step property keys fold (`IF (a) IS (b) THAN` and
`Label:` are accepted); section markers, role ids, block ids, prop ids and step ids do **not**.

**Colours.** The `#name` token after `if`, `else-if`, `fork`, `and`, `section` or `branch` must be
one of the ten palette names — `blue green red orange purple gray black pink teal yellow` — and
anything else is an error. This is the only position a colour is validated in: the `text-color`,
`background-color` and `border-color` values of a definition are raw CSS colours and are never
checked.

**Icons.** An `icon:` value beginning with `#` names a Lucide glyph and is checked against the
bundled set; an unknown name is a warning and the icon is omitted. Any other value — an emoji, a
single letter — is shown literally.

## `/page/`

Eleven optional keys, each `key: value;`, each also taking the fenced form below.

| key                                                            | meaning                                                                  |
| -------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `description`                                                  | the description shown under the title                                    |
| `header-left`, `header-center`, `header-right`                 | the three page-header slots                                              |
| `footer-left`, `footer-center`, `footer-right`                 | the three page-footer slots                                              |
| `left-title`, `left-subtitle`, `right-title`, `right-subtitle` | the four gutter column headings, also settable in `/option/`, which wins |

A value may be written over several lines with a fence — three backticks after the colon, the body,
then a line of three backticks with an optional `;`:

````
description: ```
first line
second line
```;
````

The opening fence must be the last thing on its line. The stored value is the body joined with `\n`
and trimmed. Any other line in `/page/` is the error `unrecognized /page/ line`.

## `/option/`

Nine booleans, two value keys and the four gutter titles. An option not written in the file falls
back to the editor's local preference and then to the default below, so a `/option/` section only
ever needs to carry what the diagram wants to differ on.

| key                        | values                                | default       |
| -------------------------- | ------------------------------------- | ------------- |
| `show-left-gutter`         | boolean                               | `true`        |
| `show-right-gutter`        | boolean                               | `true`        |
| `show-header`              | boolean                               | `true`        |
| `show-footer`              | boolean                               | `true`        |
| `show-description`         | boolean                               | `true`        |
| `show-step-block-captions` | boolean                               | `true`        |
| `merge-at-previous-block`  | boolean                               | `true`        |
| `branch-color-arrows`      | boolean                               | `false`       |
| `show-gateway-icons`       | boolean                               | `true`        |
| `block-margin`             | a whole number of pixels, `0` to `80` | `0`           |
| `block-text`               | `truncate` or `wrap`                  | `truncate`    |
| `left-title`               | text                                  | `Procedure`   |
| `left-subtitle`            | text                                  | `Description` |
| `right-title`              | text                                  | `Remark`      |
| `right-subtitle`           | text                                  | empty         |

A **boolean** is `true yes on 1` or `false no off 0`, folded; anything else is the error
`<key>: expected true or false`. `show-gateway-icons: false;` hides the diamond and bar glyphs
drawn on `if` and `fork` gateways. `block-margin` is the gap left around a step box, and
`block-text: wrap;` lets a long step text run onto more lines instead of being cut with an ellipsis.

A gutter title written in both `/page/` and `/option/` is resolved in `/option/`'s favour, and the
serializer re-emits a title it read even when the value equals the default.

## `/title/`

Free text, no `;`. Every non-empty line in the section is joined with one space into the single
title string, so no line here can be malformed. An empty `/title/` is legal.

## `/role/`, `/block/` and `/prop/`

The three definition sections share one shape: `<id>` alone on a line opens a definition, and every
`key: value;` line beneath it belongs to that definition until the next `<id>` or the next section.
Ids are case-sensitive, hold no `>` and are three separate namespaces. A property line before any
`<id>` is the error `property line must follow a <id> definition`; a repeated `<id>` in one section
is `duplicate role definition <id>` (or block, or prop).

| section                           | keys                                                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `/role/` — one swimlane           | `label`, `text-color`, `background-color`, `icon`                                                      |
| `/block/` — a reusable step style | `label`, `background-color`, `text-color`, `border-color`, `shape`, `icon`                             |
| `/prop/` — a side note chip       | `label`, `side`, `background-color`, `border-color`, `text-color`, `title` (alias `hint`), `max-chars` |

`shape` is one of `rounded rect note hex if subroutine ellipse cloud`; an unknown one is a warning
and falls back to `rounded`. `side` is `left` or `right` and anything else is an **error**.
`max-chars` is a positive integer, and anything else is an error. A `/prop/` with no `label` takes
its id as its label and `side: right`.

A key none of these tables names is a **warning**, `unknown /role/ key: k — kept, not rendered`, and
the key survives the round trip. A role, block or prop referenced from `/line/` but never defined is
created silently from its id, with no diagnostic at all.

## `/line/` — steps

```
step := "[" roleId ":" text "]" ("<" blockId ">")? ";"?
```

`roleId` is `[A-Za-z0-9_-]+` — **ASCII only**; a Unicode lane id is a version 2 feature and here is
the error `unrecognized line`. The text runs to the last `]` on the line and may contain anything,
colons included. The optional `<block>` reference is recognised **only at the end of the line**, and
its id is likewise `[A-Za-z0-9_-]+`.

A line that looks like a step but is not — `sales: do the thing` with no brackets — is the error
`step lines must use [roleId: text] (optional <block> at end of line)`; anything else unmatched is
`unrecognized line`.

A lone `:` line (optionally `:;`) is the **empty step**: one row, no lane, no box text, never
numbered. `[]` is _not_ an empty step in version 1 — it is `unrecognized line`.

### Step properties

Each is its own line after the step. Every one of them attaches to the **nearest preceding step**,
which means a property written after an `if` or a `case` closer still lands on the step above it.
A property with no step anywhere before it is an error naming the key.

| line                   | meaning                                                                                                                                                                                                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id: <name>;`          | names the step so `merge: <name>;` can target it. Must be unique across step ids and `[merge: name]` names; a collision reports `duplicate step id "<name>"` twice, once at each site                                                                           |
| `label: <text>;`       | the step's left-gutter caption, separate from the box text                                                                                                                                                                                                      |
| `desc: <text>;`        | the description column; takes the fenced form                                                                                                                                                                                                                   |
| `remark: <text>;`      | the remark column; takes the fenced form                                                                                                                                                                                                                        |
| `remark-desc: <text>;` | **appends** to `remark` with one blank line between paragraphs; may repeat. The serializer never writes it — it folds into `remark:` on the next save                                                                                                           |
| `skip;`                | drops the step from the gutter numbering. Exactly this spelling: `skip: true;` is the error `skip must be written as skip;`                                                                                                                                     |
| `level: <1-9>;`        | the step's depth in the numbering tree (see below). `level: 1;` is the default and is not written back                                                                                                                                                          |
| `link: <path>;`        | this step opens another flow. Relative to this file's folder (`../ops/pick.md`) or from the diagrams root with a leading `/`. The box takes the `subroutine` shape unless its `<block>` sets one, and carries a ↗ mark that opens the target in the web preview |
| `props: <id>, <id>;`   | the side-note chips on this step, in order. An id with no `/prop/` definition is created from itself                                                                                                                                                            |
| `arrow: <type>;`       | the line style of this step's single outgoing edge: `solid`, `dashed`, `dotted`, `long-dash` or `dash-dot`. `solid` is the default and is not written back                                                                                                      |

`desc:`, `remark:` and `remark-desc:` take the same fence as `/page/`:

````
desc: ```
Check the requirements,
then draft the quote.
```;
````

### Gutter numbering

<!-- parser.js `buildStepRowDisplayInfo`, ~line 221 -->

Numbers are assigned in document order over the steps that name a lane and carry no `skip;`. An
empty step and a skipped step are passed over and consume no number. `level:` nests the number
under the last shallower step: level 1 counts `1`, `2`, `3`; a level-2 step after `2` is `2-1`, then
`2-2`; a level-3 step after that is `2-2-1`. A sub-step with no parent yet counts under an implicit
`1`. Returning to level 1 resumes the top counter, so the level-2 run does not renumber it.

## `/line/` — control flow

### `if` / `else-if` / `else` / `end-if`

```
if (<question>) is (<first case>) than [#color]
  …
else-if (<case>) than [#color]
  …
else
  …
end-if
```

The `is (…)` and the `than` are **both mandatory** on the opener: `if (approved?)` alone is
`unrecognized line`. The colour token, when present, tints the gateway and the first case. `else`
takes no colour and no `than` — `else than #gray` is not accepted by this reader.

`else-if` outside an `if` is `else-if without if`; likewise `else without if` and `end-if without
if`. An `if` never closed reports `unclosed if (missing end-if)` at the opener's line.

### `fork` / `and` / `end-fork`

```
fork [#color]
  …
and [#color]
  …
end-fork
```

A parallel split: `fork` opens, each `and` adds a concurrent path, `end-fork` joins. Paths carry no
label in version 1. `and` outside a fork is `and without fork`, and an unclosed fork is
`unclosed fork (missing end-fork)`.

### `section` and `branch`

```
section (<name>) [#color]      branch (<name>) [#color]
  …                              …
end-section                    end-branch
```

`section` draws a dotted box around its rows and changes nothing about the flow. `branch` draws no
box: its first row receives no inbound edge and its last row merges back into the main flow after
the closer. Both take an optional name — without one the display name is the constant `Section` or
`Branch` — and an optional palette colour.

The two share **one** stack and **one** closer check: `end-section`, `end-branch` and `end-point`
are three spellings of "close the innermost open group", so `end-branch` silently closes a
`section`. Only the count is checked; an unclosed group reports `unclosed section (missing
end-section)` whichever keyword opened it, and a closer with nothing open is `end-section without
section`.

### Landing markers, `merge` and `[loop]`

A **marker row** is a landing place in the main flow:

```
[merge]                [merge: <name>]
```

Either form is legal anywhere in `/line/`, including inside a group. A named marker occupies the
same id namespace as a step's `id:`, so a duplicate is `duplicate step id "<name>"`.

Inside an `if` case, two statements jump to one:

| statement        | lands on                                                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `merge;`         | the **first marker row after this `if`'s `end-if`**. With none, the error is `merge; has no [merge] marker after this if`                         |
| `merge: <name>;` | the step whose `id:` is `<name>`, or the `[merge: <name>]` marker of that name, wherever it sits. With neither, `merge: no step with id "<name>"` |

Both are legal only inside an `if` — inside a `fork` path or at the top level the error is `merge
outside if`. `merge <name>;` without the colon is rejected with the message that names the fix, `use
merge: <id>; instead of merge <id>;`.

`[loop]` (trailing `;` tolerated) is the back-edge to the question of the enclosing `if`; outside
one it is `[loop] outside if`. There is no way to name a loop target in version 1.

### Legacy spellings

All of these still read. None is ever written back: the serializer emits the canonical spelling in
the right-hand column on the next Format or save.

| accepted               | written as                                    |
| ---------------------- | --------------------------------------------- |
| `endif`                | `end-if`                                      |
| `endfork`              | `end-fork`                                    |
| `elseif (x) than`      | `else-if (x) than`                            |
| `section-start (name)` | `section (name)`                              |
| `start-point`          | `section` (a group named `Section`)           |
| `end-point`            | `end-section` / `end-branch`, by what is open |
| `***` comment rows     | `//` comment rows                             |

## Diagnostics

**Errors.** Each one disables **Format** and marks the file broken; the model is still returned and
still renders what it could read.

| message                                                                                                              | trigger                                                                  |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `@kai-swimlane marker not found`                                                                                     | no header line anywhere                                                  |
| `missing @end marker`                                                                                                | header found, no `@end` after it                                         |
| `unsupported version N — this file needs a newer build`                                                              | header `@kai-swimlane-vN`, N ≥ 3                                         |
| `property line must end with ';'`                                                                                    | `key: value` with no `;` in `/option/`, `/role/`, `/block/` or `/prop/`  |
| `unrecognized /option/ line` · `unrecognized /page/ line` · `unrecognized /role/ line` (also block, prop)            | a line in that section matching no production                            |
| `<key>: expected true or false`                                                                                      | a non-boolean value for a boolean `/option/` key                         |
| `block-margin: expected a whole number of pixels from 0 to 80`                                                       | out of range or not an integer                                           |
| `block-text: expected truncate or wrap`                                                                              | any other value                                                          |
| `unknown /option/ key: <key>`                                                                                        | a key `/option/` does not define                                         |
| `<key>: line must end with ';' or use multiline ``` `                                                                | a `/page/` or step text property with neither                            |
| `<key>: missing closing ``` `                                                                                        | a fence opened and never closed                                          |
| `definition id must not be empty`                                                                                    | `<>` in a definition section                                             |
| `duplicate role definition <id>` (also block, prop)                                                                  | the same id opened twice in one section                                  |
| `property line must follow a <id> definition`                                                                        | a property line before the first `<id>`                                  |
| `side: must be left or right (got "…")`                                                                              | any other `/prop/ side`                                                  |
| `max-chars: must be a positive integer (got "…")`                                                                    | any other `/prop/ max-chars`                                             |
| `unknown color "#…" — use one of blue, green, …`                                                                     | a colour token that is not a palette name                                |
| `else-if without if` · `else without if` · `end-if without if`                                                       | no `if` frame open                                                       |
| `and without fork` · `end-fork without fork`                                                                         | no `fork` frame open                                                     |
| `end-section without section`                                                                                        | no group open                                                            |
| `unclosed if (missing end-if)` · `unclosed fork (missing end-fork)` · `unclosed section (missing end-section)`       | a frame still open at `@end`                                             |
| `id: line must end with ';'` (also `label:`, `props:`, `arrow:`, `merge:`)                                           | the `;` is missing                                                       |
| `id: value must not be empty` · `merge: value must not be empty`                                                     | nothing between the colon and the `;`                                    |
| `id: has no preceding step` (also `label:`, `desc:`, `remark:`, `remark-desc:`, `skip`, `level`, `props:`, `arrow:`) | the property is the first flow row                                       |
| `duplicate step id "…"`                                                                                              | two step `id:` values, or a step `id:` and a `[merge: name]`, that agree |
| `skip must be written as skip;`                                                                                      | `skip`, `skip: true;`, `skip-reason:`                                    |
| `level must be written as level: <1-9>;`                                                                             | `level: 0;`, `level: 10;`, a missing `;`                                 |
| `link must be written as link: <path>;`                                                                              | `link: ;`, a path containing spaces, a missing `;`                       |
| `arrow: must be one of solid, dashed, dotted, long-dash, dash-dot`                                                   | any other line type                                                      |
| `merge outside if`                                                                                                   | `merge;` or `merge: x;` at the top level or inside a fork path or group  |
| `use merge: <id>; instead of merge <id>;`                                                                            | the colon was left out                                                   |
| `merge: no step with id "…"`                                                                                         | a named merge whose target is never declared                             |
| `merge; has no [merge] marker after this if`                                                                         | a bare merge with no marker row after its `end-if`                       |
| `[loop] outside if`                                                                                                  | `[loop]` with no enclosing `if`                                          |
| `step lines must use [roleId: text] (optional <block> at end of line)`                                               | a `word: text` row in `/line/`                                           |
| `unrecognized line`                                                                                                  | every other unmatched `/line/` row                                       |

**Warnings.** These block nothing — the file renders, formats and round-trips byte for byte.

| message                                                         | trigger                                                      |
| --------------------------------------------------------------- | ------------------------------------------------------------ |
| `unknown /role/ key: … — kept, not rendered` (also block, prop) | a key the section does not define; it is kept and re-emitted |
| `unknown icon "…" — icon omitted`                               | a `#name` icon that is not a bundled Lucide glyph            |
| `unknown shape "…" — using rounded; expected one of …`          | a `/block/ shape` outside the enum                           |

## A complete example

Every construct in this document, in one file that parses with zero errors and zero warnings.

````
@kai-swimlane

/page/
description: Order handling, end to end;
header-left: Kai Corp;
header-center: Order approval;
header-right: Rev. 3;
footer-left: Confidential;
footer-center: 1 / 1;
footer-right: 2026-09-06;

/title/
Order approval

/option/
show-left-gutter: true;
show-right-gutter: true;
show-header: true;
show-footer: true;
show-description: true;
show-step-block-captions: true;
merge-at-previous-block: true;
branch-color-arrows: false;
show-gateway-icons: true;
block-margin: 8;
block-text: wrap;
left-title: Procedure;
left-subtitle: Description;
right-title: Remark;
right-subtitle: Owner;

/role/
<sales>
label: Sales;
text-color: #1f2937;
background-color: #e0f2fe;
icon: #user;

<manager>
label: Manager;

<system>
label: System;

/block/
<gateway>
label: Gateway;
background-color: #ffe0b3;
text-color: #1f2937;
border-color: #f59e0b;
shape: hex;
icon: #zap;

/prop/
<RQ>
label: Request form;
side: right;
background-color: #fff7ed;
border-color: #fdba74;
text-color: #7c2d12;
title: Attached form;
max-chars: 12;

<LG>
label: Audit log;
side: left;

/line/

// The quotation stage.

section (Quotation) #gray

[sales: Draft the quote] <gateway>
id: quote;
label: Draft;
desc: ```
Check the customer requirements,
then draft the quote.
```;
remark: Approval above 1M;
remark-desc: The manager signs off.;
props: RQ, LG;
arrow: dashed;

[sales: Review internally]
level: 2;

end-section

if (Approved?) is (yes) than #green

[system: Register the order]
skip;
merge;

else-if (needs changes) than #orange

[sales: Revise the quote]
[loop]

else

[manager: Reject the quote]
merge: closed;

end-if

[merge: join]

fork #purple

[system: Send the confirmation mail]

and

[system: Notify the warehouse]

end-fork

branch (Audit) #blue

[system: Store the audit log]

end-branch

:

[system: Close the order]
id: closed;

[merge]

@end
````

## Differences from version 2

The full version 2 grammar is [dsl-rule.md](dsl-rule.md); this is only what a version 1 author
notices.

| area                 | version 1                                             | version 2                                                                            |
| -------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Header               | `@kai-swimlane`                                       | `@kai-swimlane-v2`, prefix-matched                                                   |
| Layout               | one statement per line                                | whitespace-insensitive; a whole file may be one line                                 |
| Exclusive branch     | `if (q) is (a) than #c` · `else-if (b) than` · `else` | `if [lane] (q) @id #c` then uniform `case (a) #c`; a blank `case ()` replaces `else` |
| Jumps                | `merge;` · `merge: id;` · `[loop]`                    | `goto` · `goto @id` · `loop` · `loop @id`                                            |
| Landing marker       | `[merge]` · `[merge: name]`                           | `merge` · `merge @name`                                                              |
| Step extras          | `id:`, `props:`, `arrow:` property lines              | the suffixes `@id`, `+prop`, a glyph (`~>`, `..>`, `-.>`, `-->`) and `=> path`       |
| Spacer               | a lone `:` row                                        | `[]`                                                                                 |
| Ids                  | ASCII `[A-Za-z0-9_-]`                                 | Unicode, NFC, case-sensitive                                                         |
| Colours              | the ten palette names                                 | palette names **or** a 3/4/6/8-digit hex                                             |
| Groups               | `section`, `branch`; any closer closes any group      | `section`, `branch`, `phase`; a closer must match its opener                         |
| Languages            | one                                                   | `@lang`, inline `a \| b`, `key.lang:`, `/i18n/`                                      |
| Imports and metadata | —                                                     | `@use <path>;`, `/meta/`                                                             |
| Comments             | kept only inside `/line/`                             | kept everywhere; `/* … */` as well as `//`                                           |
| Notes                | —                                                     | `note:` and `note-side:` on a step or a control head                                 |

Shared unchanged: `/page/`, `/option/` (the same nine booleans, `block-margin`, `block-text` and the
four gutter titles), `/title/`, `/role/`, `/block/`, `/prop/`, the step form `[role: text]`, the
step properties `label:`, `desc:`, `remark:`, `remark-desc:`, `skip;` and `level:`, the numbering
rule, `fork` / `and`, and `@end`.
