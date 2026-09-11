# Editing a diagram: Text mode

Text mode is the underlying language a diagram is written in — every
diagram, however it was created, is really just this text. Switching to it
never loses anything you did in Visual mode, and switching back doesn't
lose anything you typed here.

## The shape of it

```
@kai-swimlane

/title/
Order approval;

/role/
<sales>
label: Sales;

/line/
[sales: Take the order]

if (Approved?) is (Yes) than #green
  [sales: Ship it]
else-if () than #red
  [sales: Send a rejection]
end-if

@end
```

- `/title/`, `/role/`, `/block/` and `/prop/` set up the diagram's title,
  who's involved, and any shared visual styles.
- `/line/` is the flow itself: steps in `[role: text]` form, plus `if`,
  `fork`, `section` and a handful of other flow keywords.

A decision names its first outcome on the `if` line itself — `if (question)
is (label) than` — so there is no `if` on a line of its own. Every outcome
after that is `else-if (label) than`, and the one that catches everything
else is the blank `else-if () than`; there is no `else`. Closers are spelled
`end-if`, `end-fork`, `end-section` and `end-branch`. The older `endif`,
`endfork` and `elseif` are no longer read: the editor reports the line and
the spelling to use instead.

## The full syntax reference is one click away

Press the **?** button (or the keyboard shortcut it shows) while editing.
It opens a complete, searchable reference for every keyword, property and
example — the section below is the same list in prose.

## Format

The **Format** button rewrites the file into its canonical, consistently
indented form without changing what it means. It's disabled while the file
has an error, so you always know whether what you're looking at is valid.

## Multiple languages in one file

A diagram can declare more than one content language with `@lang`
(for example `@lang ja, en;`), after which any translatable text can carry
every language either inline (`テキスト | Text`) or as a separate tagged
line (`text.en: Text;`).

One thing to know before you write anything else: **a bar separates
languages whether or not the file declares any.** A step written
`[sales: Approve | reject]` reads as just "Approve" — everything after the
bar is taken for a translation. Write `\|` for a bar you mean as a
character. See _Multiple languages_ under _Complete grammar_ below for the
full rule.

## Importing shared pieces

`@use ./shared-roles.txt;` merges another file's roles, blocks, styles and
side-note definitions into this one, so a set of roles or a house style only
has to be defined once and reused across diagrams. See
[Reusable templates](?section=templates) for the version of this that's
managed for you, without writing `@use` by hand.

## Complete grammar

Every construct the grammar accepts, section by section. A property line
always ends in `;`. Whitespace, including indentation, is decoration — the
parser ignores it except as a separator — and a line starting with `//` is a
comment.

### The file

| Construct      | What it does                                                                                                                                                               | Example               |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Header         | Opens the diagram. The one spelling is `@kai-swimlane` — there are no versions, and an older, versioned header is refused with a message telling you to run **Update DSL** | `@kai-swimlane`       |
| `@end`         | Ends the diagram; anything after it is ignored                                                                                                                             | `@end`                |
| Section marker | Opens a section. The nine are `/meta/`, `/title/`, `/page/`, `/option/`, `/role/`, `/block/`, `/prop/`, `/line/`, `/i18n/`, in any order                                   | `/line/`              |
| Comment        | A whole-line note. `/* … */` also works. Only comments inside `/line/` are kept when the file is saved                                                                     | `// checked by legal` |

### `/meta/`

Free-form metadata about the diagram, never rendered. `owner`, `status`
(`draft`, `review`, `approved` or `deprecated`), `tags` (a comma-separated
list), `version` (free text) and `updated` (`YYYY-MM-DD`) are the five keys
the app understands; any other key is kept, unread.

```
@kai-swimlane

/meta/
owner: sales-ops;
status: draft;
tags: order, approval;

/title/
Order approval;

/line/
[sales: Take the order]

@end
```

### `/title/` and `/page/`

| Construct                   | What it does                                                                                | Example                     |
| --------------------------- | ------------------------------------------------------------------------------------------- | --------------------------- |
| Title                       | Free text, no `;`. Several lines join with a space                                          | `Order approval`            |
| `description:`              | The text under the title                                                                    | `description: End to end;`  |
| `header-left/center/right:` | The three page-header slots                                                                 | `header-center: Rev. 3;`    |
| `footer-left/center/right:` | The three page-footer slots                                                                 | `footer-right: 2026-09-06;` |
| Long values                 | Any `/page/` or step text property can run over several lines between three-backtick fences | see _Step properties_       |

### `/option/`

On/off switches, a handful of settings, and the four gutter headings.
Anything you don't write keeps its default.

| Key                                     | Values                                                               | Default                    |
| --------------------------------------- | -------------------------------------------------------------------- | -------------------------- |
| `show-left-gutter`, `show-right-gutter` | `true` / `false`                                                     | `true`                     |
| `show-header`, `show-footer`            | `true` / `false`                                                     | `true`                     |
| `show-description`                      | `true` / `false`                                                     | `true`                     |
| `show-step-block-captions`              | `true` / `false`                                                     | `true`                     |
| `merge-at-previous-block`               | `true` / `false`                                                     | `true`                     |
| `branch-color-arrows`                   | `true` / `false`                                                     | `false`                    |
| `show-gateway-icons`                    | `true` / `false` — the glyph inside an `if` diamond and a `fork` bar | `true`                     |
| `block-margin`                          | a whole number of pixels, `0`–`80` — the gap around a step box       | `0`                        |
| `block-text`                            | `truncate` or `wrap` — what a too-long step text does                | `truncate`                 |
| `lane-order`                            | role ids, comma-separated — the left-to-right order of the lanes     | declaration order          |
| `left-title`, `left-subtitle`           | text — the left gutter's two headings                                | `Procedure`, `Description` |
| `right-title`, `right-subtitle`         | text — the right gutter's two headings                               | `Remark`, empty            |

A switch takes `true` or `false` and nothing else — `show-header: yes;` is
an error — though upper case is fine, and the key on its own, `show-header;`,
is short for `show-header: true;`. The four headings may also be written in
`/page/`; if both carry one, `/option/` wins.

Five more keys are accepted and kept but change nothing today:
`show-notes`, `auto-define`, `i18n-strict`, `i18n-uniform-layout` and
`i18n-storage`. Write them if a template you share expects them; don't expect
them to do anything yet.

`lane-order` names the roles you want drawn first, left to right:

```
/option/
lane-order: sales, manager, system;
```

Every lane you don't name follows the ones you do, in the order it would have
had anyway — so naming one role is enough to pull it to the left and leave the
rest alone. Naming a role no step has reached yet reserves an empty column for
it. A name that isn't a role at all is a warning, not an error: it's skipped,
the rest of the order still applies, and the diagram still draws.

### `/role/`, `/block/` and `/prop/`

Each definition is `<id>` on its own line followed by its properties. The
ids are case-sensitive and are what `/line/` refers to.

| Section   | What it defines       | Keys                                                                                                                 |
| --------- | --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `/role/`  | One swimlane          | `label`, `text-color`, `background-color`, `icon`                                                                    |
| `/block/` | A reusable step style | `label`, `background-color`, `text-color`, `border-color`, `shape`, `icon`                                           |
| `/prop/`  | A side-note chip      | `label`, `side` (`left`/`right`), `background-color`, `border-color`, `text-color`, `title` (or `hint`), `max-chars` |

`shape` is one of `rounded`, `rect`, `note`, `hex`, `subroutine`,
`ellipse`, `cloud`. An `icon` starting with `#` is an icon name
(`icon: #user;`); an icon starting with `@` names an image imported with
`@use` (`icon: @kai-mark;`); anything else — an emoji, a letter — is shown
as-is. A key none of these know is kept in the file and simply not drawn,
and a role, block or side note used but never defined is created for you.

```
@kai-swimlane

/title/
Definitions;

/role/
<sales>
label: Sales;
text-color: #1f2937;
background-color: #e0f2fe;
icon: #user;

/block/
<gateway>
label: Gateway;
background-color: #ffe0b3;
border-color: #f59e0b;
shape: hex;

/prop/
<RQ>
label: Request form;
side: right;
max-chars: 12;

/line/
[sales: Draft the quote] <gateway> +RQ

@end
```

#### Clearing a key an import set

A definition that comes from an `@use`d file arrives with every key that file
gave it. Two spellings drop one you don't want here:

| Construct | What it does                                      | Example               |
| --------- | ------------------------------------------------- | --------------------- |
| `unset:`  | Drops one key, or several separated by commas     | `unset: icon, shape;` |
| `none`    | The same thing said as a value, one key at a time | `icon: none;`         |

The key has to be one this section has: `unset: shape;` in a `/role/` is an
error, because a role has no shape. Neither is worth writing on a definition
you wrote yourself — there, just delete the line. **Format**, and a save from
Visual mode, rewrite the definition as the finished list of keys it ended up
with, so the `unset:` line itself doesn't survive; the diagram looks the
same, but the definition stops following the imported one.

```
@kai-swimlane

/title/
House style, minus the icon;

/role/
<sales>
label: Sales;
icon: none;
unset: background-color;

/line/
[sales: Draft the quote]

@end
```

### Steps

| Construct       | What it does                                                              | Example                    |
| --------------- | ------------------------------------------------------------------------- | -------------------------- |
| Step            | One box in the `sales` lane                                               | `[sales: Draft the quote]` |
| Style reference | Uses a `/block/` style. Only at the end of the line                       | `[sales: Draft] <gateway>` |
| Spacer          | A blank row: no lane, no text, no id, never numbered                      | `[]`                       |
| Empty step      | A step with no text, in a lane — renders an empty box **and is numbered** | `[sales:]`                 |

The role id is letters, digits, `_` and `-`; the text may contain anything,
colons included.

### Step suffixes

Written directly on the step's own line, in any order, right after the
`[role: text]`:

| Suffix    | What it does                                                                                                                        | Example             |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `<block>` | Applies a `/block/` style                                                                                                           | `<gateway>`         |
| `+prop`   | Attaches a `/prop/` side-note chip. May repeat, once per chip                                                                       | `+RQ +LG`           |
| Arrow     | The line style leaving this step: `~>` dashed, `..>` dotted, `-.>` dash-dot, `-->` long-dash. Solid is the default and has no glyph | `~>`                |
| `=> path` | Opens another flow: a path relative to this file, or `/` from the diagrams root                                                     | `=> ../ops/pick.md` |

### Step properties

Each goes on its own line under the step it belongs to.

| Construct      | What it does                                                 | Example                            |
| -------------- | ------------------------------------------------------------ | ---------------------------------- |
| `label:`       | The caption in the left gutter (the box text stays as it is) | `label: Draft;`                    |
| `desc:`        | The description column                                       | `desc: Check the requirements;`    |
| `remark:`      | The remark column                                            | `remark: Approval above 1M;`       |
| `remark-desc:` | A second paragraph appended to `remark:`. May repeat         | `remark-desc: Manager signs off.;` |
| `id:`          | Names the step so a jump can point at it                     | `id: closed;`                      |
| `skip;`        | Leaves this step out of the numbering                        | `skip;`                            |
| `level:`       | How deep the step sits in the numbering, `1`–`9`             | `level: 2;`                        |

Numbering counts the steps that have a lane and no `skip;`. `level:` nests
them: level 1 counts 1, 2, 3; a level-2 step after 2 becomes 2-1, then 2-2;
a level-3 step after that is 2-2-1.

A long `desc:` or `remark:` can be written over several lines:

````
@kai-swimlane

/title/
Long values;

/line/
[sales: Draft the quote]
desc: ```
Check the customer requirements,
then draft the quote.
```;

@end
````

### Flow

| Construct                       | What it does                                                                                                                                                           | Example                               |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `if (question) is (label) than` | Opens a decision **and** names its first outcome, on one line. The question is required, the label is not, and `than` is. `#color` is optional and colours the diamond | `if (Approved?) is (Yes) than #green` |
| `else-if (label) than`          | The next outcome; `#color` is optional. A blank `else-if () than` is the catch-all — there is no `else`, and any number of outcomes may be blank                       | `else-if (No) than #red`              |
| `end-if`                        | Closes the decision                                                                                                                                                    | `end-if`                              |
| `fork`                          | Opens parallel paths. Its own optional label names path 1                                                                                                              | `fork #purple`                        |
| `case (label)`                  | Starts the next parallel path; the label is optional. Only inside a `fork` — it takes no `than`                                                                        | `case (Shipping)`                     |
| `end-fork`                      | Joins them                                                                                                                                                             | `end-fork`                            |
| `section (Name)`                | Draws a labelled box around some steps; the flow is unchanged                                                                                                          | `section (Quotation) #gray`           |
| `end-section`                   | Closes it                                                                                                                                                              | `end-section`                         |
| `branch (Name)`                 | A side path: its first step isn't connected, its last rejoins after the close                                                                                          | `branch (Audit) #blue`                |
| `end-branch`                    | Closes it                                                                                                                                                              | `end-branch`                          |
| `phase (Name)`                  | A horizontal band with its label in the left gutter; can hold complete `if`/`fork`/`section`/`branch` blocks                                                           | `phase (Quoting) #gray`               |
| `end-phase`                     | Closes it                                                                                                                                                              | `end-phase`                           |

The ten colour names are `blue`, `green`, `red`, `orange`, `purple`,
`gray`, `black`, `pink`, `teal` and `yellow`.

### Jumps

There are no landing markers: a jump always names a node that is already
there. A step is named by its `id:` line, and a decision, fork, section,
branch or phase by the `@id` written on its opening line.

| Construct    | What it does                                                                  | Example          |
| ------------ | ----------------------------------------------------------------------------- | ---------------- |
| `[goto: id]` | From inside an outcome: continue at the step, decision or fork named `id`     | `[goto: closed]` |
| `loop`       | From inside an outcome: go back to the question of the nearest enclosing `if` | `loop`           |
| `loop @id`   | Go back to the decision or fork named `@id`                                   | `loop @quote`    |

`[goto: id]` looks like a step but isn't one — `goto` is reserved, so you
can't have a role called `goto`. It always needs a target; there is no bare
`goto`.

```
@kai-swimlane

/title/
Jumps;

/role/
<sales>
label: Sales;

/line/
if (Approved?) is (Yes) than
  [sales: Ship it]
  [goto: closed]

else-if (Needs changes) than
  [sales: Revise it]
  loop

else-if () than
  [sales: Reject it]
  [goto: closed]
end-if

[sales: Close the order]
  id: closed;

@end
```

### Multiple languages

`@lang ja, en;` goes at the very top, above the first section, and lists the
content languages in order. The first one is the original; a reader sees the
language they picked, or the first one when that language has nothing to
show.

A translatable value can then carry every language two ways. Inline, with the
languages in the declared order separated by a bar. Or on a line each, with
the language tagged onto the key after a dot — `label.en: Sales;`. A tag
`@lang` doesn't declare is an error.

Translatable: the title, every `/page/` slot and gutter heading, a role's,
block's or side note's `label` (and a side note's `title`), a step's text and
its `label:`, `desc:`, `remark:` and `remark-desc:`, a question, an outcome
label, and a section, branch or phase name. Everything else — ids, colours,
icons, paths, `/meta/` values — is written once.

**A bar always separates, even with no `@lang` at all.** A step written
`[sales: Approve | reject]` reads as just "Approve": the rest is taken for a
translation and, with no second language, never shown. No error is reported,
so it's easy to miss. Write `\|` for a bar you mean as a character. The
full-width bar `｜` separates in exactly the same way and escapes the same
way, `\｜` — worth knowing when you write in Japanese.

```
@kai-swimlane

@lang ja, en;

/title/
承認フロー | Order approval;

/role/
<sales>
label: 営業;
label.en: Sales;

/line/
[sales: 見積を作成する | Draft the quote]
  remark: 上長が承認する | Manager signs off;

[sales: 可否 \| 保留を判断する | Decide approve \| hold]

@end
```

### `/i18n/`

A place to keep translations out of the flow. Each line is
`key.language: text;`, where the key is either a step's `id:` and the field
it translates (`quote.remark.en:`) or the original text in quotes
(`"監査ログ保存".en:`).

**Nothing reads it yet.** The section is parsed and written back exactly as
you typed it, so a file that carries one loses nothing on save — but no
translation in it reaches the diagram. Until that changes, put a translation
on the field itself: inline, or on a tagged line, as _Multiple languages_
describes.

### Spellings no longer read

Each of these is an error that names the replacement: `endif` → `end-if`,
`endfork` → `end-fork`, `elseif` → `else-if`, a bare `else` → `else-if () than`,
a fork's `and (b)` → `case (b)`, `section-start (n)` → `section (n)`,
`start-point` → `section`, `end-point` → `end-section`.

An opener's lane selector — `if [sales] (Approved?) is (Yes) than` — is gone
too: delete the brackets and what's between them. It used to be read and kept
on save, and nothing was ever drawn from it, so removing it changes no
diagram. A decision is drawn in the lane of the row above it; to change the
order of the lanes themselves, use `/option/ lane-order:`. **Update DSL**
strips the selector for you.

### Migrating an older file

A file written before this grammar — the plain `@kai-swimlane-v2` (or `2`)
header, an `if (q)` on a line of its own with its outcomes as `case (…)`
lines, a fork's `and (…)`, a bare `else`, `[loop]`, and a step's `props:` /
`arrow:` / `link:` property lines among them — is not read here: there is one
reader and no compatibility layer, so it fails on the first old construct.
The **Update DSL** action (under the project's edit view) rewrites every
diagram on a branch across in one commit: the header becomes
`@kai-swimlane`; an `if (q)` and the `case (a)` line right under it fuse into
`if (q) is (a) than`; a later `case (b)` becomes `else-if (b) than`; a bare
`else` becomes `else-if () than`; a fork's `and (b)` becomes `case (b)`;
`[loop]` becomes `loop`; `merge: id;` and `[merge: id]` become `[goto: id]`;
an opener's lane selector, `if [sales] (q) …`, loses the brackets; and a
step's `props:` / `arrow:` / `link:` lines become the suffixes `+prop`,
an arrow glyph and `=> path`. A step's `id:` line is already current and is
left exactly as it is. Anything already written the current way passes
through untouched, so running Update DSL twice is the same as running it
once. Nothing else in the file changes.

**One old construct has no automatic replacement: a jump with no target.**
A bare `merge;` or `[merge]` inside an outcome, and a `[merge]` /
`[merge: name]` landing marker in the flow, name nothing — and there are no
landing markers any more, so there is nothing to turn them into. Update DSL
leaves those lines untouched and the file then reports an error on each one.
Fix them by hand: give the step you wanted to land on an `id:` line, and
write the jump as `[goto: id]`.

## What Visual mode can and can't do

Text mode can express everything above. Visual mode covers most of it, and
anything it can't edit is still **kept** when you save from Visual mode
unless this table says otherwise.

| Feature                                                                                                                                                                 | In Visual mode                    | Notes                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Title, page description, header and footer slots                                                                                                                        | Editable                          | In **Settings**. A slot is hidden while its `show-…` switch is off                                                                  |
| Gutter headings                                                                                                                                                         | Editable                          | Left pair hidden while the left gutter is off, right pair while the right gutter is off                                             |
| `show-left-gutter`, `show-right-gutter`, `show-header`, `show-footer`, `show-description`, `show-step-block-captions`, `merge-at-previous-block`, `branch-color-arrows` | Editable                          | Checkboxes in **Settings**                                                                                                          |
| `show-gateway-icons`, `block-margin`, `block-text`, `lane-order`, `show-notes`, `auto-define`, `i18n-strict`, `i18n-uniform-layout`, `i18n-storage`                     | **Text mode only**                | No control yet; the values are preserved                                                                                            |
| Role, block and side-note definitions                                                                                                                                   | Editable                          | Every property, plus add and delete                                                                                                 |
| `unset:` in a definition                                                                                                                                                | **Text mode only**, and rewritten | Saving writes the definition's finished keys instead — the result is the same, the line isn't                                       |
| Renaming a definition's `<id>`                                                                                                                                          | **Text mode only**                | The id is shown but not editable                                                                                                    |
| Lane order                                                                                                                                                              | **Text mode only**                | Lanes appear in the order their `/role/` definitions do, unless `/option/ lane-order:` overrides it; both are edited in Text mode   |
| Add, edit, delete, reorder a step                                                                                                                                       | Editable                          | Up/down and **Move to…** stay inside the enclosing branch; drag can cross branches, and a drag that would break the file is refused |
| `<block>` on a step                                                                                                                                                     | Editable                          | With a visual picker                                                                                                                |
| `label:`, `desc:`, `remark:`, `+prop`, arrow                                                                                                                            | Editable                          | Under **More options**                                                                                                              |
| A step's `id:`                                                                                                                                                          | **Never typed**                   | Written and removed for you when a jump is pointed at the step or stops naming it; no field shows the raw id                        |
| `level:`                                                                                                                                                                | Yes                               | Numbering level, 1–9                                                                                                                |
| `=> path`                                                                                                                                                               | Yes                               | "Link to another flow" picks a file; the ↗ mark on the block opens it from the preview                                              |
| `skip;`                                                                                                                                                                 | **Text mode only**                | Kept on save                                                                                                                        |
| `remark-desc:`                                                                                                                                                          | **Text mode only**, and rewritten | Saving folds it into a single `remark:` — the text survives, the two-line form doesn't                                              |
| The spacer `[]`                                                                                                                                                         | Visible, deletable                | Can't be created or edited in Visual mode                                                                                           |
| `if` / `else-if`, the question, outcome labels, colours                                                                                                                 | Editable                          | Colours are swatches, not names                                                                                                     |
| `fork` / `case`                                                                                                                                                         | Insertable, colour editable       | A parallel path can carry a label in the grammar, but Visual mode doesn't expose a field for it yet — set one in Text mode          |
| `section` / `branch` / `phase`, name and colour                                                                                                                         | Editable                          | No way to turn one into another; `phase` is shown as a group but can only be created as a `section` or `branch`                     |
| `loop`, `loop @id`                                                                                                                                                      | Insertable only                   | Nothing to configure                                                                                                                |
| `[goto: id]`                                                                                                                                                            | Editable                          | The target is a dropdown of steps, not an id you type                                                                               |
| Comments                                                                                                                                                                | **Text mode only**, and fragile   | Kept on save, but not shown anywhere in Visual mode, and deleting a step deletes the comments attached to it                        |
| An unrecognised `/option/` key                                                                                                                                          | **Dropped**                       | It's reported as an error, and a Visual-mode save removes the line                                                                  |
| Per-language values (`@lang`, inline `\|` segments, `field.lang:` lines)                                                                                                | **Text mode only**                | Editing a field in Visual mode changes the first language and leaves the others untouched                                           |
| `@use`, `/meta/`, `/i18n/`                                                                                                                                              | **Text mode only**                | Kept on save                                                                                                                        |

When a file has an error, only the rows the error touches are locked; the
rest stay editable. An error in `/option/`, `/role/`, `/block/`, `/prop/`,
`/page/` or `/title/` belongs to no row, so it locks nothing — fix those in
Text mode.
