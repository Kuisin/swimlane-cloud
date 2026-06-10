import { describe, expect, it } from "vitest";
import { parseDSL } from "../parser.js";
import { THEMES } from "../themes.js";
import { renderDiagramSvg } from "./diagram.js";
import { stringDisplayColumnWidth } from "../utils.js";
import { DIAGRAM_LAYOUT, gutterTextCols } from "./diagram-layout.js";

const theme = THEMES.basic;
const L = DIAGRAM_LAYOUT;

const render = (dsl) =>
  renderDiagramSvg({ model: parseDSL(dsl), theme, showStepBlockCaptions: false });

/** Horizontal px available for text inside a gutter (inner pad on both sides). */
const usablePx = (gutterWidth) => gutterWidth - 2 * L.gutterInnerPad;

const unescapeXml = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");

/**
 * Find the <text> element whose (tag-stripped) content contains `marker`.
 * Returns its font size and inner markup.
 */
function findTextElement(svg, marker) {
  const re = /<text\b[^>]*font-size="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g;
  let m;
  while ((m = re.exec(svg))) {
    const plain = unescapeXml(m[2].replace(/<[^>]*>/g, ""));
    if (plain.includes(marker)) return { fontSize: Number(m[1]), content: m[2] };
  }
  return null;
}

/**
 * Split a <text> element's inner markup into visual lines. Wrapped gutter text
 * emits one <tspan x=...> per visual line (style runs are nested tspans
 * without x); unwrapped text is a single line.
 */
function visualLines(content) {
  const chunks = content.split(/<tspan(?=[^>]*\bx=")/).slice(1);
  if (chunks.length === 0) {
    return [unescapeXml(content.replace(/<[^>]*>/g, ""))];
  }
  return chunks.map((c) =>
    unescapeXml(c.replace(/^[^>]*>/, "").replace(/<[^>]*>/g, ""))
  );
}

/** Estimated rendered px width of the widest visual line of a text element. */
function maxLinePx(svg, marker) {
  const el = findTextElement(svg, marker);
  expect(el, `text element containing ${JSON.stringify(marker)}`).toBeTruthy();
  return {
    px: Math.max(
      ...visualLines(el.content).map(
        (line) => stringDisplayColumnWidth(line) * el.fontSize
      )
    ),
    lines: visualLines(el.content),
  };
}

const stepDsl = ({ label = "提出", desc, remark, page = "" }) => `@kai-swimlane
/page/
left-title: 手順;
left-subtitle: 説明;
right-title: 備考;
${page}
/role/
<a>
label: 申請者;
/line/
[a: s1]
label: ${label};
${desc ? `desc: ${desc};` : ""}
${remark ? `remark: ${remark};` : ""}
@end`;

describe("gutter column budgets", () => {
  it("derives wrap columns from gutter pixel width and font size", () => {
    const cols = gutterTextCols(L.leftGutterWidth, L.gutterBodyFontSize);
    expect(cols * L.gutterBodyFontSize).toBeLessThanOrEqual(usablePx(L.leftGutterWidth));
    const rCols = gutterTextCols(L.rightGutterWidth, L.gutterBodyFontSize);
    expect(rCols * L.gutterBodyFontSize).toBeLessThanOrEqual(usablePx(L.rightGutterWidth));
  });
});

describe("remark text wraps within the right gutter", () => {
  const budget = usablePx(L.rightGutterWidth);

  const cases = [
    ["long CJK", "この備考はとても長い文章で右側の列の幅を超えないように必ず折り返して表示される必要があります"],
    ["long ASCII uppercase", "APPROVAL REQUIRED FROM DEPARTMENT MANAGER BEFORE SUBMITTING THE REQUEST TO HEAD OFFICE"],
    ["long ASCII lowercase", "approval required from department manager before submitting the request to head office"],
    ["mixed CJK/ASCII", "承認後にSAPシステムへ自動連携されます RFC INTERFACE Workflow番号を必ず控えてください"],
    ["unspaced token", "INTERFACE_RFC_Z_APPROVAL_WORKFLOW_0042_PRODUCTION_FALLBACK_HANDLER_LONG_IDENTIFIER"],
  ];

  for (const [name, remark] of cases) {
    it(`${name}: every wrapped line fits and no text is lost`, () => {
      const svg = render(stepDsl({ remark }));
      const marker = remark.slice(0, 8);
      const { px, lines } = maxLinePx(svg, marker);
      expect(px).toBeLessThanOrEqual(budget);
      expect(lines.length).toBeGreaterThan(1); // wrapped, not truncated
      expect(lines.join("")).toBe(remark); // wrap preserves full text
    });
  }
});

describe("description text wraps within the left gutter", () => {
  const budget = usablePx(L.leftGutterWidth);

  const cases = [
    ["long CJK", "この説明はとても長い文章で左側の説明列の幅を超えないように必ず折り返して表示される必要がありますので確認してください"],
    ["long ASCII", "this description is a very long sentence that must wrap inside the left description gutter without overflowing the column border"],
  ];

  for (const [name, desc] of cases) {
    it(`${name}: every wrapped line fits and no text is lost`, () => {
      const svg = render(stepDsl({ desc }));
      const marker = desc.slice(0, 8);
      const { px, lines } = maxLinePx(svg, marker);
      expect(px).toBeLessThanOrEqual(budget);
      expect(lines.length).toBeGreaterThan(1);
      expect(lines.join("")).toBe(desc);
    });
  }
});

describe("gutter titles truncate within their column", () => {
  it("step title (with numbering prefix) fits the left gutter", () => {
    const label = "とても長いステップ名で左の手順列の幅を確実に超える長さのラベルです";
    const svg = render(stepDsl({ label }));
    const { px } = maxLinePx(svg, label.slice(0, 6));
    expect(px).toBeLessThanOrEqual(usablePx(L.leftGutterWidth));
  });

  it("left header title/subtitle fit the left gutter", () => {
    const svg = render(
      stepDsl({
        remark: "x",
        page:
          "left-title: 非常に長い手順列ヘッダータイトルで幅を超えるもの;\nleft-subtitle: 非常に長い説明列サブタイトルで幅を超えるもの確認用;",
      })
    );
    expect(maxLinePx(svg, "非常に長い手順").px).toBeLessThanOrEqual(usablePx(L.leftGutterWidth));
    expect(maxLinePx(svg, "非常に長い説明").px).toBeLessThanOrEqual(usablePx(L.leftGutterWidth));
  });

  it("right header title/subtitle fit the right gutter", () => {
    const svg = render(
      stepDsl({
        remark: "x",
        page:
          "right-title: 非常に長い備考列ヘッダータイトルで幅を超えるもの;\nright-subtitle: 非常に長い備考列サブタイトルで幅を超えるもの確認用;",
      })
    );
    expect(maxLinePx(svg, "非常に長い備考列ヘッダー").px).toBeLessThanOrEqual(
      usablePx(L.rightGutterWidth)
    );
    expect(maxLinePx(svg, "非常に長い備考列サブ").px).toBeLessThanOrEqual(
      usablePx(L.rightGutterWidth)
    );
  });
});
