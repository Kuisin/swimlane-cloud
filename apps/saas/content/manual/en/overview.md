# Welcome to Swimlane Cloud

Swimlane Cloud is a place to draw and maintain **business-flow diagrams** —
swimlane charts with roles, steps, decisions and parallel paths — that live
as plain text files in **your own GitHub or GitLab repository**. There is no
separate database of diagrams to fall out of sync: the repository is the
diagram, and everything you do here is a normal commit, branch or pull
request underneath.

## The shortest path

1. Open a repository from your **Dashboard** — any repo tagged `swimlane`
   shows up automatically.
2. Click **Start editing**. This creates a personal edit branch for you; you
   never edit `main` or `preview` directly.
3. Edit a diagram in **Visual mode** (no syntax to learn) or **Text mode**
   (the full DSL, for people who want it).
4. **Push to GitHub** turns your changes into one commit. **Request review**
   opens a pull request into `preview`.
5. Once approved and merged, **Publish** tags a version and promotes it to
   `main`.

Everything below expands on one of these steps.

## What's in this manual

- **[Projects](?section=projects)** — how a repository becomes a project, and what roles mean.
- **[Branches & workflow](?section=branches)** — `main` / `preview` / edit branches, and why you never edit the first two directly.
- **[Editing a diagram: Visual mode](?section=editing-gui)** — the form-based editor, for anyone who doesn't want to learn syntax.
- **[Editing a diagram: Text mode](?section=editing-text)** — the underlying DSL, for people who want direct control.
- **[Documents (.md files)](?section=documents)** — diagrams with notes and metadata around them.
- **[Editing on mobile](?section=mobile)** — a step-by-step view built for phones.
- **[Reusable templates](?section=templates)** — shared roles, styles and side-notes across every diagram in a project.
- **[Versions & publishing](?section=versions)** — tagging a release and promoting it to `main`.
- **[Review & pull requests](?section=pull-requests)** — how changes get reviewed before they land.
- **[Public sharing](?section=sharing)** — read-only links for people without an account.
