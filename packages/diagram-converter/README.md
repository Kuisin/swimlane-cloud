# @swimlane-cloud/diagram-converter

The pure-JavaScript diagram converter for the kai-swimlane DSL. It parses the
DSL and renders **SVG/HTML as strings** with zero runtime dependencies — no
React, no DOM. The same code runs in two places (per the build plan):

- **Browser** — live preview as the user types (no server round-trip).
- **Node** — server-side render when flagging a version or generating SVG
  artifacts.

This package is the `render-pure` engine extracted verbatim from
`@kai-swimlane/core` in the `swimlane-app` monorepo. The React renderers,
markdown components, and the `lucide-react` icon registry were intentionally
left behind — only the dependency-free converter and the modules it needs were
imported.

## Usage

```js
import { textToSvg } from "@swimlane-cloud/diagram-converter";

const svg = textToSvg(dslText); // -> SVG markup string
```

Other exports from the main entry point:

| Export                                                      | Purpose                                  |
| ----------------------------------------------------------- | ---------------------------------------- |
| `textToSvg(dsl, options?)`                                  | DSL string → full SVG diagram string     |
| `renderDiagramSvg(...)`                                     | Lower-level: parsed diagram → SVG string |
| `renderStepShape` / `renderBlockIcon`                       | Render individual pieces                 |
| `renderPartsPreviewHtml` / `renderTemplatePartsPreviewHtml` | Parts/template galleries as HTML strings |
| `BRANCH_COLOR_STYLES`                                       | Branch color style constants             |

Subpath exports for working with the DSL directly:

```js
import { parseDSL } from "@swimlane-cloud/diagram-converter/parser";
import { THEMES } from "@swimlane-cloud/diagram-converter/themes";
import { resolveDiagramOptions } from "@swimlane-cloud/diagram-converter/diagram-options";
```

## Layout

```
src/
  parser.js, themes.js, diagram-options.js,
  utils.js, arrow-line.js, branch-rows.js, group-rows.js   # shared pure modules
  render-pure/
    index.js          # public barrel (package "." entry)
    text-to-svg.js     # DSL -> SVG string
    diagram.js, step-shape.js, block-icon.js, svg-utils.js, html-utils.js,
    icon-paths.js, parts-preview-core.js, parts-preview-static.js,
    template-parts-preview.js
```

The directory structure mirrors the source package so every relative import
resolves unchanged.

## Tests

```bash
pnpm install   # or npm install — provides vitest
pnpm test
```

Only the React-independent tests were carried over (`forks`, `merge`,
`options`, `remark-gutter`, `terminals`, and the native-ESM import check). The
parity test against the React renderer was excluded along with React itself.
