import { describe, expect, it } from "vitest";
import { parseDSL } from "@swimlane-cloud/diagram-converter/parser";
import { HELP_SECTIONS } from "./help-modal.jsx";

/**
 * The DSL quick reference is the one place a user copies syntax from, so its
 * control-flow samples have to be real DSL, not remembered DSL. Every keyword
 * migration in this repo's history has left one of these behind; this pins
 * them to the parser instead.
 *
 * Only the control-flow samples are checked: the rest of the list is made of
 * `/role/`-style fragments and one-line shapes that need a different wrapper.
 */
const CONTROL = /^(?:if|fork|section|branch|\[role:|\/line\/|\/\/)/m;

const wrap = (sample) =>
  `@kai-swimlane

/role/

<role>
label: Role;

${sample.includes("/line/") ? sample : `/line/\n${sample}`}

@end
`;

const controlSamples = HELP_SECTIONS.filter(
  ([, , code]) => code && CONTROL.test(code) && /\b(?:if|fork|section|branch)\s*\(/.test(code),
).map(([term, , code]) => ({ term, code }));

describe("the DSL quick reference", () => {
  it("has control-flow samples to check", () => {
    expect(controlSamples.length).toBeGreaterThanOrEqual(6);
  });

  it.each(controlSamples)("$term parses with zero errors", ({ code }) => {
    expect(parseDSL(wrap(code)).errors).toEqual([]);
  });

  // The two spellings the grammar dropped outright: a fork's later paths are
  // `case (…)` rather than `and (…)`, and there is no bare `else` clause.
  // (`case` itself still exists — it just belongs to fork now, so it can only
  // be checked by parsing, which the cases above do.)
  it("uses no keyword the grammar dropped", () => {
    for (const [term, , code] of HELP_SECTIONS) {
      const text = `${term}\n${code ?? ""}`;
      expect(text, term).not.toMatch(/^\s*and\b/m);
      expect(text, term).not.toMatch(/^\s*else\s*$/m);
    }
  });
});
