import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TextEditor } from "./text-editor.jsx";

const render = (props) =>
  renderToStaticMarkup(createElement(TextEditor, { onChange() {}, ...props }));

describe("TextEditor parse-error highlighting", () => {
  it("marks the gutter number and paints a stripe for an error line", () => {
    const html = render({ value: "a\nb\nc", errors: [{ line: 2, msg: "boom" }] });
    expect(html.match(/sw-code-lineno-error/g)).toHaveLength(1);
    expect(html).toContain("sw-code-error-line");
    // Line 2 stripe sits one line-height (1.6em) below the top.
    expect(html).toContain("top:1.6em");
  });

  it("paints one stripe per distinct error line", () => {
    const html = render({
      value: "a\nb\nc\nd",
      errors: [{ line: 1 }, { line: 3 }, { line: 3, msg: "dup on same line" }],
    });
    expect(html.match(/sw-code-error-line/g)).toHaveLength(2);
    expect(html.match(/sw-code-lineno-error/g)).toHaveLength(2);
  });

  it("renders no stripe layer when there are no errors", () => {
    const html = render({ value: "a\nb", errors: [] });
    expect(html).not.toContain("sw-code-error-layer");
    expect(html).not.toContain("sw-code-lineno-error");
  });

  it("ignores errors without a valid in-document line number", () => {
    const html = render({ value: "a\nb", errors: [{ line: 99 }, { line: 0 }, { msg: "no line" }] });
    expect(html).not.toContain("sw-code-error-layer");
  });
});
