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
  mergeMetaProjection,
  orderedMetaKeys,
  projectMeta,
  readMetaSection,
  serializeFrontmatter,
  splitFrontmatter,
  storedMarkdown,
  verbatimKeys,
  writeMetaSection,
} from "./markdown-doc.js";

const DSL = `@kai-swimlane

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

/**
 * Frontmatter written by hand, in the shapes real documents actually use: a
 * block sequence, an author-chosen key order, and a value this module has no
 * model for. Each of these was silently destroyed on the first save.
 */
describe("frontmatter shapes this module does not itself emit", () => {
  const AUTHORED = `---
id: BF-AC-010-001-FLOW
activity_ids:
  - ACT-AC-010-001-001
  - ACT-AC-010-001-002
title: GL Master Data Maintenance
status: active
---

body
`;

  it("reads a block sequence as a list instead of dropping its items", () => {
    const { meta } = splitFrontmatter(AUTHORED);
    expect(meta.activity_ids).toEqual(["ACT-AC-010-001-001", "ACT-AC-010-001-002"]);
  });

  it("writes a block sequence back as a block sequence", () => {
    const { meta, shape } = splitFrontmatter(AUTHORED);
    expect(serializeFrontmatter(meta, shape)).toBe(AUTHORED.slice(0, AUTHORED.indexOf("\nbody")));
  });

  it("keeps the author's key order rather than re-sorting every save", () => {
    const { meta, shape } = splitFrontmatter(AUTHORED);
    const keys = serializeFrontmatter(meta, shape)
      .split("\n")
      .filter((l) => /^\w/.test(l))
      .map((l) => l.slice(0, l.indexOf(":")));
    expect(keys).toEqual(["id", "activity_ids", "title", "status"]);
  });

  it("appends a newly added key without disturbing the existing order", () => {
    const { meta, shape } = splitFrontmatter(AUTHORED);
    const out = serializeFrontmatter({ ...meta, owner: "fi.coe@example.com" }, shape);
    const keys = out
      .split("\n")
      .filter((l) => /^\w/.test(l))
      .map((l) => l.slice(0, l.indexOf(":")));
    expect(keys).toEqual(["id", "activity_ids", "title", "status", "owner"]);
  });

  it("drops a key removed from the metadata", () => {
    const { meta, shape } = splitFrontmatter(AUTHORED);
    const { status: _removed, ...rest } = meta;
    expect(serializeFrontmatter(rest, shape)).not.toContain("status:");
  });

  it("models a nested map, and keeps a block scalar verbatim", () => {
    // A nested map is part of the value model now. A `|` block scalar is not —
    // it has no form this module can rebuild, so it is carried through exactly
    // as written rather than flattened into something lossy.
    const md = `---
owner: x
approvals:
  finance: alice
  legal: bob
notes: |
  first
  second
---

body
`;
    const { meta, shape } = splitFrontmatter(md);
    expect(meta.approvals).toEqual({ finance: "alice", legal: "bob" });
    expect(meta.notes).toBeUndefined();
    expect(verbatimKeys(shape)).toEqual(["notes"]);
    expect(serializeFrontmatter(meta, shape)).toBe(md.slice(0, md.indexOf("\nbody")));
  });

  it("edits a nested map without disturbing the rest", () => {
    const md = "---\nowner: x\napprovals:\n  finance: alice\n  legal: bob\n---\n\nbody\n";
    const { meta, shape } = splitFrontmatter(md);
    const edited = { ...meta, approvals: { ...meta.approvals, legal: "carol" } };
    expect(serializeFrontmatter(edited, shape)).toBe(
      "---\nowner: x\napprovals:\n  finance: alice\n  legal: carol\n---\n",
    );
  });

  it("models a map nested two deep", () => {
    const md = "---\nsourceRef:\n  repo:\n    name: docs\n    ref: main\n---\n\nbody\n";
    const { meta, shape } = splitFrontmatter(md);
    expect(meta.sourceRef).toEqual({ repo: { name: "docs", ref: "main" } });
    expect(serializeFrontmatter(meta, shape)).toBe(md.slice(0, md.indexOf("\nbody")));
  });

  it("models a list whose items contain the separator", () => {
    const md = `---
owners:
  - "Doe, Jane"
  - "Roe, Rich"
---

body
`;
    const { meta, shape } = splitFrontmatter(md);
    // A list is a real array now, so a comma inside an item is no obstacle —
    // and the quoting the author used comes back with it.
    expect(meta.owners).toEqual(["Doe, Jane", "Roe, Rich"]);
    expect(serializeFrontmatter(meta, shape)).toBe(md.slice(0, md.indexOf("\nbody")));
  });

  it("adds and removes block-sequence items, staying a block sequence", () => {
    const { meta, shape } = splitFrontmatter(AUTHORED);
    const added = serializeFrontmatter(
      { ...meta, activity_ids: [...meta.activity_ids, "ACT-AC-010-001-003"] },
      shape,
    );
    expect(added).toContain("  - ACT-AC-010-001-002\n  - ACT-AC-010-001-003");
    const removed = serializeFrontmatter({ ...meta, activity_ids: ["ACT-AC-010-001-002"] }, shape);
    expect(removed).toContain("activity_ids:\n  - ACT-AC-010-001-002\ntitle:");
    expect(removed).not.toContain("001-001");
  });

  it("reads a block sequence written at the key's own indentation", () => {
    const md = "---\ntags:\n- order\n- credit\n---\n\nbody\n";
    const { meta, shape } = splitFrontmatter(md);
    expect(meta.tags).toEqual(["order", "credit"]);
    expect(serializeFrontmatter(meta, shape)).toBe(md.slice(0, md.indexOf("\nbody")));
  });

  it("reads an inline [a, b] list and writes it back inline", () => {
    const md = "---\ntags: [order, credit]\n---\n\nbody\n";
    const { meta, shape } = splitFrontmatter(md);
    expect(meta.tags).toEqual(["order", "credit"]);
    expect(serializeFrontmatter(meta, shape)).toBe("---\ntags: [order, credit]\n---\n");
    // a flow list stays flow when items are added or removed
    expect(serializeFrontmatter({ tags: ["order", "credit", "new"] }, shape)).toContain(
      "[order, credit, new]",
    );
    // and the old flat form a caller may still hand us is still understood
    expect(serializeFrontmatter({ tags: "order, credit, new" }, shape)).toContain(
      "[order, credit, new]",
    );
  });

  it("keeps the shapes it still cannot model verbatim", () => {
    for (const line of [
      "a: &anchor value",
      "a: *alias",
      "a: !!str value",
      "a: { x: 1 }",
      "a: >\n  folded",
      "a:\n  - x: 1\n  - y: 2",
      "a: value\n  stray continuation",
    ]) {
      const md = `---\n${line}\n---\n\nbody\n`;
      const { meta, shape } = splitFrontmatter(md);
      expect(verbatimKeys(shape), line).toEqual(["a"]);
      expect(meta.a, line).toBeUndefined();
      expect(serializeFrontmatter(meta, shape), line).toBe(md.slice(0, md.indexOf("\nbody")));
    }
  });

  it("keeps quoting the author chose even where it is not required", () => {
    const md = '---\nowner: "sales-ops"\ntags: ["order", credit]\n---\n\nbody\n';
    const { meta, shape } = splitFrontmatter(md);
    expect(meta).toEqual({ owner: "sales-ops", tags: ["order", "credit"] });
    expect(serializeFrontmatter(meta, shape)).toBe(md.slice(0, md.indexOf("\nbody")));
  });

  it("keeps a bare `key:` bare rather than turning it into an empty string", () => {
    const md = "---\nowner:\nstatus: draft\n---\n\nbody\n";
    const { meta, shape } = splitFrontmatter(md);
    expect(meta.owner).toBe("");
    expect(serializeFrontmatter(meta, shape)).toBe(md.slice(0, md.indexOf("\nbody")));
  });

  it("keeps a | block scalar's content instead of reading the indicator as the value", () => {
    const md = "---\nnotes: |\n  first\n  second\n---\n\nbody\n";
    const { meta, shape } = splitFrontmatter(md);
    expect(meta.notes).toBeUndefined();
    expect(serializeFrontmatter(meta, shape)).toBe("---\nnotes: |\n  first\n  second\n---\n");
  });

  it("round-trips a whole authored document through the DSL and back", () => {
    const md = AUTHORED.replace("\nbody\n", `\n\`\`\`kai-swimlane\n${DSL}\n\`\`\`\n`);
    expect(markdownFromDsl(dslFromMarkdown(md), md)).toBe(md);
  });
});

/**
 * `/meta/` is `key: value;` lines, so it can only ever carry the scalar half of
 * the metadata. Everything here pins the consequence: the fence is a
 * projection, and what it cannot see it must never be able to destroy.
 */
describe("the /meta/ projection", () => {
  const RICH = `---
owner: fi.coe@example.com
tags:
  - order
  - credit
reviewers:
  - "Doe, Jane"
sourceRef:
  system: SAP
  module: FI
notes: |
  free text
---

\`\`\`kai-swimlane
${DSL}
\`\`\`
`;

  it("projects only the values a scalar section can hold", () => {
    const { meta } = splitFrontmatter(RICH);
    expect(projectMeta(meta)).toEqual({
      owner: "fi.coe@example.com",
      tags: "order, credit",
    });
    // `reviewers` has a comma inside an item, `sourceRef` is a map, `notes` is
    // verbatim — none of them survives a comma-joined round trip.
    expect(dslFromMarkdown(RICH)).toContain("tags: order, credit;");
    expect(dslFromMarkdown(RICH)).not.toContain("sourceRef");
    expect(dslFromMarkdown(RICH)).not.toContain("reviewers");
  });

  it("preserves every rich key across a /meta/-only edit", () => {
    const edited = dslFromMarkdown(RICH).replace(
      "owner: fi.coe@example.com;",
      "owner: ap.coe@example.com;",
    );
    const out = markdownFromDsl(edited, RICH);
    const { meta, shape } = splitFrontmatter(out);
    expect(meta.owner).toBe("ap.coe@example.com");
    expect(meta.sourceRef).toEqual({ system: "SAP", module: "FI" });
    expect(meta.reviewers).toEqual(["Doe, Jane"]);
    expect(verbatimKeys(shape)).toEqual(["notes"]);
    // only the one line the author touched differs
    expect(out).toBe(RICH.replace("fi.coe", "ap.coe"));
  });

  it("keeps a projected list a list rather than flattening it on the way back", () => {
    const out = markdownFromDsl(dslFromMarkdown(RICH), RICH);
    expect(splitFrontmatter(out).meta.tags).toEqual(["order", "credit"]);
    expect(out).toContain("tags:\n  - order\n  - credit");
  });

  it("removes a key deleted from /meta/ only when it was projected in", () => {
    // `owner` was in the fence, so deleting it there means what it says.
    const withoutOwner = dslFromMarkdown(RICH).replace("owner: fi.coe@example.com;\n", "");
    const { meta } = splitFrontmatter(markdownFromDsl(withoutOwner, RICH));
    expect(meta.owner).toBeUndefined();
    // `sourceRef` and `reviewers` were never there to delete.
    expect(meta.sourceRef).toEqual({ system: "SAP", module: "FI" });
    expect(meta.reviewers).toEqual(["Doe, Jane"]);
  });

  it("does not destroy a rich key when /meta/ is emptied entirely", () => {
    const { dsl } = readMetaSection(dslFromMarkdown(RICH));
    const { meta, shape } = splitFrontmatter(markdownFromDsl(dsl, RICH));
    expect(meta).toEqual({ reviewers: ["Doe, Jane"], sourceRef: { system: "SAP", module: "FI" } });
    expect(verbatimKeys(shape)).toEqual(["notes"]);
  });

  it("mergeMetaProjection is the rule on its own", () => {
    const before = { owner: "a", tags: ["x", "y"], ref: { k: "v" }, wide: ["p, q"] };
    expect(mergeMetaProjection(before, { owner: "b", tags: "x, y, z" })).toEqual({
      ref: { k: "v" },
      wide: ["p, q"],
      owner: "b",
      tags: ["x", "y", "z"],
    });
    expect(mergeMetaProjection(undefined, { owner: "b" })).toEqual({ owner: "b" });
    expect(mergeMetaProjection(before, {})).toEqual({ ref: { k: "v" }, wide: ["p, q"] });
  });

  it("adds a brand new rich key as a block sequence", () => {
    const { meta, shape } = splitFrontmatter(MD);
    expect(serializeFrontmatter({ ...meta, reviewedBy: ["a", "b"] }, shape)).toContain(
      "reviewedBy:\n  - a\n  - b",
    );
  });

  it("round-trips the whole rich document byte for byte", () => {
    expect(markdownFromDsl(dslFromMarkdown(RICH), RICH)).toBe(RICH);
    expect(storedMarkdown(dslFromMarkdown(RICH), RICH)).toBe(RICH);
  });
});

/**
 * There is one grammar now, and every document can hold `/meta/` — so a
 * document with no diagram-level metadata simply has none, rather than
 * being unable to carry any. `dslFromMarkdown` / `markdownFromDsl` inject and
 * lift `/meta/` uniformly; the case that used to be special (a "version 1"
 * header that could not hold `/meta/` at all) no longer exists.
 */
describe("a diagram with no metadata of its own", () => {
  const BARE = `@kai-swimlane

/title/
Sample;

/line/
[a: x]
@end`;

  const DOC = `---
id: BF-AC-010-001
owner: fi.coe@example.com
---

\`\`\`kai-swimlane
${BARE}
\`\`\`
`;

  it("injects the frontmatter into the fence as /meta/", () => {
    const dsl = dslFromMarkdown(DOC);
    expect(dsl).not.toBe(BARE);
    expect(dsl).toContain("/meta/");
    const model = parseDSL(dsl);
    expect(model.errors).toEqual([]);
    expect(model.meta).toEqual({ id: "BF-AC-010-001", owner: "fi.coe@example.com" });
  });

  it("keeps the frontmatter through a save that regenerates the diagram", () => {
    // Stands in for GUI mode, which rebuilds the DSL from the parsed model.
    const regenerated = writeMetaSection(BARE.replace("[a: x]", "[a: edited]"), {
      id: "BF-AC-010-001",
      owner: "fi.coe@example.com",
    });
    const saved = markdownFromDsl(regenerated, DOC);
    expect(splitFrontmatter(saved).meta).toEqual({
      id: "BF-AC-010-001",
      owner: "fi.coe@example.com",
    });
    expect(saved).toContain("[a: edited]");
  });

  it("invents no frontmatter for a brand new document with no metadata", () => {
    expect(markdownFromDsl(BARE).startsWith("---")).toBe(false);
  });

  it("still round-trips byte for byte", () => {
    expect(markdownFromDsl(dslFromMarkdown(DOC), DOC)).toBe(DOC);
  });
});

describe("storedMarkdown", () => {
  it("writes the DSL back into the document it came from", () => {
    const out = storedMarkdown(dslFromMarkdown(MD), MD);
    expect(out).toBe(MD);
  });

  it("builds a new document when there was none", () => {
    expect(isMarkdownDiagram(storedMarkdown(DSL, undefined))).toBe(true);
  });

  // Every host that can both read and write a `.md` depends on this: `read`
  // hands prose straight through, so without it the next save would wrap a
  // README in a fence and turn it into a broken diagram.
  it("leaves prose alone rather than wrapping it in a fence", () => {
    const prose = "# Notes\n\nJust prose.\n";
    expect(storedMarkdown(prose, prose)).toBe(prose);
    expect(storedMarkdown(`${prose}More.\n`, prose)).toBe(`${prose}More.\n`);
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
    expect(extractDiagramFence("```kai-swimlane\n@kai-swimlane\n")).toBeNull();
  });

  it("survives a DSL that itself contains a fenced value", () => {
    // A `desc:` can be a ```-fenced multi-line value, so the wrapper fence has
    // to be longer than anything inside it.
    const inner = "@kai-swimlane\n/line/\n[a: x]\n  desc: ```\n  one\n  two\n  ```;\n@end";
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
  "kai-swimlane",
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
