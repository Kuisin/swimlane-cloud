import { describe, expect, it } from "vitest";
import {
  assertValidMetadataForFile,
  metadataEntryOf,
  metadataOf,
  metadataProblemsForFile,
} from "./metadata";
import type { MetadataField } from "./metadata-schema";

const FIELDS: MetadataField[] = [
  { key: "owner", type: "string", label: "Owner", required: true },
  { key: "status", type: "enum", values: ["draft", "review"] },
];

const DSL = `@kai-swimlane

/meta/
owner: sales-ops;
status: review;

/line/
[a: x]

@end`;

const MD = `---
owner: sales-ops
status: review
---

# Flow

\`\`\`kai-swimlane
@kai-swimlane

/line/
[a: x]

@end
\`\`\`
`;

describe("metadataOf", () => {
  it("reads a .md's frontmatter", () => {
    expect(metadataOf("flow.md", MD)).toEqual({ owner: "sales-ops", status: "review" });
  });

  it("reads a .txt's /meta/ section", () => {
    expect(metadataOf("flow.txt", DSL)).toEqual({ owner: "sales-ops", status: "review" });
  });

  it("has nothing to judge for a file that is neither", () => {
    expect(metadataOf("dir/.gitkeep", "")).toBeNull();
    expect(metadataOf("logo.png", "binary")).toBeNull();
  });

  it("leaves prose with no frontmatter out of it entirely", () => {
    expect(metadataOf("README.md", "# Diagrams\n\nNotes.\n")).toBeNull();
  });

  it("judges a prose document that does carry frontmatter", () => {
    expect(metadataOf("README.md", "---\nowner: a\n---\n\nNotes.\n")).toEqual({ owner: "a" });
  });

  it("judges a .md diagram with no frontmatter at all", () => {
    expect(metadataOf("flow.md", MD.slice(MD.indexOf("# Flow")))).toEqual({});
  });

  it("models a nested map rather than carrying it verbatim", () => {
    const rich = "---\nowner: a\nsourceRef:\n  repo: x\n---\n\nNotes.\n";
    expect(metadataEntryOf("doc.md", rich)).toEqual({
      meta: { owner: "a", sourceRef: { repo: "x" } },
      carried: [],
    });
    expect(metadataEntryOf("dir/.gitkeep", "")).toBeNull();
  });

  it("still names a key it genuinely cannot model, such as a block scalar", () => {
    const block = "---\nowner: a\nnote: |\n  one\n  two\n---\n\nNotes.\n";
    const entry = metadataEntryOf("doc.md", block);
    expect(entry?.carried).toEqual(["note"]);
  });
});

describe("metadata enforcement", () => {
  it("passes a document that fills the schema in", () => {
    expect(metadataProblemsForFile("flow.md", MD, FIELDS)).toEqual([]);
    expect(() => assertValidMetadataForFile("flow.md", MD, FIELDS)).not.toThrow();
  });

  it("refuses a document missing a required key, naming the field's label", () => {
    const bare = MD.replace("owner: sales-ops\n", "");
    expect(() => assertValidMetadataForFile("flow.md", bare, FIELDS)).toThrow(
      'flow.md: "Owner" is required.',
    );
  });

  it("refuses a value outside the declared choices", () => {
    const bad = MD.replace("status: review", "status: done");
    expect(() => assertValidMetadataForFile("flow.md", bad, FIELDS)).toThrow(
      'flow.md: "status" must be one of draft, review.',
    );
  });

  it("enforces the same schema on a .txt through its /meta/ section", () => {
    expect(() =>
      assertValidMetadataForFile("flow.txt", DSL.replace("owner: sales-ops;\n", ""), FIELDS),
    ).toThrow('flow.txt: "Owner" is required.');
  });

  it("changes nothing for a project with no schema configured", () => {
    expect(() => assertValidMetadataForFile("flow.md", MD.replace("owner: sales-ops\n", ""), [])) //
      .not.toThrow();
  });

  it("does not refuse a required key the engine can only carry verbatim", () => {
    // The document plainly has an owner; the engine simply cannot model a block
    // scalar. Calling that "missing" would block a push over a value in the file.
    const block = MD.replace("owner: sales-ops", "owner: |\n  sales ops");
    expect(metadataProblemsForFile("flow.md", block, FIELDS)).toEqual([]);
    expect(() => assertValidMetadataForFile("flow.md", block, FIELDS)).not.toThrow();
  });

  it("skips the files it has no metadata for", () => {
    expect(() => assertValidMetadataForFile("dir/.gitkeep", "", FIELDS)).not.toThrow();
    expect(() => assertValidMetadataForFile("README.md", "# Notes\n", FIELDS)).not.toThrow();
  });

  it("carries the problems on the error, so a client can point at the fields", () => {
    try {
      assertValidMetadataForFile("flow.md", MD.replace("owner: sales-ops\n", ""), FIELDS);
      expect.unreachable();
    } catch (err) {
      expect((err as { status: number }).status).toBe(422);
      expect((err as { extra: Record<string, unknown> }).extra.metadataProblems).toEqual([
        { path: "flow.md", key: "owner", code: "required", type: "string" },
      ]);
    }
  });
});
