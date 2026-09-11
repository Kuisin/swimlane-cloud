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

if (Approved?)
case (Yes) #green
  [sales: Ship it]
case () #red
  [sales: Send a rejection]
end-if

@end
```

- `/title/`, `/role/`, `/block/` and `/prop/` set up the diagram's title,
  who's involved, and any shared visual styles.
- `/line/` is the flow itself: steps in `[role: text]` form, plus `if`,
  `fork`, `section` and a handful of other flow keywords.

Closers are spelled `end-if`, `end-fork`, `end-section` and `end-branch`, and
an extra case is spelled `case (…)`, with a blank `case ()` for the one that
catches everything else — there is no `else`. The older `endif`, `endfork`
and `elseif` are no longer read: the editor reports the line and the
spelling to use instead.

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
line (`text.en: Text;`). See _Complete grammar_ below for the full rule.

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
list) and `updated` (`YYYY-MM-DD`) are the keys the app understands; any
other key is kept, unread.

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

| Key                                     | Values                                                                    | Default                    |
| --------------------------------------- | ------------------------------------------------------------------------- | -------------------------- |
| `show-left-gutter`, `show-right-gutter` | `true` / `false`                                                          | `true`                     |
| `show-header`, `show-footer`            | `true` / `false`                                                          | `true`                     |
| `show-description`                      | `true` / `false`                                                          | `true`                     |
| `show-step-block-captions`              | `true` / `false`                                                          | `true`                     |
| `merge-at-previous-block`               | `true` / `false`                                                          | `true`                     |
| `show-notes`, `auto-define`             | `true` / `false`                                                          | `true`                     |
| `branch-color-arrows`                   | `true` / `false`                                                          | `false`                    |
| `i18n-strict`, `i18n-uniform-layout`    | `true` / `false` — see _Multiple languages_                               | `false`                    |
| `show-gateway-icons`                    | `true` / `false` — the glyph inside an `if` diamond and a `fork` bar      | `true`                     |
| `block-margin`                          | a whole number of pixels, `0`–`80` — the gap around a step box            | `0`                        |
| `block-text`                            | `truncate` or `wrap` — what a too-long step text does                     | `truncate`                 |
| `i18n-storage`                          | `as-written`, `catalog` or `inline` — where a translated value is written | `as-written`               |
| `lane-order`                            | a comma-separated list of role ids — the drawing order of the lanes       | declaration order          |
| `left-title`, `left-subtitle`           | text — the left gutter's two headings                                     | `Procedure`, `Description` |
| `right-title`, `right-subtitle`         | text — the right gutter's two headings                                    | `Remark`, empty            |

`yes`/`on`/`1` and `no`/`off`/`0` are accepted for the switches. The four
headings may also be written in `/page/`; if both carry one, `/option/`
wins.

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

| Construct        | What it does                                                                                                                     | Example                     |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `if (question)`  | Opens a decision. `#color` is optional and colours the diamond                                                                   | `if (Approved?)`            |
| `case (label)`   | One outcome; `#color` is optional. A blank `case ()` is the catch-all — there is no `else`, and any number of cases may be blank | `case (Yes) #green`         |
| `end-if`         | Closes the decision                                                                                                              | `end-if`                    |
| `fork`           | Opens parallel paths. Its own optional label names path 1                                                                        | `fork #purple`              |
| `and (label)`    | Starts the next parallel path; the label is optional                                                                             | `and (Shipping)`            |
| `end-fork`       | Joins them                                                                                                                       | `end-fork`                  |
| `section (Name)` | Draws a labelled box around some steps; the flow is unchanged                                                                    | `section (Quotation) #gray` |
| `end-section`    | Closes it                                                                                                                        | `end-section`               |
| `branch (Name)`  | A side path: its first step isn't connected, its last rejoins after the close                                                    | `branch (Audit) #blue`      |
| `end-branch`     | Closes it                                                                                                                        | `end-branch`                |
| `phase (Name)`   | A horizontal band with its label in the left gutter; can hold complete `if`/`fork`/`section`/`branch` blocks                     | `phase (Quoting) #gray`     |
| `end-phase`      | Closes it                                                                                                                        | `end-phase`                 |

The ten colour names are `blue`, `green`, `red`, `orange`, `purple`,
`gray`, `black`, `pink`, `teal` and `yellow`.

### Jumps

There are no landing markers: a jump always names a node that is already
there. A step is named by its `id:` line, and a decision, fork, section,
branch or phase by the `@id` written on its opening line.

| Construct    | What it does                                                              | Example          |
| ------------ | ------------------------------------------------------------------------- | ---------------- |
| `[goto: id]` | From inside a case: continue at the step, decision or fork named `id`     | `[goto: closed]` |
| `loop`       | From inside a case: go back to the question of the nearest enclosing `if` | `loop`           |
| `loop @id`   | Go back to the decision or fork named `@id`                               | `loop @quote`    |

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
if (Approved?)
case (Yes)
  [sales: Ship it]
  [goto: closed]

case (Needs changes)
  [sales: Revise it]
  loop

case ()
  [sales: Reject it]
  [goto: closed]
end-if

[sales: Close the order]
  id: closed;

@end
```

### Spellings no longer read

Each of these is an error that names the replacement: `endif` → `end-if`,
`endfork` → `end-fork`, `elseif` → `else-if`, `section-start (n)` → `section (n)`,
`start-point` → `section`, `end-point` → `end-section`.

### Migrating an older file

A file written before this grammar — the plain `@kai-swimlane-v2` (or `2`)
header, `if (…) is (…) than` / `else-if … than` / `else`, `[loop]`, and a
step's `props:` / `arrow:` / `link:` property lines among them — is not read
here: there is one reader and no compatibility layer, so it fails on the
first old construct. The **Update DSL** action (under the project's edit
view) rewrites every diagram on a branch across in one commit: the header
becomes `@kai-swimlane`; `if (q) is (a) than` becomes `if (q)` followed by
`case (a)`; `else-if (b) than` becomes `case (b)`; `else` becomes a blank
`case ()`; `[loop]` becomes `loop`; `merge: id;` and `[merge: id]` become
`[goto: id]`; and a step's `props:` / `arrow:` / `link:` lines become the
suffixes `+prop`, an arrow glyph and `=> path`. A step's `id:` line is
already current and is left exactly as it is. Nothing else in the file
changes.

**One old construct has no automatic replacement: a jump with no target.**
A bare `merge;` or `[merge]` inside a case, and a `[merge]` / `[merge: name]`
landing marker in the flow, name nothing — and there are no landing markers
any more, so there is nothing to turn them into. Update DSL leaves those
lines untouched and the file then reports an error on each one. Fix them by
hand: give the step you wanted to land on an `id:` line, and write the jump
as `[goto: id]`.

## What Visual mode can and can't do

Text mode can express everything above. Visual mode covers most of it, and
anything it can't edit is still **kept** when you save from Visual mode
unless this table says otherwise.

| Feature                                                                                                                                                                 | In Visual mode                    | Notes                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Title, page description, header and footer slots                                                                                                                        | Editable                          | In **Settings**. A slot is hidden while its `show-…` switch is off                                                                  |
| Gutter headings                                                                                                                                                         | Editable                          | Left pair hidden while the left gutter is off, right pair while the right gutter is off                                             |
| `show-left-gutter`, `show-right-gutter`, `show-header`, `show-footer`, `show-description`, `show-step-block-captions`, `merge-at-previous-block`, `branch-color-arrows` | Editable                          | Checkboxes in **Settings**                                                                                                          |
| `show-gateway-icons`, `block-margin`, `block-text`, `show-notes`, `auto-define`, `i18n-strict`, `i18n-uniform-layout`, `i18n-storage`, `lane-order`                     | **Text mode only**                | No control yet; the values are preserved                                                                                            |
| Role, block and side-note definitions                                                                                                                                   | Editable                          | Every property, plus add and delete                                                                                                 |
| Renaming a definition's `<id>`                                                                                                                                          | **Text mode only**                | The id is shown but not editable                                                                                                    |
| Lane order                                                                                                                                                              | **Text mode only**                | Lanes appear in the order they're defined, unless `/option/ lane-order:` overrides it                                               |
| Add, edit, delete, reorder a step                                                                                                                                       | Editable                          | Up/down and **Move to…** stay inside the enclosing branch; drag can cross branches, and a drag that would break the file is refused |
| `<block>` on a step                                                                                                                                                     | Editable                          | With a visual picker                                                                                                                |
| `id:`, `label:`, `desc:`, `remark:`, `+prop`, arrow                                                                                                                     | Editable                          | Under **More options**                                                                                                              |
| `level:`                                                                                                                                                                | Yes                               | Numbering level, 1–9                                                                                                                |
| `=> path`                                                                                                                                                               | Yes                               | "Link to another flow" picks a file; the ↗ mark on the block opens it from the preview                                              |
| `skip;`                                                                                                                                                                 | **Text mode only**                | Kept on save                                                                                                                        |
| `remark-desc:`                                                                                                                                                          | **Text mode only**, and rewritten | Saving folds it into a single `remark:` — the text survives, the two-line form doesn't                                              |
| The spacer `[]`                                                                                                                                                         | Visible, deletable                | Can't be created or edited in Visual mode                                                                                           |
| `if` / `case`, the question, case labels, colours                                                                                                                       | Editable                          | Colours are swatches, not names                                                                                                     |
| `fork` / `and`                                                                                                                                                          | Insertable, colour editable       | A parallel path can carry a label in the grammar, but Visual mode doesn't expose a field for it yet — set one in Text mode          |
| `section` / `branch` / `phase`, name and colour                                                                                                                         | Editable                          | No way to turn one into another; `phase` is shown as a group but can only be created as a `section` or `branch`                     |
| `loop`, `loop @id`                                                                                                                                                      | Insertable only                   | Nothing to configure                                                                                                                |
| `[goto: id]`                                                                                                                                                            | Editable                          | The target is a dropdown of the steps that carry an `id:`                                                                           |
| Comments                                                                                                                                                                | **Text mode only**, and fragile   | Kept on save, but not shown anywhere in Visual mode, and deleting a step deletes the comments attached to it                        |
| An unrecognised `/option/` key                                                                                                                                          | **Dropped**                       | It's reported as an error, and a Visual-mode save removes the line                                                                  |
| Per-language values (`@lang`, inline `\|` segments, `field.lang:` lines)                                                                                                | **Text mode only**                | Editing a field in Visual mode changes the first language and leaves the others untouched                                           |
| `@use`, `/meta/`                                                                                                                                                        | **Text mode only**                | Kept on save                                                                                                                        |

When a file has an error, only the rows the error touches are locked; the
rest stay editable. An error in `/option/`, `/role/`, `/block/`, `/prop/`,
`/page/` or `/title/` belongs to no row, so it locks nothing — fix those in
Text mode.
