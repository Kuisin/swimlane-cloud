# @swimlane-cloud/mobile-view

A **separate**, mobile-first renderer for kai-swimlane diagrams. Instead of the
wide horizontal SVG swimlane (hard to use on phones), it converts the engine's
parsed model into a **vertical, card-based** React tree: steps are cards with a
lane chip, branches/cases nest as labeled sections, groups/loops/merges render
as their own blocks.

Kept independent of the SVG renderer and the desktop editor on purpose — it's
the intended base for a future **mobile editor**.

```jsx
import { MobileDiagram } from "@swimlane-cloud/mobile-view";
import "@swimlane-cloud/mobile-view/styles.css";

<MobileDiagram dsl={dslString} />   // or <MobileDiagram model={parsedModel} />
```

## Exports
- `MobileDiagram` — the React component (read-only for now).
- `buildMobileTree(model)` — flat parsed model → nested `{ title, lanes, nodes }`.
- `dslToMobile(dsl)` — `{ model, tree }` convenience.
- `roleColor(lane)` / `toColor(value)` — color helpers.

## Node shape (from `buildMobileTree`)
```
step   { role, text, description, remark, props[], blockRef, arrowLine, mergeId }
branch { parallel, cond, cases: [{ label, color, children[] }] }
group  { mode: "section"|"branch", name, children[] }
loop   {}
merge  { target }
```

Self-contained CSS (`sw-m-` prefixed), no Tailwind dependency.
