import { describe, expect, it } from "vitest";
import { parseDSL } from "@swimlane-cloud/diagram-converter/parser";
import { STARTER_TEMPLATES } from "./starter-templates.js";

describe("STARTER_TEMPLATES", () => {
  it("is a non-empty catalog of unique ids", () => {
    expect(STARTER_TEMPLATES.length).toBeGreaterThan(0);
    const ids = STARTER_TEMPLATES.map((tpl) => tpl.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(STARTER_TEMPLATES)("$id parses with zero errors", ({ dsl }) => {
    const { errors } = parseDSL(dsl);
    expect(errors).toEqual([]);
  });
});
