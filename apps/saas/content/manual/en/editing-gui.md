# Editing a diagram: Visual mode

Visual mode is a step list plus a form — no syntax to learn. It's the
default for anyone opening a diagram for the first time.

## Adding a step

Use **Add step** to append to the flow, or the insert button between two
existing steps to slot one in between. A new step needs only two things:
**who does it** (the role) and **what they do** (the text). Everything else
— description, remark, a landing-point name, side notes, look/style — is
tucked under **More options**, so the common case stays a two-field form.

## Branching, parallel paths, groups and side paths

The **Add** menu groups the less obvious choices by what they actually do,
not by their DSL keyword:

- **One path only** — an If/else, or a Switch with several named cases. Only
  one path is taken.
- **All paths at once** — a Parallel split. Every path runs, and (optionally)
  rejoins.
- **Visual only** — a Group box. Purely a label around some steps; the flow
  through them doesn't change.
- **Side path** — splits off and rejoins the main flow later at a named
  point you choose from a dropdown, rather than typing an id by hand.

Branches and groups also get a plain highlight-color picker (swatches, not
color names) instead of a text field.

## Undo and redo

Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z work throughout — typing coalesces into one
undo step, while structural changes (adding a branch, deleting a step) are
each their own step.

## If a diagram has a syntax problem

Opening a diagram that already has an error doesn't lock you out of Visual
mode. The specific step or line with the problem is locked and shown with a
notice; every other step is still editable. Switch to Text mode to fix the
one broken line.

## Starting from a blank diagram

A brand-new diagram offers a few starter templates (a simple approval, a
yes/no decision, parallel tasks) so you're never staring at an empty canvas
— or skip them and start from a single blank step.

## Diagrams in more than one language

If a diagram declares more than one language, a small language tab appears
above translatable fields (a step's text, a condition, a role's label) so
you can see and edit each language's version of that field without leaving
Visual mode.
