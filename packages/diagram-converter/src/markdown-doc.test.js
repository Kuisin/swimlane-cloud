/**
 * The contract that matters here is exactness: a `.md` document read for
 * editing and written straight back out must be byte-identical, or every save
 * of an untouched file shows up as a diff. Frontmatter maps one-to-one onto
 * `/meta/`, so `markdownFromDsl(dslFromMarkdown(md)) === md`.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDSL } from "./parser.js";
import {
  dslFromMarkdown,
  extractDiagramFence,
  isMarkdownDiagram,
  markdownFromDsl,
  orderedMetaKeys,
  readMetaSection,
  serializeFrontmatter,
  splitFrontmatter,
  writeMetaSection,
} from "./markdown-doc.js";

const DSL = `@kai-swimlane-v2

/title/
Order to cash;

/line/
[sales: Take the order]
[sales: Ship it]

@end`;

const MD = `---
owner: sales-ops
status: review
tags: order, credit
---

\`\`\`kai-swimlane
${DSL}
\`\`\`
`;

describe("splitFrontmatter", () => {
  it("reads a leading --- block and leaves the body alone", () => {
    const { meta, body, hadFrontmatter } = splitFrontmatter(MD);
    expect(hadFrontmatter).toBe(true);
    expect(meta).toEqual({ owner: "sales-ops", status: "review", tags: "order, credit" });
    expect(body.startsWith("\n```kai-swimlane")).toBe(true);
  });

  it("treats a --- further down as an ordinary thematic break", () => {
    const md = "# Title\n\n---\n\nmore\n";
    expect(splitFrontmatter(md)).toMatchObject({ meta: {}, body: md, hadFrontmatter: false });
  });

  it("does not consume an unterminated block", () => {
    const md = "---\nowner: x\n\nno closing delimiter\n";
    expect(splitFrontmatter(md).hadFrontmatter).toBe(false);
  });

  it("round-trips a value that needs quoting", () => {
    for (const value of [
      "a: b",
      " padded ",
      "#hash",
      "",
      'quote"inside',
      "line\nbreak",
      "- dash",
    ]) {
      const text = serializeFrontmatter({ k: value });
      expect(splitFrontmatter(`${text}body`).meta.k).toBe(value);
    }
  });
});

describe("serializeFrontmatter", () => {
  it("writes the five reserved keys first, then the rest sorted", () => {
    const out = serializeFrontmatter({ zeta: "z", owner: "o", alpha: "a", status: "s" });
    expect(out.split("\n").slice(1, -2)).toEqual(["owner: o", "status: s", "alpha: a", "zeta: z"]);
    expect(orderedMetaKeys({ updated: "d", owner: "o", x: "1" })).toEqual([
      "owner",
      "updated",
      "x",
    ]);
  });

  it("writes nothing at all when there is no metadata", () => {
    expect(serializeFrontmatter({})).toBe("");
    expect(serializeFrontmatter(undefined)).toBe("");
  });
});

describe("extractDiagramFence", () => {
  it("finds the fenced DSL", () => {
    expect(extractDiagramFence(splitFrontmatter(MD).body)?.dsl).toBe(DSL);
  });

  it("ignores a fence of another language", () => {
    expect(extractDiagramFence("```js\nconst a = 1;\n```\n")).toBeNull();
  });

  it("ignores an unclosed fence rather than swallowing the rest of the file", () => {
    expect(extractDiagramFence("```kai-swimlane\n@kai-swimlane-v2\n")).toBeNull();
  });

  it("survives a DSL that itself contains a fenced value", () => {
    // A `desc:` can be a ```-fenced multi-line value, so the wrapper fence has
    // to be longer than anything inside it.
    const inner = "@kai-swimlane-v2\n/line/\n[a: x]\n  desc: ```\n  one\n  two\n  ```;\n@end";
    const md = markdownFromDsl(inner);
    expect(extractDiagramFence(splitFrontmatter(md).body)?.dsl).toBe(inner);
    // and it must still parse
    expect(parseDSL(dslFromMarkdown(md)).errors).toEqual([]);
  });
});

describe("readMetaSection / writeMetaSection", () => {
  it("lifts /meta/ out and puts it back unchanged", () => {
    const withMeta = writeMetaSection(DSL, { owner: "sales-ops", status: "review" });
    expect(withMeta).toContain("/meta/\nowner: sales-ops;\nstatus: review;");
    const { meta, dsl } = readMetaSection(withMeta);
    expect(meta).toEqual({ owner: "sales-ops", status: "review" });
    expect(dsl).toBe(DSL);
  });

  it("puts /meta/ ahead of every other section", () => {
    const out = writeMetaSection(DSL, { owner: "o" });
    const markers = out.split("\n").filter((l) => /^\/\w+\/$/.test(l.trim()));
    expect(markers[0].trim()).toBe("/meta/");
  });

  it("is a no-op when there is no metadata", () => {
    expect(writeMetaSection(DSL, {})).toBe(DSL);
    expect(readMetaSection(DSL)).toEqual({ meta: {}, dsl: DSL });
  });

  it("keeps the injected section parseable", () => {
    const m = parseDSL(writeMetaSection(DSL, { owner: "sales-ops", tags: "a, b" }));
    expect(m.errors).toEqual([]);
    expect(m.meta).toEqual({ owner: "sales-ops", tags: "a, b" });
  });
});

describe("dslFromMarkdown", () => {
  it("returns the DSL with frontmatter injected as /meta/", () => {
    const dsl = dslFromMarkdown(MD);
    const model = parseDSL(dsl);
    expect(model.errors).toEqual([]);
    expect(model.meta).toEqual({ owner: "sales-ops", status: "review", tags: "order, credit" });
    expect(model.title).toBe("Order to cash");
  });

  it("returns null for prose with no diagram in it", () => {
    expect(dslFromMarkdown("# Diagrams\n\nNotes live here.\n")).toBeNull();
    expect(isMarkdownDiagram("# Diagrams\n")).toBe(false);
    expect(isMarkdownDiagram(MD)).toBe(true);
  });
});

describe("round-trip", () => {
  const cases = {
    "frontmatter and fence": MD,
    "no frontmatter": `\`\`\`kai-swimlane\n${DSL}\n\`\`\`\n`,
    "prose before and after": `---\nowner: o\n---\n\n# Heading\n\nBefore.\n\n\`\`\`kai-swimlane\n${DSL}\n\`\`\`\n\nAfter the diagram.\n`,
    "metadata needing quotes": `---\nowner: "a: b"\nstatus: "#draft"\n---\n\n\`\`\`kai-swimlane\n${DSL}\n\`\`\`\n`,
  };

  for (const [name, md] of Object.entries(cases)) {
    it(`is byte-exact: ${name}`, () => {
      expect(markdownFromDsl(dslFromMarkdown(md), md)).toBe(md);
    });
  }

  it("preserves prose when the diagram itself changes", () => {
    const md = cases["prose before and after"];
    const edited = dslFromMarkdown(md).replace("Ship it", "Ship it fast");
    const out = markdownFromDsl(edited, md);
    expect(out).toContain("# Heading");
    expect(out).toContain("After the diagram.");
    expect(out).toContain("Ship it fast");
    expect(parseDSL(dslFromMarkdown(out)).errors).toEqual([]);
  });

  it("moves an edited /meta/ into frontmatter, never leaving it in the fence", () => {
    const edited = writeMetaSection(dslFromMarkdown(MD).replace(/\/meta\/[\s\S]*?\n\n/, ""), {
      owner: "new-owner",
    });
    const out = markdownFromDsl(edited, MD);
    expect(splitFrontmatter(out).meta).toEqual({ owner: "new-owner" });
    expect(extractDiagramFence(splitFrontmatter(out).body).dsl).not.toContain("/meta/");
  });

  it("builds a whole document from a bare DSL when there is nothing to merge into", () => {
    const out = markdownFromDsl(writeMetaSection(DSL, { owner: "o" }));
    expect(splitFrontmatter(out).meta).toEqual({ owner: "o" });
    expect(parseDSL(dslFromMarkdown(out)).errors).toEqual([]);
    expect(markdownFromDsl(dslFromMarkdown(out), out)).toBe(out);
  });
});

/**
 * The worked example is the real thing every project will be converted from —
 * multiple languages, `@use` imports, fenced `desc:` values, phases, forks.
 * Converting must not change what the document *means*, so the assertion is
 * that the parse is equivalent, not merely that it still parses.
 */
const EXAMPLES = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "examples",
  "kai-swimlane-v2",
  "diagrams",
);

function diagramFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) diagramFiles(path, out);
    else if (name.endsWith(".txt")) out.push(path);
  }
  return out;
}

describe.skipIf(!existsSync(EXAMPLES))("converting the worked example to markdown", () => {
  const files = diagramFiles(EXAMPLES);

  it("has the sample diagrams", () => {
    expect(files.length).toBeGreaterThanOrEqual(6);
  });

  it.each(files.map((f) => [f.slice(EXAMPLES.length + 1), f]))(
    "%s converts losslessly",
    (_n, p) => {
      const dsl = readFileSync(p, "utf8");
      const before = parseDSL(dsl);

      const md = markdownFromDsl(dsl);
      const back = dslFromMarkdown(md);
      const after = parseDSL(back);

      // Conversion must not introduce problems. (These fixtures import images,
      // so without resolvers both sides carry the same unresolved-@use warnings
      // — what matters is that the set is unchanged.)
      expect(after.errors).toEqual(before.errors);
      expect(after.meta).toEqual(before.meta);
      expect(after.title).toBe(before.title);
      expect(after.languages).toEqual(before.languages);
      expect(after.rows.map((r) => r.kind)).toEqual(before.rows.map((r) => r.kind));
      expect(after.uses).toEqual(before.uses);

      // the metadata really moved out of the fence and into frontmatter
      expect(splitFrontmatter(md).meta).toEqual(before.meta);
      expect(extractDiagramFence(splitFrontmatter(md).body).dsl).not.toContain("/meta/");

      // and re-saving an untouched document is a no-op
      expect(markdownFromDsl(back, md)).toBe(md);
    },
  );
});
