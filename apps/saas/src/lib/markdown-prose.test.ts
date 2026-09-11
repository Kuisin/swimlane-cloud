/**
 * The Document view never sees the diagram fence — it is lifted out and put
 * back verbatim. These tests pin the property that matters: whatever the
 * WYSIWYG does to the prose, the DSL comes back byte-identical.
 */
import { describe, expect, it } from "vitest";
import { dslOf } from "./diagram-file";
import { DIAGRAM_PLACEHOLDER, carriedValues, fromProse, metaOf, toProse } from "./markdown-prose";
import {
  listItemsOf,
  metadataRows,
  validateMetadata,
  withDefaults,
  type MetaRecord,
  type MetadataField,
} from "./metadata-schema";

const DSL = `@kai-swimlane

/line/
[a: x]
  desc: \`\`\`
  fenced value
  \`\`\`;

@end`;

const STORED = `---
owner: sales-ops
---

# Heading

Before.

\`\`\`\`kai-swimlane
${DSL}
\`\`\`\`

After.
`;

describe("toProse", () => {
  it("separates metadata, prose and the fence", () => {
    const parts = toProse(STORED);
    expect(parts.meta).toEqual({ owner: "sales-ops" });
    expect(parts.prose).toContain(DIAGRAM_PLACEHOLDER);
    expect(parts.prose).not.toContain("kai-swimlane");
    expect(parts.fence).toContain(DSL);
  });

  it("handles a document with no diagram in it", () => {
    const parts = toProse("# Notes\n\nJust prose.\n");
    expect(parts.fence).toBeNull();
    expect(parts.prose).toBe("# Notes\n\nJust prose.\n");
  });
});

describe("fromProse", () => {
  it("puts an untouched document back byte for byte", () => {
    const parts = toProse(STORED);
    expect(fromProse(parts, parts.prose)).toBe(STORED);
  });

  it("keeps the DSL identical however the prose is rewritten", () => {
    const parts = toProse(STORED);
    // Stand in for what a markdown serializer may do to the prose around it.
    const rewritten = parts.prose
      .replace("# Heading", "## Heading rewritten")
      .replace("Before.", "Before, edited.");
    const out = fromProse(parts, rewritten);
    expect(out).toContain("## Heading rewritten");
    expect(dslOf("flow.md", out)).toBe(dslOf("flow.md", STORED));
  });

  it("keeps edited metadata", () => {
    const parts = toProse(STORED);
    const out = fromProse({ ...parts, meta: { owner: "ops", status: "review" } }, parts.prose);
    expect(out.startsWith("---\nowner: ops\nstatus: review\n---\n")).toBe(true);
  });

  it("appends the diagram rather than losing it when the placeholder is gone", () => {
    const parts = toProse(STORED);
    const out = fromProse(parts, "# Only prose now\n");
    expect(dslOf("flow.md", out)).toBe(dslOf("flow.md", STORED));
  });

  it("round-trips a prose-only document", () => {
    const prose = "# Notes\n\nJust prose.\n";
    const parts = toProse(prose);
    expect(fromProse(parts, parts.prose)).toBe(prose);
  });
});

/**
 * Metadata is not only five flat strings: a document may hold a sequence, and
 * one whose shape the engine cannot rebuild has to come back exactly as it was
 * found. Editing one key must never cost another its value.
 */
const RICH = `---
owner: sales-ops
tags:
  - billing
  - urgent
sourceRef:
  repo: acme/flows
  ref: main
---

# Heading

Prose.
`;

describe("rich frontmatter", () => {
  it("models a block sequence as a list and a nested map as a map — neither is carried", () => {
    const parts = toProse(RICH);
    expect(parts.meta.tags).toEqual(["billing", "urgent"]);
    expect(parts.meta.sourceRef).toEqual({ repo: "acme/flows", ref: "main" });
    // Both shapes round-trip now, so nothing has to be carried through
    // verbatim — which is what makes them editable in the form.
    expect([...carriedValues(parts.shape).keys()]).toEqual([]);
    expect(metaOf(RICH).carried).toEqual([]);
  });

  it("puts an untouched document back byte for byte", () => {
    const parts = toProse(RICH);
    expect(fromProse(parts, parts.prose)).toBe(RICH);
  });

  it("keeps the sequence a sequence and the nested map intact when another key is edited", () => {
    const parts = toProse(RICH);
    const out = fromProse({ ...parts, meta: { ...parts.meta, owner: "ops" } }, parts.prose);
    expect(out).toContain("owner: ops");
    expect(out).toContain("tags:\n  - billing\n  - urgent");
    expect(out).toContain("sourceRef:\n  repo: acme/flows\n  ref: main");
  });

  it("writes an edited list back as a list", () => {
    const parts = toProse(RICH);
    const out = fromProse(
      { ...parts, meta: { ...parts.meta, tags: ["billing", "q3"] } },
      parts.prose,
    );
    expect(out).toContain("tags:\n  - billing\n  - q3");
    expect(toProse(out).meta.tags).toEqual(["billing", "q3"]);
  });

  it("adds a brand-new list key without mangling its separator", () => {
    const parts = toProse("---\nowner: a\n---\n\nProse.\n");
    const out = fromProse({ ...parts, meta: { ...parts.meta, tags: ["x", "y"] } }, parts.prose);
    expect(toProse(out).meta.tags).toEqual(["x", "y"]);
  });

  it("writes an edited nested map through, rather than dropping the edit", () => {
    const parts = toProse(RICH);
    const edited = { ...parts.meta, sourceRef: { repo: "other", ref: "main" } };
    const out = fromProse({ ...parts, meta: edited }, parts.prose);
    expect(out).toContain("sourceRef:\n  repo: other\n  ref: main");
    expect(toProse(out).meta.sourceRef).toEqual({ repo: "other", ref: "main" });
  });

  it("leaves a document with no frontmatter without any", () => {
    const parts = toProse("# Notes\n");
    expect(metaOf("# Notes\n").hadFrontmatter).toBe(false);
    expect(fromProse(parts, parts.prose)).toBe("# Notes\n");
  });
});

/**
 * The whole path the Document tab walks: the file, the rows the schema turns it
 * into, an edit to one of them, and the bytes that get stored. This is the test
 * that would catch the form and the engine disagreeing about what a value is.
 */
describe("schema → form state → saved frontmatter", () => {
  const FIELDS: MetadataField[] = [
    { key: "owner", type: "string", label: "Owner", required: true },
    { key: "status", type: "enum", values: ["draft", "review", "approved"], default: "draft" },
    { key: "tags", type: "list" },
    { key: "sourceRef", type: "map" },
  ];

  it("renders the file as rows, saves an edit, and reads it back the same", () => {
    const parts = toProse(RICH);
    const rows = metadataRows(parts.meta, FIELDS, carriedValues(parts.shape));
    expect(rows.map((r) => [r.key, r.kind])).toEqual([
      ["owner", "declared"],
      ["status", "declared"],
      ["tags", "declared"],
      ["sourceRef", "declared"],
    ]);
    expect(listItemsOf(rows[2].value)).toEqual(["billing", "urgent"]);

    // What the form does: pick a choice, drop one tag, add another.
    const edited: MetaRecord = { ...parts.meta, status: "review", tags: ["billing", "q3"] };
    const stored = fromProse({ ...parts, meta: edited }, parts.prose);

    const back = toProse(stored);
    expect(validateMetadata(back.meta, FIELDS)).toEqual([]);
    expect(back.meta.status).toBe("review");
    expect(listItemsOf(back.meta.tags)).toEqual(["billing", "q3"]);
    expect(back.meta.owner).toBe("sales-ops");
    // The map is modelled rather than carried, and an edit that never touched
    // it leaves it exactly as the author wrote it.
    expect([...carriedValues(back.shape).keys()]).toEqual([]);
    expect(stored).toContain("sourceRef:\n  repo: acme/flows\n  ref: main");
  });

  it("saves the defaults the form offers, and they then validate", () => {
    const parts = toProse("---\nowner: a\n---\n\nProse.\n");
    const filled = withDefaults(parts.meta, FIELDS);
    const stored = fromProse({ ...parts, meta: filled }, parts.prose);
    expect(stored).toContain("status: draft");
    expect(validateMetadata(toProse(stored).meta, FIELDS)).toEqual([]);
  });

  it("keeps an undeclared key the author wrote by hand", () => {
    const parts = toProse("---\nowner: a\nhandWritten: kept\n---\n\nProse.\n");
    const rows = metadataRows(parts.meta, FIELDS, carriedValues(parts.shape));
    expect(rows.find((r) => r.key === "handWritten")?.kind).toBe("extra");
    const stored = fromProse({ ...parts, meta: { ...parts.meta, owner: "b" } }, parts.prose);
    expect(toProse(stored).meta.handWritten).toBe("kept");
  });

  it("still round-trips a document in a project with no schema at all", () => {
    const parts = toProse(STORED);
    expect(metadataRows(parts.meta, []).map((r) => r.key)).toEqual(["owner"]);
    expect(fromProse(parts, parts.prose)).toBe(STORED);
  });
});
