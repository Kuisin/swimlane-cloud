import { describe, expect, it } from "vitest";
import { extractTitle, render } from "./render";

const SAMPLE = ["/title/ Hello", "/role/", "<a> Sales", "/line/", "<a> Step one"].join("\n");

describe("render", () => {
  it("renders a diagram to SVG", () => {
    expect(render(SAMPLE, "basic").svg).toContain("<svg");
  });

  it("never throws — a broken file inside a version must not 500 the share page", () => {
    for (const junk of ["", "not a diagram at all", "/role/", " "]) {
      expect(() => render(junk, "basic")).not.toThrow();
    }
  });

  it("neutralises hostile DSL — the SVG is injected as innerHTML on a public page", () => {
    const payloads = [
      "/title/ T</svg><script>alert(1)</script>",
      ["/role/", "<a> L</title><img src=x onerror=alert(3)>"].join("\n"),
      "/title/ <svg onload=alert(5)>",
    ];
    for (const dsl of payloads) {
      const { svg } = render(dsl, "basic");
      if (!svg) continue;
      expect(svg).not.toMatch(/<script/i);
      expect(svg).not.toMatch(/\son\w+\s*=/i);
      expect(svg).not.toMatch(/<img/i);
    }
  });
});

describe("extractTitle", () => {
  it("reads /title/ without a full parse", () => {
    expect(extractTitle(["/page/", "x", "/title/  Expense Approval  "].join("\n"))).toBe(
      "Expense Approval",
    );
    expect(extractTitle("/role/\n<a> Sales")).toBeNull();
  });
});
