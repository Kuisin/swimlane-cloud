/**
 * A caller shrinking this preview with CSS (`compact`) needs the shape itself
 * to shrink, not just its box, and needs the id caption gone, since a caller
 * showing a small inline icon next to its own text label — the id, absent a
 * `label:` property on the definition — would otherwise show that id twice.
 * Both were real defects, found by rendering the actual output in a browser.
 */
import { describe, it, expect } from "vitest";
import { renderPartsPreviewHtml } from "./parts-preview-static.js";
import { THEMES } from "../themes.js";

const CODE =
  "/block/\n<terminal>\n  background-color: #ecfdf5;\n  border-color: #059669;\n  shape: rounded;";

describe("renderPartsPreviewHtml", () => {
  it("carries a viewBox matching its declared size, so CSS can scale it", () => {
    const html = renderPartsPreviewHtml(CODE, THEMES.basic);
    const [, w, h] = html.match(/<svg width="(\d+)" height="(\d+)"/);
    expect(html).toContain(`viewBox="0 0 ${w} ${h}"`);
  });

  it("default output is unchanged: caption present, container padded", () => {
    const html = renderPartsPreviewHtml(CODE, THEMES.basic);
    expect(html).toContain(">terminal<");
    expect(html).toContain("padding:12px");
  });

  it("compact drops the id caption and the container padding", () => {
    const html = renderPartsPreviewHtml(CODE, THEMES.basic, { compact: true });
    expect(html).not.toContain(">terminal<");
    expect(html).toContain("padding:0");
    expect(html).toMatch(/<svg[^>]*viewBox/); // the shape itself still renders
  });

  it("a prop definition gets the same treatment", () => {
    const propCode = "/prop/\n<RQ>\n  label: 申請書;\n  side: right;";
    const full = renderPartsPreviewHtml(propCode, THEMES.basic);
    const compact = renderPartsPreviewHtml(propCode, THEMES.basic, { compact: true });
    expect(full).toContain(">RQ<");
    expect(compact).not.toContain(">RQ<");
    expect(compact).toMatch(/viewBox="0 0 \d+ \d+"/);
  });
});
