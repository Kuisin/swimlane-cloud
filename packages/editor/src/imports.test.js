import { describe, expect, it } from "vitest";

describe("public entry imports cleanly", () => {
  it("loads index.jsx and exposes the documented exports", async () => {
    const mod = await import("./index.jsx");
    expect(typeof mod.DslEditor).toBe("function");
    expect(typeof mod.FileEditorProvider).toBe("function");
    expect(typeof mod.useEditor).toBe("function");
    expect(typeof mod.serializeDSL).toBe("function");
    expect(typeof mod.formatDsl).toBe("function");
    expect(typeof mod.mergeSectionTemplate).toBe("function");
    expect(typeof mod.buildFolderTree).toBe("function");
    expect(typeof mod.hostHas).toBe("function");
    expect(Array.isArray(mod.TEMPLATE_SECTIONS)).toBe(true);
    expect(typeof mod.LanguageProvider).toBe("function");
    expect(typeof mod.useT).toBe("function");
    expect(Array.isArray(mod.LANGUAGES)).toBe(true);
  });

  it("loads every component module (JSX compiles, imports resolve)", async () => {
    await import("./dsl-editor.jsx");
    await import("./components/gui/gui-mode.jsx");
    await import("./components/gui/step-inspector.jsx");
    await import("./components/gui/branch-inspector.jsx");
    await import("./components/gui/flow-step-list.jsx");
    await import("./components/gui/color-field.jsx");
    await import("./components/gui/branch-color-field.jsx");
    await import("./components/template-panel.jsx");
    await import("./components/action-bar.jsx");
    await import("./components/folder-tree.jsx");
    await import("./components/tabs.jsx");
    await import("./components/text-editor.jsx");
    await import("./components/preview-pane.jsx");
    await import("./components/error-list.jsx");
    await import("./components/help-modal.jsx");
    await import("./components/mode-toggle.jsx");
    await import("./components/language-toggle.jsx");
    await import("./components/gui/parts-preview-popup.jsx");
    await import("./components/gui/move-step-modal.jsx");
    await import("./i18n.jsx");
    await import("./lib/parts-extract.js");
    await import("./hooks/use-drag-width.js");
    expect(true).toBe(true);
  });
});
