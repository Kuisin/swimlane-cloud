import { describe, expect, it } from "vitest";
import {
  defaultValueOf,
  documentMatches,
  filterableKeys,
  isIsoDate,
  isMetadataKey,
  listItemsOf,
  mapEntriesOf,
  metaText,
  metadataRows,
  parseMetadataFields,
  parseMetadataQuery,
  parseMetadataSchema,
  parseProjectSettings,
  projectSettingsJson,
  readMetadataFields,
  searchDocuments,
  validateMetadata,
  valuesInUse,
  withDefaults,
  withoutCarried,
  type MetadataDocument,
  type MetadataField,
} from "./metadata-schema";

const FIELDS: MetadataField[] = [
  { key: "owner", type: "string", label: "Owner", required: true },
  { key: "status", type: "enum", values: ["draft", "review", "approved"], default: "draft" },
  { key: "tags", type: "list" },
  { key: "dueDate", type: "date" },
  { key: "sourceRef", type: "map" },
];

describe("parseMetadataFields", () => {
  it("reads the agreed schema shape", () => {
    expect(
      parseMetadataFields([
        { key: "owner", type: "string", label: "Owner", required: true },
        { key: "status", type: "enum", values: ["draft", "review"], default: "draft" },
      ]),
    ).toEqual([
      { key: "owner", type: "string", label: "Owner", required: true },
      { key: "status", type: "enum", values: ["draft", "review"], default: "draft" },
    ]);
  });

  it("drops entries it cannot use rather than failing the file", () => {
    const fields = parseMetadataFields([
      null,
      { type: "string" },
      { key: "has space", type: "string" },
      { key: "owner", type: "string" },
      { key: "owner", type: "list" },
      { key: "note", type: "nonsense" },
    ]);
    // An entry with no usable key, a duplicate, or a type the schema does not
    // know is dropped rather than guessed at: a field the form cannot render
    // correctly is worse than one that is visibly absent from the settings.
    expect(fields.map((f) => f.key)).toEqual(["owner"]);
  });

  it("drops a choice list with no choices, which could never be satisfied", () => {
    expect(parseMetadataFields([{ key: "status", type: "enum" }])).toEqual([]);
  });

  it("is empty for anything that is not a list of fields", () => {
    expect(parseMetadataFields(undefined)).toEqual([]);
    expect(parseMetadataFields({ key: "owner" })).toEqual([]);
  });

  it("drops a default the field would itself reject, keeping the field", () => {
    expect(parseMetadataFields([{ key: "due", type: "date", default: "soon" }])).toEqual([
      { key: "due", type: "date" },
    ]);
    expect(parseMetadataFields([{ key: "n", type: "number", default: 3 }])).toEqual([
      { key: "n", type: "number", default: "3" },
    ]);
  });

  it("takes a schema object or the bare array a hand-edited file may hold", () => {
    const owner = [{ key: "owner", type: "string" }];
    expect(parseMetadataSchema({ fields: owner }).fields).toEqual(owner);
    expect(parseMetadataSchema(owner).fields).toEqual(owner);
    expect(parseMetadataSchema(null).fields).toEqual([]);
  });

  it("is idempotent, so round-tripping the settings file is stable", () => {
    const once = parseMetadataFields(FIELDS);
    expect(parseMetadataFields(once)).toEqual(once);
  });
});

describe("readMetadataFields", () => {
  it("reads metadata.fields out of the settings file", () => {
    const text = JSON.stringify({
      version: 1,
      metadata: { fields: [{ key: "owner", type: "string" }] },
    });
    expect(readMetadataFields(text)).toEqual([{ key: "owner", type: "string" }]);
  });

  it("is empty for a missing, broken or schema-less file", () => {
    expect(readMetadataFields(null)).toEqual([]);
    expect(readMetadataFields("{ not json")).toEqual([]);
    expect(readMetadataFields(JSON.stringify({ version: 1 }))).toEqual([]);
  });
});

describe("project settings round trip", () => {
  it("keeps the metadata block through parse and serialize", () => {
    const text = projectSettingsJson({
      ...parseProjectSettings(null),
      metadata: { fields: FIELDS },
    });
    expect(parseProjectSettings(text).metadata?.fields).toEqual(FIELDS);
    // And the keys the package already owns survive alongside it.
    expect(parseProjectSettings(text).branches.published).toBe("main");
  });

  it("writes an empty schema when nothing is declared", () => {
    const text = projectSettingsJson(parseProjectSettings(null));
    expect(JSON.parse(text).metadata).toEqual({ fields: [] });
    expect(parseProjectSettings(text).metadata).toEqual({ fields: [] });
  });
});

describe("validateMetadata", () => {
  it("passes a document that fills the schema in", () => {
    expect(
      validateMetadata(
        {
          owner: "sales-ops",
          status: "review",
          tags: ["a", "b"],
          dueDate: "2026-03-01",
          sourceRef: { repo: "x" },
        },
        FIELDS,
      ),
    ).toEqual([]);
  });

  it("reports a missing required key — empty string, empty list or empty map", () => {
    expect(validateMetadata({}, FIELDS)).toEqual([
      { key: "owner", code: "required", type: "string" },
    ]);
    expect(validateMetadata({ owner: "" }, FIELDS)).toEqual([
      { key: "owner", code: "required", type: "string" },
    ]);
    expect(validateMetadata({ owner: [] }, FIELDS)).toEqual([
      { key: "owner", code: "required", type: "string" },
    ]);
  });

  it("says nothing else about a field it has already called missing", () => {
    expect(validateMetadata({ owner: "a", dueDate: "" }, FIELDS)).toEqual([]);
  });

  it("reports a value outside the choices, carrying the choices for the message", () => {
    expect(validateMetadata({ owner: "a", status: "done" }, FIELDS)).toEqual([
      { key: "status", code: "enum", type: "enum", values: ["draft", "review", "approved"] },
    ]);
  });

  it("reports a malformed date, and a date that is not text at all", () => {
    expect(validateMetadata({ owner: "a", dueDate: "2026-02-30" }, FIELDS)).toEqual([
      { key: "dueDate", code: "date", type: "date" },
    ]);
    expect(validateMetadata({ owner: "a", dueDate: "1 March" }, FIELDS)).toEqual([
      { key: "dueDate", code: "date", type: "date" },
    ]);
    expect(validateMetadata({ owner: "a", dueDate: ["2026-01-01"] }, FIELDS)).toEqual([
      { key: "dueDate", code: "type", type: "date" },
    ]);
  });

  it("reports the wrong kind of value", () => {
    expect(validateMetadata({ owner: "a", sourceRef: "x" }, FIELDS)).toEqual([
      { key: "sourceRef", code: "type", type: "map" },
    ]);
    expect(
      validateMetadata({ owner: "a", n: "x" }, [...FIELDS, { key: "n", type: "number" }]),
    ).toEqual([{ key: "n", code: "type", type: "number" }]);
  });

  it("takes a schema object as readily as a bare list of fields", () => {
    expect(validateMetadata({}, { fields: FIELDS })).toEqual([
      { key: "owner", code: "required", type: "string" },
    ]);
    expect(validateMetadata("not an object", FIELDS)).toEqual([
      { key: "owner", code: "required", type: "string" },
    ]);
  });

  it("holds a number to JSON's idea of one, and a boolean to true/false exactly", () => {
    const more: MetadataField[] = [
      { key: "n", type: "number" },
      { key: "b", type: "boolean" },
    ];
    expect(validateMetadata({ n: "-1.5e3", b: "false" }, more)).toEqual([]);
    expect(validateMetadata({ n: "0x10", b: "yes" }, more)).toEqual([
      { key: "n", code: "type", type: "number" },
      { key: "b", code: "type", type: "boolean" },
    ]);
  });

  it("keeps a newline out of a string, which is what a long text field is for", () => {
    const more: MetadataField[] = [
      { key: "s", type: "string" },
      { key: "long", type: "text" },
    ];
    expect(validateMetadata({ s: "one line", long: "two\nlines" }, more)).toEqual([]);
    expect(validateMetadata({ s: "two\nlines" }, more)).toEqual([
      { key: "s", code: "type", type: "string" },
    ]);
  });

  it("accepts a list written as the comma-joined scalar the engine flattens it to", () => {
    expect(validateMetadata({ owner: "a", tags: "one, two" }, FIELDS)).toEqual([]);
  });

  it("says nothing about keys the schema does not declare", () => {
    expect(validateMetadata({ owner: "a", handWritten: "kept" }, FIELDS)).toEqual([]);
  });

  it("says nothing at all when no schema is configured", () => {
    expect(validateMetadata({ anything: "goes" }, [])).toEqual([]);
  });
});

describe("metadataRows", () => {
  it("puts declared fields first, then the file's own keys, then carried values", () => {
    const rows = metadataRows(
      { status: "review", handWritten: "kept" },
      FIELDS,
      new Map([
        ["sourceRef", ["sourceRef:", "  repo: x"]],
        ["notes", ["notes: |", "  a note"]],
      ]),
    );
    // A declared key that is carried keeps its place in the schema's order and
    // gets one row, the read-only one — not an empty control beside it.
    expect(rows.map((r) => [r.key, r.kind])).toEqual([
      ["owner", "declared"],
      ["status", "declared"],
      ["tags", "declared"],
      ["dueDate", "declared"],
      ["sourceRef", "carried"],
      ["handWritten", "extra"],
      ["notes", "carried"],
    ]);
    expect(rows.find((r) => r.key === "owner")?.present).toBe(false);
    expect(rows.find((r) => r.key === "sourceRef")?.lines).toEqual(["sourceRef:", "  repo: x"]);
  });

  it("does not call a carried key missing — the document plainly has one", () => {
    const problems = validateMetadata({}, FIELDS);
    expect(withoutCarried(problems, ["owner"])).toEqual([]);
    expect(withoutCarried(problems, [])).toEqual(problems);
  });

  it("shows every key of a document in a project with no schema", () => {
    const rows = metadataRows({ owner: "a", tags: ["x"] }, []);
    expect(rows.map((r) => r.key)).toEqual(["owner", "tags"]);
    expect(rows.every((r) => r.kind === "extra")).toBe(true);
  });
});

describe("defaults", () => {
  it("fills only the declared fields that are empty", () => {
    expect(withDefaults({ status: "approved" }, FIELDS)).toEqual({ status: "approved" });
    expect(withDefaults({ owner: "a" }, FIELDS)).toEqual({ owner: "a", status: "draft" });
  });

  it("starts a list field from a comma-separated default", () => {
    expect(defaultValueOf({ key: "tags", type: "list", default: "a, b" })).toEqual(["a", "b"]);
    expect(defaultValueOf({ key: "tags", type: "list" })).toEqual([]);
  });
});

describe("values", () => {
  /**
   * These cases are the engine's exported `metaText`, spelled out so the swap
   * to that import when `feat/md-metadata-engine` merges is a one-line change
   * that either keeps this green or tells us the two had drifted.
   */
  it("flattens every shape to one line of text", () => {
    expect(metaText("plain")).toBe("plain");
    expect(metaText(["order", "credit"])).toBe("order, credit");
    expect(metaText({ system: "SAP", module: "FI" })).toBe("system: SAP, module: FI");
    expect(metaText({ repo: { name: "docs" } })).toBe("repo: name: docs");
  });

  it("is empty for everything with nothing in it, so a caller can skip the line", () => {
    expect(metaText({})).toBe("");
    expect(metaText([])).toBe("");
    expect(metaText(undefined)).toBe("");
  });

  it("shows a nested value in the map editor but refuses to take it back", () => {
    const entries = mapEntriesOf({ repo: "acme/flows", tags: ["a", "b"] });
    expect(entries).toEqual([
      { key: "repo", text: "acme/flows", editable: true },
      { key: "tags", text: "a, b", editable: false },
    ]);
    expect(mapEntriesOf("not a map")).toEqual([]);
  });

  it("reads list items from a sequence or a comma-joined scalar", () => {
    expect(listItemsOf(["a", "b"])).toEqual(["a", "b"]);
    expect(listItemsOf("a, b ,c")).toEqual(["a", "b", "c"]);
    expect(listItemsOf({ a: "1" })).toEqual([]);
  });

  it("knows an ISO date from a date that does not exist", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-2-8")).toBe(false);
  });

  it("only allows keys YAML and the search box can both hold", () => {
    expect(isMetadataKey("dueDate")).toBe(true);
    expect(isMetadataKey("source.ref-1")).toBe(true);
    expect(isMetadataKey("has space")).toBe(false);
    expect(isMetadataKey("a:b")).toBe(false);
    expect(isMetadataKey("a#b")).toBe(false);
    expect(isMetadataKey("")).toBe(false);
  });
});

describe("search", () => {
  const docs: MetadataDocument[] = [
    { path: "flows/a.md", meta: { status: "review", owner: "sales-ops", tags: ["billing"] } },
    { path: "flows/b.md", meta: { status: "draft", owner: "ops", tags: ["billing", "urgent"] } },
    { path: "notes/c.md", meta: { status: "approved" } },
  ];

  it("reads key:value terms and free words", () => {
    expect(parseMetadataQuery("status:review billing")).toEqual({
      filters: [{ key: "status", value: "review" }],
      words: ["billing"],
    });
  });

  it("accepts a space after the colon, and quotes around a value", () => {
    expect(parseMetadataQuery('owner: "sales ops"')).toEqual({
      filters: [{ key: "owner", value: "sales ops" }],
      words: [],
    });
  });

  it("treats a bare colon-less word as free text", () => {
    expect(parseMetadataQuery("billing")).toEqual({ filters: [], words: ["billing"] });
  });

  it("filters by a declared key", () => {
    expect(searchDocuments(docs, "status:review").map((d) => d.path)).toEqual(["flows/a.md"]);
  });

  it("matches one item of a list exactly", () => {
    expect(searchDocuments(docs, "tags:urgent").map((d) => d.path)).toEqual(["flows/b.md"]);
    expect(searchDocuments(docs, "tags:billing").map((d) => d.path)).toEqual([
      "flows/a.md",
      "flows/b.md",
    ]);
  });

  it("ands filters together, and searches free words over path and values", () => {
    expect(searchDocuments(docs, "status:draft tags:billing").map((d) => d.path)).toEqual([
      "flows/b.md",
    ]);
    expect(searchDocuments(docs, "notes").map((d) => d.path)).toEqual(["notes/c.md"]);
  });

  it("returns everything for an empty query", () => {
    expect(searchDocuments(docs, "   ")).toHaveLength(3);
  });

  it("takes filters chosen in the UI alongside the typed query, and matches them whole", () => {
    expect(
      searchDocuments(docs, "", [{ key: "owner", value: "ops", exact: true }]).map((d) => d.path),
    ).toEqual(["flows/b.md"]);
    // The same value typed is a substring search, so it also finds sales-ops.
    expect(searchDocuments(docs, "owner:ops").map((d) => d.path)).toEqual([
      "flows/a.md",
      "flows/b.md",
    ]);
  });

  it("matches an owner by substring but a missing key never matches", () => {
    expect(documentMatches(docs[0], parseMetadataQuery("owner:sales"))).toBe(true);
    expect(documentMatches(docs[2], parseMetadataQuery("owner:sales"))).toBe(false);
  });

  it("offers the values actually in use, and every key worth filtering on", () => {
    expect(valuesInUse(docs, "status")).toEqual(["approved", "draft", "review"]);
    expect(valuesInUse(docs, "tags")).toEqual(["billing", "urgent"]);
    expect(filterableKeys(docs, FIELDS)).toEqual([
      "owner",
      "status",
      "tags",
      "dueDate",
      "sourceRef",
    ]);
    expect(filterableKeys(docs, [])).toEqual(["status", "owner", "tags"]);
  });
});
