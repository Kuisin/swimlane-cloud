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
if (approved?)
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

The editor writes `end-if`, `end-fork` and `else-if`. Existing files that still
use the older `endif`, `endfork` or `elseif` spellings keep reading and
working exactly as before — only newly formatted or saved files switch to
the new spelling.

## The full syntax reference is one click away

Press the **?** button (or the keyboard shortcut it shows) while editing.
It opens a complete, searchable reference for every keyword, property and
example — this manual intentionally doesn't repeat all of it here.

## Format

The **Format** button rewrites the file into its canonical, consistently
indented form without changing what it means. It's disabled while the file
has an error, so you always know whether what you're looking at is valid.

## Multiple languages in one file

A diagram can declare more than one content language with `@lang`
(for example `@lang ja, en;`), after which any translatable text can carry
every language either inline (`テキスト | Text`) or as a separate tagged
line (`text.en: Text;`). You don't need Text mode to use this — see
[Editing a diagram: Visual mode](?section=editing-gui) for the language tabs
that make each field editable per language.

## Importing shared pieces

`@use ./shared-roles.txt;` merges another file's roles, blocks, styles and
side-note definitions into this one, so a set of roles or a house style only
has to be defined once and reused across diagrams. See
[Reusable templates](?section=templates) for the version of this that's
managed for you, without writing `@use` by hand.
