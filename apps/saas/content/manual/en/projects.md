# Projects

A **project** in Swimlane Cloud is just a GitHub (or GitLab) repository.
There is no separate "create a project" step that copies anything —
Swimlane Cloud reads and writes the repository directly, using your own
account's permissions.

## How a repository becomes a project

A repository shows up on your Dashboard once it carries the topic
**`swimlane`**. You can:

- **Create new** — Swimlane Cloud creates a private repository for you,
  seeds it with an example diagram and a `.swimlane.json` config file, and
  tags it automatically.
- **Mark existing** — pick a repository you already own or have push access
  to. Swimlane Cloud adds `.swimlane.json` to it (if it isn't there yet) and
  tags it, without touching anything else already in the repository.

`.swimlane.json` just names which folder holds diagrams (`diagrams` by
default) — the rest of the repository is yours to use however you like.

## Roles come from GitHub, not from Swimlane Cloud

There is no separate permissions system to manage. Your role on a project is
read from your GitHub permission on the repository, every time:

| GitHub permission | Role in Swimlane Cloud | Can do                                         |
| ----------------- | ---------------------- | ---------------------------------------------- |
| Admin             | **Owner**              | Everything, including templates and publishing |
| Push              | **Editor**             | Edit diagrams, push, request review            |
| Pull (read)       | **Viewer**             | Read diagrams, browse history                  |

Change someone's access on GitHub and it takes effect here immediately —
there's nothing to sync.

## Nothing lives only in Swimlane Cloud

The diagrams themselves are files in your repository. If you stopped using
Swimlane Cloud tomorrow, every diagram would still be there, readable as
plain text. What Swimlane Cloud keeps in its own database is small and
disposable: your autosaved drafts before you push, version snapshots for
fast rendering, reusable templates, and an activity log — none of it is the
source of truth for your diagrams.
