import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readDslRule, sectionNames } from "./dsl-rule-sections.js";

const contentPath = join(process.cwd(), "content/dsl-rule.md");

describe("readDslRule", () => {
  if (!existsSync(contentPath)) {
    execSync("node scripts/sync-dsl-rule.mjs", { cwd: process.cwd() });
  }

  it("splits the real spec into named, non-empty sections", () => {
    const sections = readDslRule();
    expect(sections.length).toBeGreaterThan(5);
    for (const s of sections) {
      expect(s.name.length).toBeGreaterThan(0);
      expect(s.body.length).toBeGreaterThan(0);
    }
  });

  it("includes the sections the tool relies on by name", () => {
    const names = sectionNames(readDslRule());
    expect(names).toContain("Design invariants");
    expect(names).toContain("Example");
    expect(names).toContain("Control flow");
  });

  it("drops the Preamble from the public section list, but keeps its text reachable", () => {
    const sections = readDslRule();
    expect(sections[0].name).toBe("Preamble");
    expect(sectionNames(sections)).not.toContain("Preamble");
  });
});
