/**
 * The metadata schema a project declares for its diagrams.
 *
 * A `.md` diagram's metadata lives in its own frontmatter — see
 * `packages/diagram-converter/src/markdown-doc.js`, which parses it into
 * `string | string[] | { … }` and writes it back in the shape the author used.
 * That module deliberately knows nothing about *meaning*: any key is allowed,
 * because a repository must be able to carry metadata this app has never heard
 * of. This module is the other half — what a particular project says its
 * diagrams *should* carry, so the app can render a form for it and tell an
 * author when a value is wrong.
 *
 * It is declaration, not enforcement. A file with extra keys is fine; a file
 * missing a required one is reported, not rejected. Nothing here can make a
 * document unreadable, which is the whole reason the schema is optional and the
 * parser is total.
 *
 * Lives beside `repo-settings.ts` and is re-exported from it: the schema is one
 * more section of the settings file, and follows the same rules — parse
 * leniently, drop anything malformed, never throw.
 */

/**
 * What a field holds.
 *
 * Frontmatter has no numbers and no booleans — every scalar is a string — so
 * `number` and `boolean` describe how a *string* must read, not a different
 * runtime type. `list` is a string array, `map` a nested object.
 */
export const METADATA_FIELD_TYPES = [
  "string",
  "text",
  "enum",
  "list",
  "date",
  "number",
  "boolean",
  "map",
] as const;
export type MetadataFieldType = (typeof METADATA_FIELD_TYPES)[number];

/** A metadata value, exactly as `splitFrontmatter` models it. */
export type MetadataValue = string | string[] | { [key: string]: MetadataValue };

export interface MetadataField {
  /** The frontmatter key this field describes. */
  key: string;
  type: MetadataFieldType;
  /** `enum` only: the values the field accepts. */
  values?: string[];
  /** Shown instead of `key`; the key itself when absent. */
  label?: string;
  required?: boolean;
  /** Prefilled into a new document. Dropped when it is not valid for `type`. */
  default?: MetadataValue;
  /** One line of guidance under the input. */
  help?: string;
}

export interface MetadataSchema {
  fields: MetadataField[];
}

/** No declared fields: every key is free-form, which is what a repo gets today. */
export const DEFAULT_METADATA_SCHEMA: MetadataSchema = { fields: [] };

/* ─────────────────────────────── parsing ───────────────────────────────── */

/** A key that would not survive being written back as `key: value`. */
const BAD_KEY = /[\s:#]/;

/**
 * Whether `key` is one this schema can actually hold.
 *
 * Exported because an editor offering a key field has to refuse exactly what
 * `parseField` refuses — otherwise it accepts a key that is silently dropped
 * the next time the file is read, which looks like the save not working.
 */
export function isMetadataKey(key: string | null | undefined): boolean {
  const value = typeof key === "string" ? key.trim() : "";
  return value !== "" && !BAD_KEY.test(value);
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const NUMBER = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function trimmed(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * `raw` as a metadata value, or `undefined` when it is not one.
 *
 * JSON can say `3` or `true` where the document can only hold `"3"`/`"true"`,
 * so those are normalised rather than refused — an owner writing a default in
 * the settings file should not have to know that.
 */
function asValue(raw: unknown): MetadataValue | undefined {
  if (typeof raw === "string") return raw;
  if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  if (typeof raw === "boolean") return String(raw);
  if (Array.isArray(raw)) {
    const items = raw.map((item) => asValue(item));
    return items.every((item): item is string => typeof item === "string") ? items : undefined;
  }
  if (isPlainObject(raw)) {
    const out: Record<string, MetadataValue> = {};
    for (const [key, value] of Object.entries(raw)) {
      const item = asValue(value);
      if (item !== undefined) out[key] = item;
    }
    return out;
  }
  return undefined;
}

/** The `values` of an `enum`, deduplicated, or null when there are none. */
function enumValues(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out: string[] = [];
  for (const item of raw) {
    const value = trimmed(item);
    if (value && !out.includes(value)) out.push(value);
  }
  return out.length ? out : null;
}

function parseField(raw: unknown): MetadataField | null {
  if (!isPlainObject(raw)) return null;
  const key = trimmed(raw.key);
  if (key === null || !isMetadataKey(key)) return null;
  const type = raw.type;
  if (!(METADATA_FIELD_TYPES as readonly unknown[]).includes(type)) return null;

  const values = type === "enum" ? enumValues(raw.values) : null;
  // An enum with nothing to choose from could never be satisfied, so the field
  // is dropped rather than left as a permanent error on every document.
  if (type === "enum" && !values) return null;

  const field: MetadataField = { key, type: type as MetadataFieldType };
  if (values) field.values = values;

  const label = trimmed(raw.label);
  if (label) field.label = label;
  if (raw.required === true) field.required = true;

  const fallback = asValue(raw.default);
  // A default the field itself would reject is worse than no default at all.
  if (fallback !== undefined && !problemFor(field, fallback)) field.default = fallback;

  const help = trimmed(raw.help);
  if (help) field.help = help;
  return field;
}

/**
 * Read a `metadata` block, total and lenient: anything malformed is dropped,
 * nothing throws, an absent block is an empty schema.
 *
 * Accepts either `{ fields: [...] }` or a bare array of fields. Where two
 * fields declare the same key the first one wins, so a later duplicate cannot
 * quietly change what the form above it already showed.
 */
export function parseMetadataSchema(raw: unknown): MetadataSchema {
  const list = Array.isArray(raw) ? raw : isPlainObject(raw) ? raw.fields : null;
  if (!Array.isArray(list)) return { fields: [] };

  const fields: MetadataField[] = [];
  const seen = new Set<string>();
  for (const entry of list) {
    const field = parseField(entry);
    if (!field || seen.has(field.key)) continue;
    seen.add(field.key);
    fields.push(field);
  }
  return { fields };
}

/** The values a new document starts with: every field that declares a default. */
export function metadataDefaults(
  schema: MetadataSchema | readonly MetadataField[],
): Record<string, MetadataValue> {
  const out: Record<string, MetadataValue> = {};
  for (const field of fieldsOf(schema)) {
    if (field.default !== undefined) out[field.key] = field.default;
  }
  return out;
}

/* ────────────────────────────── validation ─────────────────────────────── */

/**
 * What is wrong with one value:
 * `required` — declared required and absent or empty;
 * `enum` — a string, but not one the field allows;
 * `date` — shaped `YYYY-MM-DD`-ish but not a real calendar date;
 * `type` — the wrong kind of value for the declared type.
 */
export const METADATA_PROBLEM_CODES = ["required", "enum", "type", "date"] as const;
export type MetadataProblemCode = (typeof METADATA_PROBLEM_CODES)[number];

/**
 * One problem, as data. Deliberately no prose: the app renders these in the
 * user's language, so everything a message needs is here as a value.
 */
export interface MetadataProblem {
  key: string;
  code: MetadataProblemCode;
  /** The field's declared type, for the message. */
  type: MetadataFieldType;
  /** `enum` only: the values the field allows. */
  values?: string[];
}

function isRealDate(value: string): boolean {
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (month < 1 || month > 12 || day < 1) return false;
  const at = new Date(Date.UTC(year, month - 1, day));
  return at.getUTCFullYear() === year && at.getUTCMonth() === month - 1 && at.getUTCDate() === day;
}

/** True when there is nothing here to check — absent, blank, or empty. */
function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  if (isPlainObject(value)) return Object.keys(value).length === 0;
  return false;
}

/** The code for what is wrong with a non-empty `value`, or null when it fits. */
function problemFor(field: MetadataField, value: unknown): MetadataProblemCode | null {
  switch (field.type) {
    case "string":
      // A single-line input cannot hold a newline; `text` is the multi-line one.
      return typeof value === "string" && !/[\n\r]/.test(value) ? null : "type";
    case "text":
      return typeof value === "string" ? null : "type";
    case "enum":
      if (typeof value !== "string") return "type";
      return field.values?.includes(value) ? null : "enum";
    case "list":
      // A list may also arrive in the flat, comma-joined form `/meta/` projects
      // it to, so a string is accepted rather than reported on every document.
      if (typeof value === "string") return null;
      return Array.isArray(value) && value.every((item) => typeof item === "string")
        ? null
        : "type";
    case "date":
      if (typeof value !== "string") return "type";
      return isRealDate(value) ? null : "date";
    case "number":
      return typeof value === "string" && NUMBER.test(value.trim()) ? null : "type";
    case "boolean":
      return value === "true" || value === "false" ? null : "type";
    case "map":
      return isPlainObject(value) ? null : "type";
  }
}

function fieldsOf(schema: MetadataSchema | readonly MetadataField[]): readonly MetadataField[] {
  if (Array.isArray(schema)) return schema;
  return (schema as MetadataSchema)?.fields ?? [];
}

/**
 * Check a document's metadata against what the project declared.
 *
 * Pure, no I/O, and in schema order so a form can show problems per field.
 * A key the schema does not mention is never a problem: the schema says what a
 * diagram *should* carry, not all it *may*.
 */
export function validateMetadata(
  meta: unknown,
  schema: MetadataSchema | readonly MetadataField[],
): MetadataProblem[] {
  const values = isPlainObject(meta) ? meta : {};
  const problems: MetadataProblem[] = [];

  for (const field of fieldsOf(schema)) {
    const value = values[field.key];
    if (isEmpty(value)) {
      if (field.required) problems.push({ key: field.key, code: "required", type: field.type });
      continue;
    }
    const code = problemFor(field, value);
    if (!code) continue;
    problems.push({
      key: field.key,
      code,
      type: field.type,
      ...(field.values ? { values: field.values } : {}),
    });
  }
  return problems;
}
