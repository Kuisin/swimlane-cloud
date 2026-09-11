import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { LanguageProvider } from "../i18n.jsx";
import { FileEditorProvider } from "./file-editor-provider.jsx";

/**
 * The dialog host renders *beside* the editor's `.sw-editor` root, not inside
 * it. Every colour the modal uses is a CSS variable that root defines, so
 * without a scope of its own the modal drew with no background at all —
 * a transparent popup over the page.
 */
describe("the dialog host lives inside the editor's theme scope", () => {
  it("wraps the dialog in a .sw-editor element that lays nothing out", () => {
    const html = renderToStaticMarkup(
      createElement(
        LanguageProvider,
        null,
        createElement(FileEditorProvider, { host: {} }, createElement("span", null, "body")),
      ),
    );
    expect(html).toContain('<div class="sw-editor sw-dialog-root">');
    const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.sw-dialog-root\s*\{\s*display:\s*contents;/);
  });
});
