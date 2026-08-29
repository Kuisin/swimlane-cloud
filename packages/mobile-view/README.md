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

<MobileDiagram dsl={dslString} />; // or <MobileDiagram model={parsedModel} />
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

## Styling

The presentation (`MobileDiagram.jsx`) is styled with **Tailwind** utility classes
and ships no stylesheet. The consuming app must run Tailwind (with Preflight) and
include this package in its content scan — e.g. in the app's CSS:

```css
@source "../../../packages/mobile-view/src";
```

The model layer (`mobile-model.js`) stays pure, framework-agnostic JS.
