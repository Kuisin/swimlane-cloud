/**
 * The schema is editable by anyone with repository access and is read on every
 * page load, so the parser has to be total: a typo in `swimlane-settings.json`
 * may cost a field, never a page. The validator is the other half — it has to
 * say exactly what is wrong, in data, so the app can phrase it in any language.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_METADATA_SCHEMA,
  metadataDefaults,
  parseMetadataSchema,
  validateMetadata,
  type MetadataField,
} from "./metadata-schema.ts";

/** The shape the product documents, verbatim. */
const DECLARED = {
  fields: [
    { key: "owner", type: "string", label: "Owner", required: true },
    { key: "status", type: "enum", values: ["draft", "review", "approved"], default: "draft" },
    { key: "tags", type: "list" },
    { key: "reviewedBy", type: "list", label: "Reviewed by" },
    { key: "dueDate", type: "date" },
    { key: "sourceRef", type: "map" },
  ],
};

describe("parseMetadataSchema", () => {
  it("reads the documented shape unchanged", () => {
    expect(parseMetadataSchema(DECLARED).fields).toEqual([
      { key: "owner", type: "string", label: "Owner", required: true },
      { key: "status", type: "enum", values: ["draft", "review", "approved"], default: "draft" },
      { key: "tags", type: "list" },
      { key: "reviewedBy", type: "list", label: "Reviewed by" },
      { key: "dueDate", type: "date" },
      { key: "sourceRef", type: "map" },
    ]);
  });

  it("defaults to no fields, which is what every repo has today", () => {
    for (const raw of [undefined, null, "", 0, "a string", true, {}, { fields: {} }]) {
      expect(parseMetadataSchema(raw), String(raw)).toEqual(DEFAULT_METADATA_SCHEMA);
    }
  });

  it("accepts a bare array of fields as well as { fields }", () => {
    expect(parseMetadataSchema(DECLARED.fields)).toEqual(parseMetadataSchema(DECLARED));
  });

  it("drops a field with no usable key", () => {
    const parsed = parseMetadataSchema({
      fields: [
        { type: "string" },
        { key: "", type: "string" },
        { key: 7, type: "string" },
        { key: "has space", type: "string" },
        { key: "has:colon", type: "string" },
        { key: "  owner  ", type: "string" },
      ],
    });
    expect(parsed.fields).toEqual([{ key: "owner", type: "string" }]);
  });

  it("drops a field whose type it does not know", () => {
    const parsed = parseMetadataSchema({
      fields: [
        { key: "a", type: "colour" },
        { key: "b", type: 3 },
        { key: "c" },
        { key: "d", type: "date" },
      ],
    });
    expect(parsed.fields).toEqual([{ key: "d", type: "date" }]);
  });

  it("drops an enum with nothing to choose from", () => {
    const parsed = parseMetadataSchema({
      fields: [
        { key: "a", type: "enum" },
        { key: "b", type: "enum", values: [] },
        { key: "c", type: "enum", values: [1, 2] },
        { key: "d", type: "enum", values: ["x", "x", " y ", 3] },
      ],
    });
    expect(parsed.fields).toEqual([{ key: "d", type: "enum", values: ["x", "y"] }]);
  });

  it("keeps the first of two fields declaring the same key", () => {
    const parsed = parseMetadataSchema({
      fields: [
        { key: "status", type: "enum", values: ["draft"] },
        { key: "status", type: "string" },
      ],
    });
    expect(parsed.fields).toEqual([{ key: "status", type: "enum", values: ["draft"] }]);
  });

  it("ignores wrongly typed options rather than carrying them through", () => {
    const parsed = parseMetadataSchema({
      fields: [{ key: "a", type: "string", label: 7, required: "yes", help: "   " }],
    });
    expect(parsed.fields).toEqual([{ key: "a", type: "string" }]);
  });

  it("normalises a default the document could only hold as a string", () => {
    const parsed = parseMetadataSchema({
      fields: [
        { key: "n", type: "number", default: 3 },
        { key: "b", type: "boolean", default: true },
        { key: "l", type: "list", default: ["a", 2] },
      ],
    });
    expect(parsed.fields).toEqual([
      { key: "n", type: "number", default: "3" },
      { key: "b", type: "boolean", default: "true" },
      { key: "l", type: "list", default: ["a", "2"] },
    ]);
  });

  it("drops a default the field would itself reject", () => {
    const parsed = parseMetadataSchema({
      fields: [
        { key: "s", type: "enum", values: ["draft"], default: "shipped" },
        { key: "d", type: "date", default: "yesterday" },
        { key: "m", type: "map", default: "not a map" },
      ],
    });
    expect(parsed.fields.every((f) => f.default === undefined)).toBe(true);
    expect(parsed.fields).toHaveLength(3);
  });

  it("drops only the broken entries, keeping the rest in order", () => {
    const parsed = parseMetadataSchema({
      fields: [{ key: "a", type: "string" }, "nonsense", null, { key: "b", type: "list" }],
    });
    expect(parsed.fields.map((f) => f.key)).toEqual(["a", "b"]);
  });

  it("is idempotent, so normalising a settings file twice changes nothing", () => {
    const once = parseMetadataSchema(DECLARED);
    expect(parseMetadataSchema(JSON.parse(JSON.stringify(once)))).toEqual(once);
  });
});

describe("metadataDefaults", () => {
  it("prefills only the fields that declare one", () => {
    expect(metadataDefaults(parseMetadataSchema(DECLARED))).toEqual({ status: "draft" });
    expect(metadataDefaults(DEFAULT_METADATA_SCHEMA)).toEqual({});
  });
});

describe("validateMetadata", () => {
  const schema = parseMetadataSchema(DECLARED);

  it("passes a document that satisfies the schema", () => {
    expect(
      validateMetadata(
        {
          owner: "fi.coe@example.com",
          status: "review",
          tags: ["order", "credit"],
          dueDate: "2026-02-28",
          sourceRef: { system: "SAP" },
        },
        schema,
      ),
    ).toEqual([]);
  });

  it("reports a required field that is absent or empty", () => {
    for (const meta of [{}, { owner: "" }, { owner: [] }, { owner: {} }, { owner: null }]) {
      expect(validateMetadata(meta, schema)).toEqual([
        { key: "owner", code: "required", type: "string" },
      ]);
    }
  });

  it("says nothing about an optional field that is absent", () => {
    expect(validateMetadata({ owner: "x" }, schema)).toEqual([]);
  });

  it("reports a value outside the enum, and carries the choices with it", () => {
    expect(validateMetadata({ owner: "x", status: "shipped" }, schema)).toEqual([
      { key: "status", code: "enum", type: "enum", values: ["draft", "review", "approved"] },
    ]);
  });

  it("reports a malformed date, and separates it from a wrongly typed one", () => {
    const dates: MetadataField[] = [{ key: "d", type: "date" }];
    expect(validateMetadata({ d: "2026-02-30" }, dates)).toEqual([
      { key: "d", code: "date", type: "date" },
    ]);
    expect(validateMetadata({ d: "28/02/2026" }, dates)).toEqual([
      { key: "d", code: "date", type: "date" },
    ]);
    expect(validateMetadata({ d: "2026-13-01" }, dates)).toEqual([
      { key: "d", code: "date", type: "date" },
    ]);
    expect(validateMetadata({ d: ["2026-02-28"] }, dates)).toEqual([
      { key: "d", code: "type", type: "date" },
    ]);
    expect(validateMetadata({ d: "2026-02-28" }, dates)).toEqual([]);
    // a leap day is a real date, and the year before it is not
    expect(validateMetadata({ d: "2028-02-29" }, dates)).toEqual([]);
    expect(validateMetadata({ d: "2027-02-29" }, dates)).toEqual([
      { key: "d", code: "date", type: "date" },
    ]);
  });

  it("reports the wrong kind of value for every declared type", () => {
    const one = (type: MetadataField["type"], value: unknown) =>
      validateMetadata({ v: value }, [{ key: "v", type }]).map((p) => p.code);

    expect(one("string", ["a"])).toEqual(["type"]);
    // a newline belongs in `text`, not in a single-line `string`
    expect(one("string", "two\nlines")).toEqual(["type"]);
    expect(one("text", "two\nlines")).toEqual([]);
    expect(one("text", { a: "b" })).toEqual(["type"]);
    expect(one("list", [1])).toEqual(["type"]);
    expect(one("list", { a: "b" })).toEqual(["type"]);
    expect(one("list", ["a", "b"])).toEqual([]);
    expect(one("number", "12.5e3")).toEqual([]);
    expect(one("number", "-4")).toEqual([]);
    expect(one("number", "twelve")).toEqual(["type"]);
    expect(one("number", ["1"])).toEqual(["type"]);
    expect(one("boolean", "true")).toEqual([]);
    expect(one("boolean", "TRUE")).toEqual(["type"]);
    expect(one("boolean", "1")).toEqual(["type"]);
    expect(one("map", { a: "b" })).toEqual([]);
    expect(one("map", ["a"])).toEqual(["type"]);
    expect(one("map", "a")).toEqual(["type"]);
    // `parseMetadataSchema` never lets an enum through without values, but a
    // hand-built field still fails closed rather than accepting anything.
    expect(one("enum", "x")).toEqual(["enum"]);
  });

  it("accepts a list in the flat form /meta/ projects it to", () => {
    // A document read back through the fence hands `tags` over comma-joined;
    // reporting that as a type error would flag every diagram in the repo.
    expect(validateMetadata({ owner: "x", tags: "order, credit" }, schema)).toEqual([]);
  });

  it("says nothing about a key the schema never mentions", () => {
    expect(validateMetadata({ owner: "x", somethingElse: { deep: "value" } }, schema)).toEqual([]);
  });

  it("reports in schema order, and survives being handed nonsense", () => {
    expect(validateMetadata({ status: 7, dueDate: "soon" }, schema).map((p) => p.key)).toEqual([
      "owner",
      "status",
      "dueDate",
    ]);
    for (const meta of [null, undefined, "a string", 7, ["a"]]) {
      expect(
        validateMetadata(meta, schema).map((p) => p.key),
        String(meta),
      ).toEqual(["owner"]);
    }
    expect(validateMetadata({}, DEFAULT_METADATA_SCHEMA)).toEqual([]);
  });
});
