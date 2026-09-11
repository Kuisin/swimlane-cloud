# Editing a diagram: Text mode

Text mode is the underlying language a diagram is written in — every
diagram, however it was created, is really just this text. Switching to it
never loses anything you did in Visual mode, and switching back doesn't
lose anything you typed here.

## The shape of it

```
@kai-swimlane

/title/
Order approval

/role/
<sales>
label: Sales;

/line/
[sales: Take the order]

if (Approved?) is (yes) than
[sales: Ship it]
else
[sales: Send a rejection]
end-if

@end
```

- `/title/`, `/role/`, `/block/` and `/prop/` set up the diagram's title,
  who's involved, and any shared visual styles.
- `/line/` is the flow itself: steps in `[role: text]` form, plus `if`,
  `fork`, `section` and a handful of other flow keywords.

Closers are spelled `end-if`, `end-fork`, `end-section` and `end-branch`, and
an extra case is `else-if`. The older `endif`, `endfork` and `elseif` are no
longer read: the editor reports the line and the spelling to use instead.

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
line (`text.en: Text;`). This is a version 2 feature — see _Two versions of
the language_ below.

## Importing shared pieces

`@use ./shared-roles.txt;` merges another file's roles, blocks, styles and
side-note definitions into this one, so a set of roles or a house style only
has to be defined once and reused across diagrams. This too is version 2.
See [Reusable templates](?section=templates) for the version of this that's
managed for you, without writing `@use` by hand.

## Two versions of the language

The very first line decides which grammar the file is read with:

- `@kai-swimlane` — **version 1**. This is what a new diagram and every
  starter template are written in, and everything in _Complete grammar_
  below describes it.
- `@kai-swimlane-v2` — **version 2**. Same sections and the same
  `[role: text]` steps, but whitespace stops mattering, `if` loses its
  `is (…) than`, `else` becomes a blank `case ()`, and `@lang`, `@use`,
  `phase`, notes and links become available. A file only becomes version 2
  when you convert it or write the `-v2` header yourself.

Both are fully supported; nothing forces an existing diagram to move.

## Complete grammar

Everything version 1 accepts, section by section. A property line always
ends in `;`. Indentation is decoration — the parser ignores it — and a line
starting with `//` is a comment.

### The file

| Construct      | What it does                                                                                                          | Example               |
| -------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Header         | Opens the diagram and picks the grammar                                                                               | `@kai-swimlane`       |
| `@end`         | Ends the diagram; anything after it is ignored                                                                        | `@end`                |
| Section marker | Opens a section. The seven are `/page/`, `/title/`, `/option/`, `/role/`, `/block/`, `/prop/`, `/line/`, in any order | `/line/`              |
| Comment        | A whole-line note. `***` also works. Only comments inside `/line/` are kept when the file is saved                    | `// checked by legal` |

### `/title/` and `/page/`

| Construct                   | What it does                                                                                | Example                     |
| --------------------------- | ------------------------------------------------------------------------------------------- | --------------------------- |
| Title                       | Free text, no `;`. Several lines join with a space                                          | `Order approval`            |
| `description:`              | The text under the title                                                                    | `description: End to end;`  |
| `header-left/center/right:` | The three page-header slots                                                                 | `header-center: Rev. 3;`    |
| `footer-left/center/right:` | The three page-footer slots                                                                 | `footer-right: 2026-09-06;` |
| Long values                 | Any `/page/` or step text property can run over several lines between three-backtick fences | see _Step properties_       |

### `/option/`

Nine on/off switches, two settings and the four gutter headings. Anything
you don't write keeps its default.

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
| `left-title`, `left-subtitle`           | text — the left gutter's two headings                                | `Procedure`, `Description` |
| `right-title`, `right-subtitle`         | text — the right gutter's two headings                               | `Remark`, empty            |

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

`shape` is one of `rounded`, `rect`, `note`, `hex`, `if`, `subroutine`,
`ellipse`, `cloud`. An `icon` starting with `#` is an icon name
(`icon: #user;`); anything else — an emoji, a letter — is shown as-is. A
key none of these know is kept in the file and simply not drawn, and a role,
block or side note used but never defined is created for you.

```
@kai-swimlane

/title/
Definitions

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
[sales: Draft the quote] <gateway>
props: RQ;

@end
```

### Steps

| Construct       | What it does                                        | Example                    |
| --------------- | --------------------------------------------------- | -------------------------- |
| Step            | One box in the `sales` lane                         | `[sales: Draft the quote]` |
| Style reference | Uses a `/block/` style. Only at the end of the line | `[sales: Draft] <gateway>` |
| Empty step      | A blank row, never numbered                         | `:`                        |

The role id is letters, digits, `_` and `-`; the text may contain anything,
colons included.

### Step properties

Each goes on its own line under the step it belongs to.

| Construct      | What it does                                                                           | Example                            |
| -------------- | -------------------------------------------------------------------------------------- | ---------------------------------- |
| `id:`          | Names the step so a merge can point at it                                              | `id: closed;`                      |
| `label:`       | The caption in the left gutter (the box text stays as it is)                           | `label: Draft;`                    |
| `desc:`        | The description column                                                                 | `desc: Check the requirements;`    |
| `remark:`      | The remark column                                                                      | `remark: Approval above 1M;`       |
| `remark-desc:` | A second paragraph appended to `remark:`                                               | `remark-desc: Manager signs off.;` |
| `skip;`        | Leaves this step out of the numbering                                                  | `skip;`                            |
| `level:`       | How deep the step sits in the numbering, `1`–`9`                                       | `level: 2;`                        |
| `link:`        | Opens another flow: a path relative to this file, or `/` from the diagrams root        | `link: ../ops/pick.md;`            |
| `props:`       | The side-note chips on this step                                                       | `props: RQ, LG;`                   |
| `arrow:`       | The line style leaving this step: `solid`, `dashed`, `dotted`, `long-dash`, `dash-dot` | `arrow: dashed;`                   |

Numbering counts the steps that have a lane and no `skip;`. `level:` nests
them: level 1 counts 1, 2, 3; a level-2 step after 2 becomes 2-1, then 2-2;
a level-3 step after that is 2-2-1.

A long `desc:` or `remark:` can be written over several lines:

````
@kai-swimlane

/title/
Long values

/line/
[sales: Draft the quote]
desc: ```
Check the customer requirements,
then draft the quote.
```;

@end
````

### Flow

| Construct        | What it does                                                                         | Example                                |
| ---------------- | ------------------------------------------------------------------------------------ | -------------------------------------- |
| `if … is … than` | Opens a decision; the second bracket is the first case's label. `#color` is optional | `if (Approved?) is (yes) than #green`  |
| `else-if … than` | Another named case                                                                   | `else-if (needs changes) than #orange` |
| `else`           | The remaining case                                                                   | `else`                                 |
| `end-if`         | Closes the decision                                                                  | `end-if`                               |
| `fork`           | Opens parallel paths                                                                 | `fork #purple`                         |
| `and`            | Starts the next parallel path                                                        | `and`                                  |
| `end-fork`       | Joins them                                                                           | `end-fork`                             |
| `section (Name)` | Draws a labelled box around some steps; the flow is unchanged                        | `section (Quotation) #gray`            |
| `end-section`    | Closes it                                                                            | `end-section`                          |
| `branch (Name)`  | A side path: its first step isn't connected, its last rejoins after the close        | `branch (Audit) #blue`                 |
| `end-branch`     | Closes it                                                                            | `end-branch`                           |

The ten colour names are `blue`, `green`, `red`, `orange`, `purple`,
`gray`, `black`, `pink`, `teal` and `yellow`.

### Jumps and landing points

| Construct       | What it does                                                            | Example          |
| --------------- | ----------------------------------------------------------------------- | ---------------- |
| `[merge]`       | A landing point in the main flow                                        | `[merge]`        |
| `[merge: name]` | A _named_ landing point                                                 | `[merge: join]`  |
| `merge;`        | From inside a case: continue at the first landing point after this `if` | `merge;`         |
| `merge: name;`  | From inside a case: continue at that step `id:` or named landing point  | `merge: closed;` |
| `[loop]`        | From inside a case: go back to the question                             | `[loop]`         |

```
@kai-swimlane

/title/
Jumps

/role/
<sales>
label: Sales;

/line/
if (Approved?) is (yes) than
[sales: Ship it]
merge;

else-if (needs changes) than
[sales: Revise it]
[loop]

else
[sales: Reject it]
merge: closed;

end-if

[merge: join]

[sales: Close the order]
id: closed;

@end
```

### Spellings no longer read

Each of these is an error that names the replacement: `endif` → `end-if`,
`endfork` → `end-fork`, `elseif` → `else-if`, `section-start (n)` → `section (n)`,
`start-point` → `section`, `end-point` → `end-section`.

### What version 2 changes

Only the parts you'd notice: `if [lane] (Approved?)` followed by
`case (yes)` instead of `if (…) is (…) than` and `else-if`; a blank
`case ()` instead of `else`; `goto` / `goto @id` / `loop` / `loop @id`
instead of `merge;`, `merge: id;` and `[loop]`; `merge` and `merge @name`
instead of `[merge]`; `[]` instead of a lone `:`; the suffixes `@id`,
`+prop` and `~>` instead of the `id:`, `props:` and `arrow:` lines; plus
`@lang`, `@use`, `/meta/`, `phase`, notes and `=> link`, which version 1
has no equivalent for. Everything else — the sections, `/option/`,
definitions, `[role: text]`, `desc:`, `remark:`, `skip;`, `level:` — is the
same in both.

## What Visual mode can and can't do

Text mode can express everything above. Visual mode covers most of it, and
anything it can't edit is still **kept** when you save from Visual mode
unless this table says otherwise.

| Feature                                                                                                                                                                 | In Visual mode                    | Notes                                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Title, page description, header and footer slots                                                                                                                        | Editable                          | In **Settings**. A slot is hidden while its `show-…` switch is off                                                                  |
| Gutter headings                                                                                                                                                         | Editable                          | Left pair hidden while the left gutter is off, right pair while the right gutter is off                                             |
| `show-left-gutter`, `show-right-gutter`, `show-header`, `show-footer`, `show-description`, `show-step-block-captions`, `merge-at-previous-block`, `branch-color-arrows` | Editable                          | Checkboxes in **Settings**                                                                                                          |
| `show-gateway-icons`, `block-margin`, `block-text`                                                                                                                      | **Text mode only**                | No control yet; the values are preserved                                                                                            |
| Role, block and side-note definitions                                                                                                                                   | Editable                          | Every property, plus add and delete                                                                                                 |
| Renaming a definition's `<id>`                                                                                                                                          | **Text mode only**                | The id is shown but not editable                                                                                                    |
| Lane order                                                                                                                                                              | **Text mode only**                | Lanes appear in the order they're defined                                                                                           |
| Add, edit, delete, reorder a step                                                                                                                                       | Editable                          | Up/down and **Move to…** stay inside the enclosing branch; drag can cross branches, and a drag that would break the file is refused |
| `<block>` on a step                                                                                                                                                     | Editable                          | With a visual picker                                                                                                                |
| `id:`, `label:`, `desc:`, `remark:`, `props:`, `arrow:`                                                                                                                 | Editable                          | Under **More options**                                                                                                              |
| `level:`                                                                                                                                                                | Yes                               | Numbering level, 1–9                                                                                                                |
| `link:`                                                                                                                                                                 | Yes                               | "Link to another flow" picks a file; the ↗ mark on the block opens it from the preview                                              |
| `skip;`                                                                                                                                                                 | **Text mode only**                | Kept on save                                                                                                                        |
| `remark-desc:`                                                                                                                                                          | **Text mode only**, and rewritten | Saving folds it into a single `remark:` — the text survives, the two-line form doesn't                                              |
| The empty `:` row                                                                                                                                                       | Visible, deletable                | Can't be created or edited in Visual mode                                                                                           |
| `if` / `else-if` / `else`, the question, case labels, colours                                                                                                           | Editable                          | Colours are swatches, not names                                                                                                     |
| `fork` / `and`                                                                                                                                                          | Insertable, colour editable       | Parallel paths carry no label in version 1, so there's nothing else to edit                                                         |
| `section` / `branch`, name and colour                                                                                                                                   | Editable                          | No way to turn one into the other                                                                                                   |
| `[loop]`                                                                                                                                                                | Insertable only                   | Nothing to configure                                                                                                                |
| `merge;`, `merge: id;`, `[merge]`, `[merge: name]`                                                                                                                      | Editable                          | The target is a dropdown of the ids that exist                                                                                      |
| Comments                                                                                                                                                                | **Text mode only**, and fragile   | Kept on save, but not shown anywhere in Visual mode, and deleting a step deletes the comments attached to it                        |
| An unrecognised `/option/` key                                                                                                                                          | **Dropped**                       | It's reported as an error, and a Visual-mode save removes the line                                                                  |
| Version 2 per-language values                                                                                                                                           | **Text mode only**                | Editing a field in Visual mode changes the first language and leaves the others untouched                                           |
| Version 2 `@use`, `=> link`                                                                                                                                             | **Text mode only**                | Kept on save                                                                                                                        |
| Version 2 `phase`                                                                                                                                                       | Partly                            | Name and colour are editable — it's shown as a group — but only `section` and `branch` can be created                               |

When a file has an error, only the rows the error touches are locked; the
rest stay editable. An error in `/option/`, `/role/`, `/block/`, `/prop/`,
`/page/` or `/title/` belongs to no row, so it locks nothing — fix those in
Text mode.
