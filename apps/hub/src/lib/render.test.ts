import { describe, expect, it } from "vitest";
import { extractTitle, render } from "./render.ts";

const SAMPLE = ["/title/ Hello", "/role/", "<a> Sales", "/line/", "<a> Step one"].join("\n");

describe("render", () => {
  it("renders a diagram to SVG", () => {
    const { svg } = render(SAMPLE, "basic");
    expect(svg).toContain("<svg");
  });

  it("never throws — a half-finished diagram on a branch must not 500 the page", () => {
    for (const junk of ["", "not a diagram at all", "/role/", " "]) {
      expect(() => render(junk, "basic")).not.toThrow();
    }
  });
});

describe("render escapes hostile DSL", () => {
  // The SVG is injected with dangerouslySetInnerHTML, so a payload escaping the
  // renderer would be stored XSS reachable from any repo we are pointed at.
  const payloads = [
    "/title/ T</svg><script>alert(1)</script>",
    '/title/ X"><script>alert(2)</script>',
    ["/role/", "<a> L</title><img src=x onerror=alert(3)>"].join("\n"),
    ["/option/", "background-color: red;onload=alert(4);"].join("\n"),
    "/title/ <svg onload=alert(5)>",
    ["/role/", "<a> javascript:alert(6)"].join("\n"),
  ];

  for (const dsl of payloads) {
    it(`neutralises ${JSON.stringify(dsl.slice(0, 40))}`, () => {
      const { svg } = render(dsl, "basic");
      if (!svg) return;
      expect(svg).not.toMatch(/<script/i);
      expect(svg).not.toMatch(/\son\w+\s*=/i);
      expect(svg).not.toMatch(/javascript:/i);
      expect(svg).not.toMatch(/<img/i);
    });
  }

  it("emits no external references at all", () => {
    const { svg } = render(SAMPLE, "basic");
    expect(svg).not.toMatch(/xlink:href|<image|href=|data:/i);
  });
});

describe("extractTitle", () => {
  it("reads /title/ without a full parse", () => {
    expect(extractTitle(["/page/", "x", "/title/  Expense Approval  ", "/role/"].join("\n"))).toBe(
      "Expense Approval",
    );
  });

  it("returns null when there is no title", () => {
    expect(extractTitle(["/role/", "<a> Sales"].join("\n"))).toBeNull();
  });
});
