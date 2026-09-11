import { describe, expect, it } from "vitest";
import { parseDSL } from "./parser.js";
import { THEMES } from "./themes.js";
import { renderDiagramSvg } from "./render-pure/diagram.js";
import { textToSvg } from "./render-pure/text-to-svg.js";
import { relativeLinkPath, resolveLinkPath } from "./link-path.js";

const v1 = (body) => `@kai-swimlane
/role/
<a>
label: A;
/line/
${body}
@end
`;

describe("resolveLinkPath / relativeLinkPath", () => {
  it("resolves a link relative to the file it is in, or from the root with /", () => {
    expect(resolveLinkPath("../sales/order.md", "ops/pick.md")).toBe("sales/order.md");
    expect(resolveLinkPath("pack.md", "ops/pick.md")).toBe("ops/pack.md");
    expect(resolveLinkPath("./pack.md", "ops/pick.md")).toBe("ops/pack.md");
    expect(resolveLinkPath("/sales/order.md", "ops/deep/pick.md")).toBe("sales/order.md");
    expect(resolveLinkPath("order.md", "top.md")).toBe("order.md");
  });

  it("refuses a link that climbs out of the repository", () => {
    expect(resolveLinkPath("../../x.md", "ops/pick.md")).toBeNull();
    expect(resolveLinkPath("", "ops/pick.md")).toBeNull();
  });

  it("writes the shortest relative form, and the two are inverses", () => {
    const cases = [
      ["sales/order.md", "ops/pick.md", "../sales/order.md"],
      ["ops/pack.md", "ops/pick.md", "pack.md"],
      ["ops/sub/deep.md", "ops/pick.md", "sub/deep.md"],
      ["top.md", "ops/deep/pick.md", "../../top.md"],
      ["a/b/c.md", "a/b/c.md", "c.md"],
    ];
    for (const [target, from, expected] of cases) {
      expect(relativeLinkPath(target, from), `${target} from ${from}`).toBe(expected);
      expect(resolveLinkPath(expected, from)).toBe(target);
    }
  });
});

describe("a step that links to another flow", () => {
  it("reads `link:` in v1 and `=> path` in v2 onto the same field", () => {
    const one = parseDSL(v1(`[a: pick]\nlink: ../sales/order.md;`));
    expect(one.errors).toEqual([]);
    expect(one.rows[0].link).toBe("../sales/order.md");

    const two = parseDSL(`@kai-swimlane-v2
/role/
<a>
label: A;
/line/
[a: pick] => ../sales/order.md
@end
`);
    expect(two.errors).toEqual([]);
    expect(two.rows[0].link).toBe("../sales/order.md");
  });

  it("rejects a malformed link line", () => {
    const model = parseDSL(v1(`[a: pick]\nlink: ;`));
    expect(model.errors.map((e) => e.msg)).toContain("link must be written as link: <path>;");
  });

  it("draws a ↗ tile carrying data-link, on a subroutine-shaped box", () => {
    const svg = renderDiagramSvg({
      model: parseDSL(v1(`[a: pick]\nlink: ../sales/order.md;`)),
      theme: THEMES.basic,
    });
    expect(svg).toContain('data-link="../sales/order.md"');
    expect(svg).toContain("<title>../sales/order.md</title>");
    expect(svg).not.toContain("<a ");
    // A linked step defaults to the sub-process shape; a plain step does not.
    const plain = renderDiagramSvg({ model: parseDSL(v1(`[a: pick]`)), theme: THEMES.basic });
    expect(svg.length).toBeGreaterThan(plain.length);
  });

  it("becomes an <a href> when the host can name a URL for the link", () => {
    const { svg } = textToSvg(v1(`[a: pick]\nlink: ../sales/order.md;`), {
      linkHref: (link) => `?file=${encodeURIComponent(resolveLinkPath(link, "ops/pick.md"))}`,
    });
    expect(svg).toContain('<a href="?file=sales%2Forder.md">');
    expect(svg).toContain('data-link="../sales/order.md"');
  });
});

describe("the document info panel", () => {
  const dsl = v1(`[a: pick]`);

  it("is absent unless the host provides something to say", () => {
    expect(textToSvg(dsl).svg).not.toContain("data-document-info");
    expect(textToSvg(dsl, { documentInfo: { meta: {} } }).svg).not.toContain("data-document-info");
  });

  it("shows the path and each metadata entry, top-right", () => {
    const { svg } = textToSvg(dsl, {
      documentInfo: {
        path: "ops/pick.md",
        meta: { owner: "ops team", status: "draft", updated: "2026-09-11" },
      },
    });
    expect(svg).toContain("data-document-info");
    expect(svg).toContain(">ops/pick.md</tspan>");
    expect(svg).toContain(">owner: ops team</tspan>");
    expect(svg).toContain(">status: draft</tspan>");
    expect(svg).toMatch(/<text data-document-info="" x="[\d.]+" y="[\d.]+" text-anchor="end"/);
  });

  it("makes the title band taller when it would not fit", () => {
    const height = (svg) => Number(svg.match(/viewBox="0 0 [\d.]+ ([\d.]+)"/)[1]);
    const base = height(textToSvg(dsl).svg);
    const meta = Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`k${i}`, `v${i}`]));
    const tall = height(textToSvg(dsl, { documentInfo: { path: "p.md", meta } }).svg);
    expect(tall).toBeGreaterThan(base);
  });
});
