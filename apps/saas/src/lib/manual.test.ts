/**
 * The manual is real Markdown files, not code, so nothing else here checks
 * that every section actually exists for every language — a missing file
 * would only surface as a 404 someone hits by clicking a nav link.
 */
import { describe, expect, it } from "vitest";
import { isManualLang, isManualSlug, MANUAL_LANGS, MANUAL_SECTIONS } from "./manual";
import { readManualSection } from "./manual-fs";

describe("MANUAL_SECTIONS", () => {
  it("has no duplicate slugs", () => {
    expect(new Set(MANUAL_SECTIONS).size).toBe(MANUAL_SECTIONS.length);
  });
});

describe("readManualSection", () => {
  it("finds every section, in every language", () => {
    for (const lang of MANUAL_LANGS) {
      for (const slug of MANUAL_SECTIONS) {
        const text = readManualSection(lang, slug);
        expect(text, `${lang}/${slug}.md is missing`).not.toBeNull();
        expect(text!.trim().length, `${lang}/${slug}.md is empty`).toBeGreaterThan(0);
      }
    }
  });
});

describe("isManualLang / isManualSlug", () => {
  it("accept only the declared allowlists", () => {
    expect(isManualLang("en")).toBe(true);
    expect(isManualLang("fr")).toBe(false);
    expect(isManualSlug("overview")).toBe(true);
    expect(isManualSlug("../../etc/passwd")).toBe(false);
  });
});
