# Documents (.md files)

A diagram can be stored as a `.md` file instead of a plain `.txt`. It looks
like this:

````
---
owner: sales-ops
status: review
---

Anything you want to say about this diagram goes here, as ordinary prose.

```kai-swimlane
@kai-swimlane
...
```
````

- The **frontmatter** at the top (between the `---` lines) is metadata —
  owner, status, tags, whatever your project uses.
- The **fenced block** holds the diagram itself, exactly as in a plain
  `.txt` file.
- Everything else is prose you're free to write, right in the same file as
  the diagram it documents.

## Diagram and Document are two views of the same file

Opening a `.md` file gives you a toggle:

- **Diagram** — the same Visual/Text editor as a `.txt` file. It only ever
  sees the diagram inside the fence.
- **Document** — a rich-text editor for the prose and a small form for the
  frontmatter. This is the only place metadata is editable outside Text
  mode.

Editing in Document mode never touches the diagram, and editing the diagram
never touches your prose or metadata — the two are kept completely apart,
even though they live in the same file. A `.md` file with no diagram in it
yet (just prose) opens straight into Document.

## Converting an existing project

If a project still has diagrams stored as `.txt`, its edit page offers
**Convert to Markdown**. It rewrites every one of them to `.md` — moving
metadata into frontmatter and the diagram into a fence — **in a single
commit**, so it reviews like any other change and can be undone with one
revert. Diagrams that import each other are repointed automatically so
nothing breaks. New projects use `.md` from the start.
