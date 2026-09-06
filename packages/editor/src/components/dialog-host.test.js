import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DialogHost } from "./dialog-host.jsx";

const render = (request) =>
  renderToStaticMarkup(createElement(DialogHost, { request, onOk() {}, onCancel() {} }));

describe("DialogHost", () => {
  it("renders nothing when there is no active request", () => {
    expect(render(null)).toBe("");
  });

  it("renders an alert with only an OK button, no Cancel", () => {
    const html = render({ kind: "alert", message: "Something happened" });
    expect(html).toContain("Something happened");
    expect(html).not.toContain(">Cancel<");
    expect(html).not.toContain("<input");
  });

  it("renders a confirm with both OK and Cancel, no input", () => {
    const html = render({ kind: "confirm", message: "Delete this?" });
    expect(html).toContain("Delete this?");
    expect(html).toContain(">Cancel<");
    expect(html).not.toContain("<input");
  });

  it("renders a prompt with an input seeded from defaultValue", () => {
    const html = render({ kind: "prompt", message: "Name?", defaultValue: "draft-1" });
    expect(html).toContain("Name?");
    expect(html).toContain(">Cancel<");
    expect(html).toContain('value="draft-1"');
  });
});
