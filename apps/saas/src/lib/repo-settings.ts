/**
 * `.swimlane.json` as an editable document.
 *
 * The settings editor saves through the ordinary draft path, so the file
 * arrives here as text — either serialized from the form or typed by hand in
 * JSON mode. Both go through one gate: parse, validate, canonicalise. Storing
 * the canonical form means a hand-edited file and a form-edited one produce
 * identical bytes, so the diff on a settings commit only ever shows what
 * actually changed.
 */
import {
  REPO_CONFIG_PATH,
  serializeRepoConfig,
  validateRepoConfig,
  type RepoConfig,
} from "@swimlane-cloud/github-client";
import { LAYOUT_SETTINGS } from "@swimlane-cloud/diagram-converter/diagram-layout";
import { ApiError } from "./api";

const LAYOUT_BOUNDS = new Map(LAYOUT_SETTINGS.map((s) => [s.key, s]));

/**
 * Per-key layout bounds, which `validateRepoConfig` deliberately does not know:
 * `@swimlane-cloud/github-client` stays free of an engine dependency so it
 * remains light enough for the VS Code extension host. This app already depends
 * on the engine, so it is the right place to enforce them.
 */
function assertLayoutInRange(layout: RepoConfig["layout"]): void {
  for (const [key, value] of Object.entries(layout)) {
    const spec = LAYOUT_BOUNDS.get(key);
    if (!spec) {
      throw new ApiError(422, `layout.${key} is not a layout setting.`, { field: "layout", key });
    }
    if (value < spec.min || value > spec.max) {
      throw new ApiError(
        422,
        `layout.${key} must be between ${spec.min} and ${spec.max} (got ${value}).`,
        { field: "layout", key },
      );
    }
  }
}

/**
 * Text to store as the settings draft, or a 422 naming the offending field.
 *
 * `committedRaw` is the file currently on the branch; unknown keys in it are
 * carried through, so an editor built on today's fields cannot silently drop a
 * setting a future version adds.
 */
export function canonicalizeSettings(
  text: string,
  committedRaw: string | null,
): { raw: string; config: RepoConfig } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    const detail = err instanceof Error ? err.message : "could not be parsed";
    throw new ApiError(422, `${REPO_CONFIG_PATH} is not valid JSON: ${detail}`, { field: "json" });
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ApiError(422, `${REPO_CONFIG_PATH} must be a JSON object.`, { field: "json" });
  }

  const { config, errors } = validateRepoConfig(parsed);
  if (errors.length > 0) {
    const first = errors[0]!;
    throw new ApiError(422, `${first.field} ${first.message}.`, {
      field: first.field,
      fields: errors,
    });
  }
  assertLayoutInRange(config.layout);

  return { raw: serializeRepoConfig(config, committedRaw), config };
}
