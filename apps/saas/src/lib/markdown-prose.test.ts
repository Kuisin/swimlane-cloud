/**
 * The Document view never sees the diagram fence — it is lifted out and put
 * back verbatim. These tests pin the property that matters: whatever the
 * WYSIWYG does to the prose, the DSL comes back byte-identical.
 */
import { describe, expect, it } from "vitest";
import { dslOf } from "./diagram-file";
import { DIAGRAM_PLACEHOLDER, fromProse, toProse } from "./markdown-prose";

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
