/**
 * The document-metadata schema a project declares, and everything pure that
 * hangs off it: parsing it out of the settings file, validating a document's
 * frontmatter against it, turning it into form rows, and matching a document
 * against a search query.
 *
 * A `.md` diagram carries its metadata in YAML frontmatter, which the engine
 * (`@swimlane-cloud/diagram-converter/markdown-doc`) reads and writes; the
 * frontmatter is the source of truth and `/meta/` inside the fence is only a
 * scalar projection of it. This module never parses or writes frontmatter
 * itself — it only describes what the keys are allowed to look like.
 *
 * The schema type, its parser and its validator live in
 * `@swimlane-cloud/github-client` (`metadata-schema.ts`) — the same module the
 * settings file itself is parsed by — and are re-exported here. Everything
 * below the "form state" heading is this app's own: turning a schema into form
 * rows, and matching a document against a search query. Nothing else in
 * `apps/saas` may hand-roll any of it; it all goes through this module.
 */

import { metaText } from "@swimlane-cloud/diagram-converter/markdown-doc";
import {
  isMetadataKey,
  METADATA_FIELD_TYPES,
  METADATA_PROBLEM_CODES,
  metadataDefaults,
  parseMetadataSchema,
  parseRepoSettings,
  repoSettingsJson,
  validateMetadata,
  type MetadataField,
  type MetadataFieldType,
  type MetadataProblem,
  type MetadataProblemCode,
  type MetadataSchema,
  type MetadataValue,
  type SwimlaneSettings,
} from "@swimlane-cloud/github-client";

export {
  metaText,
  isMetadataKey,
  METADATA_FIELD_TYPES,
  METADATA_PROBLEM_CODES,
  metadataDefaults,
  parseMetadataSchema,
  validateMetadata,
  type MetadataField,
  type MetadataFieldType,
  type MetadataProblem,
  type MetadataProblemCode,
  type MetadataSchema,
  type MetadataValue,
};

export type MetaValue = MetadataValue;
export type MetaRecord = Record<string, MetadataValue>;

/* ─────────────────────────────── the schema ────────────────────────────── */

/**
 * The fields declared in a settings file's text.
 *
 * Reads the raw JSON rather than `parseRepoSettings`, which does not carry the
 * `metadata` key yet — see the note at the top of this file.
 */
/**
 * The declared fields in `raw`, skipping anything malformed — the fields-only
 * view of `parseMetadataSchema`, which is the shape the settings route works
 * in (it receives and stores a bare array).
 */
export function parseMetadataFields(raw: unknown): MetadataField[] {
  return parseMetadataSchema(raw).fields;
}

/** The fields declared in a settings file's text. */
export function readMetadataFields(text: string | null): MetadataField[] {
  return parseRepoSettings(text).metadata.fields;
}

/**
 * The settings file as the app reads it: everything `parseRepoSettings` knows
 * about, plus the metadata schema it does not carry yet.
 */
/**
 * The settings file as the app reads it. `SwimlaneSettings` carries the
 * metadata schema itself, so this is now just an alias — kept as a name so
 * call sites read as being about a project rather than a repository.
 */
export type ProjectSettings = SwimlaneSettings;

export function parseProjectSettings(text: string | null): ProjectSettings {
  return parseRepoSettings(text);
}

/** The file's canonical text for `settings`. */
export function projectSettingsJson(settings: ProjectSettings): string {
  return repoSettingsJson(settings);
}

export function fieldFor(fields: MetadataField[], key: string): MetadataField | null {
  return fields.find((f) => f.key === key) ?? null;
}

export function labelOf(field: MetadataField): string {
  return field.label?.trim() || field.key;
}

/* ───────────────────────────────── values ──────────────────────────────── */

export function isListValue(value: MetadataValue | undefined): value is string[] {
  return Array.isArray(value);
}

export function isMapValue(
  value: MetadataValue | undefined,
): value is { [key: string]: MetadataValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Absent, as the validator means it: nothing filled in. */
export function isEmptyValue(value: MetadataValue | undefined): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value === "";
  if (Array.isArray(value)) return value.length === 0;
  return Object.keys(value).length === 0;
}

/** The separator the engine flattens a sequence to, and the one we split on. */
const LIST_SEP = ", ";

/** The items of a list value, however it happens to be stored. */
export function listItemsOf(value: MetadataValue | undefined): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

/** One row of the nested-map editor. */
export interface MapEntry {
  key: string;
  text: string;
  /**
   * False when the value is itself a list or a map, which this editor can show
   * as a line but not take back as one. Typing over it would replace a
   * structure with the text of that structure, so the control refuses.
   */
  editable: boolean;
}

/** A map value's entries, for the nested-map editor. */
export function mapEntriesOf(value: MetadataValue | undefined): MapEntry[] {
  if (!isMapValue(value)) return [];
  return Object.entries(value).map(([key, v]) => ({
    key,
    text: metaText(v as MetadataValue),
    editable: typeof v === "string",
  }));
}

/** `YYYY-MM-DD`, and a date that actually exists. */
export function isIsoDate(text: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const at = new Date(Date.UTC(y, mo - 1, d));
  return at.getUTCFullYear() === y && at.getUTCMonth() === mo - 1 && at.getUTCDate() === d;
}

export const BOOLEAN_TRUE = "true";
export const BOOLEAN_FALSE = "false";

/** Exactly `true` or `false` — not `TRUE`, not `yes`, not `1`. */
export function isBooleanText(text: string): boolean {
  return text === BOOLEAN_TRUE || text === BOOLEAN_FALSE;
}

export function booleanValueOf(value: MetadataValue | undefined): boolean {
  return metaText(value) === BOOLEAN_TRUE;
}

/** A JSON number, which is what a `number` field may hold. */
export function isNumberText(text: string): boolean {
  return /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/.test(text);
}

/* ─────────────────────────────── validation ────────────────────────────── */

/** Problems grouped by key, which is how the form asks for them. */
export function problemsByKey(problems: MetadataProblem[]): Record<string, MetadataProblem[]> {
  const out: Record<string, MetadataProblem[]> = {};
  for (const p of problems) (out[p.key] ??= []).push(p);
  return out;
}

/**
 * Problems about keys whose value the engine can only carry verbatim, removed.
 *
 * Such a key is absent from `meta` because it could not be modelled, not
 * because the document lacks it — calling it missing would be wrong, and would
 * block a push over a value that is right there in the file.
 */
export function withoutCarried(
  problems: MetadataProblem[],
  carried: readonly string[],
): MetadataProblem[] {
  return carried.length ? problems.filter((p) => !carried.includes(p.key)) : problems;
}

/* ────────────────────────────── form state ─────────────────────────────── */

/**
 * Where a row in the metadata form came from.
 * `declared` — the schema names it; `extra` — the file has it and the schema
 * does not; `carried` — the engine can only carry the value verbatim, so it is
 * shown but not editable.
 */
export type MetaRowKind = "declared" | "extra" | "carried";

export interface MetaRow {
  key: string;
  kind: MetaRowKind;
  /** The declared field, when there is one. */
  field: MetadataField | null;
  /** The current value; `""` for a declared key the file does not have yet. */
  value: MetadataValue;
  /** True when the file has this key at all (as opposed to the schema alone). */
  present: boolean;
  /** For `carried` rows: the lines exactly as the file holds them. */
  lines?: string[];
}

/**
 * The rows to render: every declared field in schema order, then every key the
 * file has that the schema does not, then the values carried verbatim.
 *
 * Declared-first is what makes the form feel like a form rather than a dump of
 * a file; keeping the undeclared keys is what stops the app quietly eating a
 * key somebody wrote by hand.
 */
export function metadataRows(
  meta: MetaRecord | undefined,
  fields: MetadataField[],
  carried: Map<string, string[]> = new Map(),
): MetaRow[] {
  const values = meta ?? {};
  const declared = new Set(fields.map((f) => f.key));
  const carriedRow = (key: string, field: MetadataField | null): MetaRow => ({
    key,
    kind: "carried",
    field,
    value: "",
    present: true,
    lines: carried.get(key) ?? [],
  });
  // A declared key the file writes in a shape the engine can only carry has
  // exactly one row — the read-only one. Showing an empty control beside it
  // would say the document has no value for a key that plainly does.
  const rows: MetaRow[] = fields.map((field) =>
    carried.has(field.key)
      ? carriedRow(field.key, field)
      : {
          key: field.key,
          kind: "declared",
          field,
          value: values[field.key] ?? "",
          present: field.key in values,
        },
  );
  for (const key of Object.keys(values)) {
    if (declared.has(key) || carried.has(key)) continue;
    rows.push({ key, kind: "extra", field: null, value: values[key] ?? "", present: true });
  }
  for (const key of carried.keys()) if (!declared.has(key)) rows.push(carriedRow(key, null));
  return rows;
}

/** The value a declared field starts at when the file does not have the key. */
export function defaultValueOf(field: MetadataField): MetadataValue {
  if (field.default === undefined) return field.type === "list" ? [] : "";
  return field.type === "list" ? listItemsOf(field.default) : field.default;
}

/**
 * `meta` with every declared field that the file is missing set to its default.
 *
 * Deliberately explicit — the form offers it as a button rather than applying
 * it on load, because writing keys into somebody's file merely because they
 * opened it would put a diff on every document in the project.
 */
export function withDefaults(meta: MetaRecord | undefined, fields: MetadataField[]): MetaRecord {
  const next: MetaRecord = { ...(meta ?? {}) };
  for (const field of fields) {
    if (field.default === undefined) continue;
    if (!isEmptyValue(next[field.key])) continue;
    next[field.key] = defaultValueOf(field);
  }
  return next;
}

/** True when any declared field could be filled in from its default. */
export function hasFillableDefaults(
  meta: MetaRecord | undefined,
  fields: MetadataField[],
): boolean {
  return fields.some((f) => f.default !== undefined && isEmptyValue((meta ?? {})[f.key]));
}

/** `meta` with `key` set — or removed, when the new value is empty and the key is not declared. */
export function setMetaValue(meta: MetaRecord, key: string, value: MetadataValue): MetaRecord {
  return { ...meta, [key]: value };
}

export function removeMetaKey(meta: MetaRecord, key: string): MetaRecord {
  const next = { ...meta };
  delete next[key];
  return next;
}

/* ──────────────────────────────── search ───────────────────────────────── */

export interface MetadataFilter {
  key: string;
  value: string;
  /**
   * Match the whole value rather than part of it. A filter picked from a
   * dropdown means *that* value — `owner: ops` chosen from a list must not also
   * bring back `sales-ops` — while `owner:ops` typed into the box is someone
   * narrowing down and wants the substring.
   */
  exact?: boolean;
}

export interface MetadataQuery {
  /** `key:value` terms, which must all match. */
  filters: MetadataFilter[];
  /** Bare words, each of which must appear somewhere in the document's metadata or path. */
  words: string[];
}

/**
 * Split a search box's text into `key: value` filters and free words.
 *
 * `status:review` and `status: review` mean the same thing, and a quoted value
 * keeps its spaces — `owner:"sales ops"`.
 */
export function parseMetadataQuery(text: string): MetadataQuery {
  const filters: MetadataFilter[] = [];
  const words: string[] = [];
  const tokens = String(text ?? "").match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
  for (let i = 0; i < tokens.length; i++) {
    let token = tokens[i];
    // `key:` alone, with the value in the next token (`status: review`).
    if (/^[^\s:"]+:$/.test(token) && tokens[i + 1] !== undefined) token += tokens[++i];
    const cut = token.indexOf(":");
    const key = cut > 0 ? token.slice(0, cut) : "";
    if (cut > 0 && isMetadataKey(key)) {
      const value = unquote(token.slice(cut + 1));
      if (value) filters.push({ key, value });
      continue;
    }
    const word = unquote(token);
    if (word) words.push(word);
  }
  return { filters, words };
}

function unquote(text: string): string {
  const t = text.trim();
  return t.startsWith('"') && t.endsWith('"') && t.length > 1 ? t.slice(1, -1).trim() : t;
}

/** True when `value` holds `needle` — an exact item for a list, a substring otherwise. */
function valueMatches(value: MetadataValue | undefined, needle: string, exact = false): boolean {
  const wanted = needle.toLowerCase();
  const items = listItemsOf(value);
  if (items.some((item) => item.toLowerCase() === wanted)) return true;
  const text = metaText(value).toLowerCase();
  return exact ? text === wanted : text.includes(wanted);
}

export interface MetadataDocument {
  path: string;
  meta: MetaRecord;
  /** Keys the engine can only carry verbatim, shown but not searchable by value. */
  carried?: string[];
}

/** True when `doc` satisfies every filter and contains every free word. */
export function documentMatches(doc: MetadataDocument, query: MetadataQuery): boolean {
  for (const filter of query.filters) {
    if (!valueMatches(doc.meta[filter.key], filter.value, filter.exact)) return false;
  }
  if (!query.words.length) return true;
  const haystack = [doc.path, ...Object.entries(doc.meta).map(([k, v]) => `${k} ${metaText(v)}`)]
    .join("\n")
    .toLowerCase();
  return query.words.every((w) => haystack.includes(w.toLowerCase()));
}

export function searchDocuments(
  docs: MetadataDocument[],
  text: string,
  filters: MetadataFilter[] = [],
): MetadataDocument[] {
  const query = parseMetadataQuery(text);
  const all: MetadataQuery = { filters: [...query.filters, ...filters], words: query.words };
  if (!all.filters.length && !all.words.length) return docs;
  return docs.filter((d) => documentMatches(d, all));
}

/**
 * Every value seen for `key` across `docs`, sorted — what the filter dropdowns
 * offer. A declared `enum` still shows its own values; this is for everything
 * else, where the only source of truth for "what is in use" is the documents.
 */
export function valuesInUse(docs: MetadataDocument[], key: string): string[] {
  const seen = new Set<string>();
  for (const doc of docs) {
    const value = doc.meta[key];
    if (isEmptyValue(value)) continue;
    const items = listItemsOf(value);
    if (items.length && (Array.isArray(value) || typeof value === "string")) {
      for (const item of items) seen.add(item);
    } else {
      seen.add(metaText(value));
    }
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

/** Keys worth offering as filters: the declared ones, then whatever else is in use. */
export function filterableKeys(docs: MetadataDocument[], fields: MetadataField[]): string[] {
  const keys = fields.map((f) => f.key);
  const seen = new Set(keys);
  for (const doc of docs) {
    for (const key of Object.keys(doc.meta)) {
      if (seen.has(key) || isEmptyValue(doc.meta[key])) continue;
      seen.add(key);
      keys.push(key);
    }
  }
  return keys;
}
