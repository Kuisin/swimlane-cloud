# Reusable templates

If every diagram in a project uses the same roles, the same block styles, or
the same side-note text, you don't have to redefine them in every file.
**Templates** (project owners only, under **Settings → Templates**) let you
define a role, block style or side-note once and reuse it everywhere.

## Editing a template

A template is edited the same way as a diagram fragment — as a small piece
of Visual-mode form, or as raw DSL. Changing one doesn't rewrite every
diagram that uses it; instead, each diagram references the template by
name, and picks up the current definition automatically.

## Saving a template change

Because `preview` is never edited directly (see
[Branches & workflow](?section=branches)), a template change goes through a
short-lived pull request and merge automatically when you save it — you
don't have to do anything extra to make that happen.

## Forcing a template on every diagram

A project can require that every diagram in a given section (say, every
`/role/` section) must use a specific template — so nobody accidentally
defines a one-off role that doesn't match the house style. If a diagram
doesn't follow the required template, saving it in Text mode will flag
exactly what's missing.
