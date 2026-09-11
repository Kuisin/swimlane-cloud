/**
 * `migrateLegacyDsl` is the one-shot rewrite from an earlier grammar into
 * the current one (see the module docstring for the full list of
 * constructs it touches). Every case here checks two things: the exact
 * text it produces, and — since a rewrite that "looks right" but leaves an
 * unparseable construct behind is worse than no rewrite at all — that the
 * result actually parses with zero errors.
 */
import { describe, expect, it } from "vitest";
import { migrateLegacyDsl } from "./legacy-migrate.js";
import { parseDSL } from "./parser.js";

const doc = (body) => `@kai-swimlane
/role/
<a>
label: A;
/line/
${body}
@end`;

describe("migrateLegacyDsl", () => {
  it("renames the -v2 header to the plain header", () => {
    const { text, changed } = migrateLegacyDsl("@kai-swimlane-v2\n/title/\nT;\n@end");
    expect(text).toBe("@kai-swimlane\n/title/\nT;\n@end");
    expect(changed).toBeGreaterThan(0);
  });

  it("renames the ` 2` header to the plain header", () => {
    const { text, changed } = migrateLegacyDsl("@kai-swimlane 2\n/title/\nT;\n@end");
    expect(text).toBe("@kai-swimlane\n/title/\nT;\n@end");
    expect(changed).toBeGreaterThan(0);
  });

  it("fuses the previous grammar's bare `if (q)` and its first `case (a)` onto one line", () => {
    const src = doc("if (q)\ncase (a)\n[a: x]\nend-if");
    const { text, changed } = migrateLegacyDsl(src);
    expect(text).toBe(doc("if (q) is (a) than\n[a: x]\nend-if"));
    expect(changed).toBeGreaterThan(0);
    expect(parseDSL(text).errors).toEqual([]);
  });

  it("carries a color from the first `case` onto the fused if line when the if itself has none", () => {
    const src = doc("if (q)\ncase (a) #green\n[a: x]\nend-if");
    const { text } = migrateLegacyDsl(src);
    expect(text).toBe(doc("if (q) is (a) than #green\n[a: x]\nend-if"));
    expect(parseDSL(text).errors).toEqual([]);
  });

  it("prefers the if's own color over the first case's when both have one", () => {
    const src = doc("if (q) #blue\ncase (a) #green\n[a: x]\nend-if");
    const { text } = migrateLegacyDsl(src);
    expect(text).toBe(doc("if (q) is (a) than #blue\n[a: x]\nend-if"));
    expect(parseDSL(text).errors).toEqual([]);
  });

  it("rewrites a later, bare `case (b)` into `else-if (b) than`, and a blank `case ()` into `else-if () than`", () => {
    const src = doc("if (q)\ncase (a)\n[a: x]\ncase (b)\n[a: y]\ncase ()\n[a: z]\nend-if");
    const { text, changed } = migrateLegacyDsl(src);
    expect(text).toBe(
      doc("if (q) is (a) than\n[a: x]\nelse-if (b) than\n[a: y]\nelse-if () than\n[a: z]\nend-if"),
    );
    expect(changed).toBeGreaterThan(0);
    expect(parseDSL(text).errors).toEqual([]);
  });

  it("keeps a later case's own color suffix", () => {
    const src = doc("if (q)\ncase (a)\n[a: x]\ncase (b) #red\n[a: y]\nend-if");
    const { text } = migrateLegacyDsl(src);
    expect(text).toBe(doc("if (q) is (a) than\n[a: x]\nelse-if (b) than #red\n[a: y]\nend-if"));
    expect(parseDSL(text).errors).toEqual([]);
  });

  it("rewrites the oldest bare `else` (no than, no parens) into `else-if () than`", () => {
    const src = doc("if (q) is (a) than\n[a: x]\nelse\n[a: y]\nendif");
    const { text, changed } = migrateLegacyDsl(src);
    expect(text).toBe(doc("if (q) is (a) than\n[a: x]\nelse-if () than\n[a: y]\nend-if"));
    expect(changed).toBeGreaterThan(0);
    expect(parseDSL(text).errors).toEqual([]);
  });

  it("keeps the oldest bare else's color suffix", () => {
    const src = doc("if (q) is (a) than\n[a: x]\nelse #red\n[a: y]\nend-if");
    const { text } = migrateLegacyDsl(src);
    expect(text).toBe(doc("if (q) is (a) than\n[a: x]\nelse-if () than #red\n[a: y]\nend-if"));
    expect(parseDSL(text).errors).toEqual([]);
  });

  it("leaves an already-current `if … is … than` / `else-if … than` document untouched", () => {
    const src = doc(
      "if (q) is (a) than\n[a: x]\nelse-if (b) than #red\n[a: y]\nelse-if () than\n[a: z]\nend-if",
    );
    const { text, changed } = migrateLegacyDsl(src);
    expect(text).toBe(src);
    expect(changed).toBe(0);
  });

  it("rewrites the un-hyphenated closers `endif` and `endfork`", () => {
    const endif = migrateLegacyDsl(doc("if (q)\ncase (a)\n[a: x]\nendif"));
    expect(endif.text).toBe(doc("if (q) is (a) than\n[a: x]\nend-if"));
    expect(parseDSL(endif.text).errors).toEqual([]);

    const endfork = migrateLegacyDsl(doc("fork\n[a: x]\nendfork"));
    expect(endfork.text).toBe(doc("fork\n[a: x]\nend-fork"));
    expect(parseDSL(endfork.text).errors).toEqual([]);
  });

  it("rewrites a fork path's `and (b)` into `case (b)`, leaving the fork's own opener alone", () => {
    const src = doc("fork (p1)\n[a: x]\nand (p2) #blue\n[a: y]\nend-fork");
    const { text, changed } = migrateLegacyDsl(src);
    expect(text).toBe(doc("fork (p1)\n[a: x]\ncase (p2) #blue\n[a: y]\nend-fork"));
    expect(changed).toBeGreaterThan(0);
    expect(parseDSL(text).errors).toEqual([]);
  });

  it("leaves an already-current fork `case (b)` document untouched", () => {
    const src = doc("fork (p1)\n[a: x]\ncase (p2) #blue\n[a: y]\nend-fork");
    const { text, changed } = migrateLegacyDsl(src);
    expect(text).toBe(src);
    expect(changed).toBe(0);
  });

  it("rewrites a bare `[loop]` into `loop`", () => {
    const src = doc("if (q)\ncase (a)\n[loop]\nend-if");
    const { text, changed } = migrateLegacyDsl(src);
    expect(text).toBe(doc("if (q) is (a) than\nloop\nend-if"));
    expect(changed).toBeGreaterThan(0);
    expect(parseDSL(text).errors).toEqual([]);
  });

  it("rewrites `merge: id;` inside a case into `[goto: id]`", () => {
    const named = migrateLegacyDsl(doc("if (q)\ncase (a)\n[a: x]\nmerge: done;\nend-if"));
    expect(named.text).toBe(doc("if (q) is (a) than\n[a: x]\n[goto: done]\nend-if"));
  });

  it("rewrites `[merge: id]` inside a case into `[goto: id]`, leaving a step's own `id:` line alone", () => {
    const src = doc(
      "[a: start]\nid: again;\n[a: mid]\nif (ok)\ncase (no)\n[merge: again]\ncase ()\n[a: done]\nend-if",
    );
    const { text } = migrateLegacyDsl(src);
    expect(text).toBe(
      doc(
        "[a: start]\nid: again;\n[a: mid]\nif (ok) is (no) than\n[goto: again]\nelse-if () than\n[a: done]\nend-if",
      ),
    );
    expect(parseDSL(text).errors).toEqual([]);
  });

  // There is no marker concept any more — every jump needs a real target id
  // — so a bare `merge;` / `[merge]`, in a case or as a landing marker, has
  // no automatic mapping. Left untouched; the reader errors on it, pointing
  // at the exact line to fix by hand.
  it("leaves an unmappable bare `merge;` / `[merge]` untouched for the reader to flag", () => {
    const inCase = migrateLegacyDsl(doc("if (ok)\ncase (no)\n[merge]\ncase ()\n[a: done]\nend-if"));
    expect(inCase.text).toBe(
      doc("if (ok) is (no) than\n[merge]\nelse-if () than\n[a: done]\nend-if"),
    );
    expect(parseDSL(inCase.text).errors).not.toEqual([]);

    const marker = migrateLegacyDsl(doc("[a: x]\n[merge]\n[a: y]"));
    expect(marker.text).toBe(doc("[a: x]\n[merge]\n[a: y]"));
    expect(parseDSL(marker.text).errors).not.toEqual([]);
  });

  it("leaves a `[goto: id]` line — already the current grammar — untouched", () => {
    const src = doc("if (q) is (a) than\n  [goto: home]\nend-if");
    const { text, changed } = migrateLegacyDsl(src);
    expect(text).toBe(src);
    expect(changed).toBe(0);
  });

  it("rewrites `props:`, `arrow:` and `link:` lines onto the step's own suffixes, leaving `id:` as its own line", () => {
    const src = doc("[a: x]\nid: home;\nprops: A,B;\narrow: dashed;\nlink: ./y.txt;");
    const { text, changed } = migrateLegacyDsl(src);
    expect(text).toBe(doc("[a: x] +A +B ~> => ./y.txt\nid: home;"));
    expect(changed).toBeGreaterThan(0);
    expect(parseDSL(text).errors).toEqual([]);
  });

  it("rewrites the bare spacer `:` into `[]`", () => {
    const src = doc("[a: x]\n:\n[a: y]");
    const { text, changed } = migrateLegacyDsl(src);
    expect(text).toBe(doc("[a: x]\n[]\n[a: y]"));
    expect(changed).toBeGreaterThan(0);
    expect(parseDSL(text).errors).toEqual([]);
  });

  it("rewrites a `***` comment into `//`", () => {
    const src = doc("*** a note\n[a: x]");
    const { text, changed } = migrateLegacyDsl(src);
    expect(text).toBe(doc("// a note\n[a: x]"));
    expect(changed).toBeGreaterThan(0);
    expect(parseDSL(text).errors).toEqual([]);
  });

  it("leaves a fenced `desc:` value untouched, even one that looks like old syntax", () => {
    const src = doc("[a: x]\ndesc: ```\n*** not a comment\nif (q)\ncase (a)\n```;");
    const { text, changed } = migrateLegacyDsl(src);
    expect(text).toBe(src);
    expect(changed).toBe(0);
    expect(parseDSL(text).errors).toEqual([]);
  });

  it("returns a current-grammar document unchanged", () => {
    const src = doc(
      "[a: z]\n  id: done;\nif (q) is (a) than\n  [goto: done]\nelse-if () than\n  [a: y]\nend-if",
    );
    const { text, changed } = migrateLegacyDsl(src);
    expect(text).toBe(src);
    expect(changed).toBe(0);
    expect(parseDSL(text).errors).toEqual([]);
  });

  // A step's own id was an `@id` suffix in the grammar that `[goto: id]`
  // replaced. Without this rule the reader stops at `unknown directive
  // "@…"` and "Update DSL" reports nothing to do, which is what stranded
  // the template-docs edit branch behind three files of merge conflicts.
  describe("a step's retired `@id` suffix", () => {
    it("becomes the `id: <id>;` property line", () => {
      const { text, changed } = migrateLegacyDsl(doc("[a: Request] @ACT-001"));
      expect(text).toBe(doc("[a: Request]\n  id: ACT-001;"));
      expect(changed).toBeGreaterThan(0);
      expect(parseDSL(text).errors).toEqual([]);
    });

    it("keeps the other suffixes, in order, when the id sits among them", () => {
      const { text } = migrateLegacyDsl(doc("[a: Confirm] <block> @ACT-002 +VOUCHER ~>"));
      expect(text).toBe(doc("[a: Confirm] <block> +VOUCHER ~>\n  id: ACT-002;"));
      expect(parseDSL(text).errors).toEqual([]);
    });

    it("indents the property line under a nested step", () => {
      const { text } = migrateLegacyDsl(doc("section (x)\n  [a: Deep] @ACT-003\nend-section"));
      expect(text).toBe(doc("section (x)\n  [a: Deep]\n    id: ACT-003;\nend-section"));
      expect(parseDSL(text).errors).toEqual([]);
    });

    it("leaves an opener's `@id` slot alone — that one is current", () => {
      const src = doc("section (audit) @aud #blue\n  [a: Log]\nend-section");
      const { text, changed } = migrateLegacyDsl(src);
      expect(text).toBe(src);
      expect(changed).toBe(0);
      expect(parseDSL(text).errors).toEqual([]);
    });

    it("does not touch `[goto: id]`, which has no id suffix", () => {
      const src = doc("[a: z]\n  id: done;\nif (q) is (a) than\n  [goto: done]\nend-if");
      const { text, changed } = migrateLegacyDsl(src);
      expect(text).toBe(src);
      expect(changed).toBe(0);
    });
  });
});
