/**
 * A stored file's metadata, and the project rule that says whether it is good
 * enough to commit.
 *
 * Where the metadata lives depends on how the diagram is stored: a `.md` keeps
 * it in YAML frontmatter (the source of truth), a `.txt` in the DSL's `/meta/`
 * section. Both are "this document's metadata" to a person, so both are read
 * here and judged by the same declared schema.
 *
 * The enforcement point is deliberately the same as `templates.ts`'s
 * `assertForcedSections`: a 422 thrown from the routes that turn work into a
 * commit. See `assertValidMetadataForFile` for why the draft route is the one
 * place that only flags.
 */
import { readMetaSection } from "@swimlane-cloud/diagram-converter/markdown-doc";
import { PROD_BRANCH, REPO_SETTINGS_PATH } from "@swimlane-cloud/github-client";
import { ApiError } from "./api";
import { dslOf, isDiagramFile, isMarkdownFile } from "./diagram-file";
import { metaOf } from "./markdown-prose";
import {
  labelOf,
  readMetadataFields,
  validateMetadata,
  withoutCarried,
  type MetaRecord,
  type MetadataField,
  type MetadataProblem,
} from "./metadata-schema";
import { readTextAt } from "./repo-files";
import type { RepoApis } from "./repo-apis";

/**
 * The metadata `text` holds, or `null` when the file has none to judge.
 *
 * `null` is the signal to skip a file rather than to fail on it — a `.gitkeep`,
 * an image, or a prose `.md` nobody has given frontmatter has no metadata, and
 * inventing an empty record for it would make every required field fail on
 * files that were never documents in this sense.
 */
export function metadataOf(path: string, text: string): MetaRecord | null {
  if (!isDiagramFile(path)) return null;
  if (isMarkdownFile(path)) {
    const { meta, hadFrontmatter } = metaOf(text);
    const isDiagram = dslOf(path, text) !== null;
    return hadFrontmatter || isDiagram ? meta : null;
  }
  const dsl = dslOf(path, text);
  if (dsl === null) return null;
  return readMetaSection(dsl).meta as MetaRecord;
}

/**
 * A file's metadata plus the keys of it the engine can only carry verbatim —
 * what the search listing shows, and what the Document form renders read-only.
 */
export function metadataEntryOf(
  path: string,
  text: string,
): { meta: MetaRecord; carried: string[] } | null {
  if (!isDiagramFile(path)) return null;
  if (!isMarkdownFile(path)) {
    const meta = metadataOf(path, text);
    return meta === null ? null : { meta, carried: [] };
  }
  const { meta, carried, hadFrontmatter } = metaOf(text);
  if (!hadFrontmatter && dslOf(path, text) === null) return null;
  return { meta, carried };
}

/** Every declared problem in `text`, or `[]` when there is nothing to check. */
export function metadataProblemsForFile(
  path: string,
  text: string,
  fields: MetadataField[],
): MetadataProblem[] {
  if (!fields.length) return [];
  const entry = metadataEntryOf(path, text);
  if (entry === null) return [];
  return withoutCarried(validateMetadata(entry.meta, fields), entry.carried);
}

/** One problem as the sentence an API error carries. Mirrors `templates.ts`'s phrasing. */
export function describeProblem(
  problem: MetadataProblem,
  fields: MetadataField[],
  path: string,
): string {
  const field = fields.find((f) => f.key === problem.key);
  const name = field ? labelOf(field) : problem.key;
  switch (problem.code) {
    case "required":
      return `${path}: "${name}" is required.`;
    case "enum":
      return `${path}: "${name}" must be one of ${(problem.values ?? []).join(", ")}.`;
    case "date":
      return `${path}: "${name}" must be a date (YYYY-MM-DD).`;
    case "type":
      return `${path}: "${name}" must be a ${problem.type}.`;
  }
}

/**
 * Throw a 422 when `text` breaks the project's metadata schema.
 *
 * ONE caller today: the checkpoint route, which is the only path in this app
 * that turns drafts into a commit. **That is a fact about the routes as they
 * stand, not a property of the system** — anything new that writes a document
 * into git (a bulk import, a second commit route) has to call this, or the
 * project's metadata rules silently stop applying down that path while
 * appearing to be enforced everywhere. Add the call with the route.
 *
 * The obligation follows the token, not the caller: a route that can reach a
 * repository owes this check, and one that cannot is out of scope by
 * construction. `/api/mcp` is the case worth knowing — its tools are pure
 * functions of the text handed to them and it holds no token at all, so a model
 * using it cannot write anywhere; its output reaches git only when a person
 * saves it through the editor, which comes back through here. That route
 * documents the invariant itself ("a tool that would need a token does not
 * belong on this route"), so the day it stops being true is a change somebody
 * has to argue for rather than one that quietly lands.
 *
 * Pointedly **not** the draft route, which the editor hits on every autosave.
 * Forced sections can be asserted that early because their content is
 * machine-inserted from a template and is right from the first keystroke; a
 * required metadata key is typed by a person over minutes, so asserting it per
 * autosave would make a document with a required field impossible to edit at
 * all. The form flags it live instead, and this is where it stops being only a
 * warning.
 *
 * Pointedly not the rename in `files/route.ts` either, which does assert forced
 * sections. That check is there because a `.txt`↔`.md` rename rewrites the
 * file and can change what sections it has; a rename never changes metadata, so
 * judging it there would only block a move over a problem the move did not
 * create.
 *
 * Only the files a request is actually writing are checked, exactly as
 * `assertForcedSectionsForFile` is: turning on a new required field must not
 * retroactively freeze every document in the repository.
 */
export function assertValidMetadataForFile(
  path: string,
  text: string,
  fields: MetadataField[],
): void {
  const problems = metadataProblemsForFile(path, text, fields);
  if (!problems.length) return;
  throw new ApiError(422, describeProblem(problems[0], fields, path), {
    metadataProblems: problems.map((p) => ({ path, ...p })),
  });
}

/**
 * The project's declared fields, read from `swimlane-settings.json` on `main`.
 *
 * One extra Contents read per commit, on a file the settings page already
 * writes there. Unlike template policies — mirrored into Postgres because the
 * forced-section check runs against five sections and a pinned body — this is a
 * single small document, and keeping it in the repository means a schema edited
 * on GitHub by hand takes effect without a second write path to keep in step.
 */
export async function loadMetadataFields(ctx: RepoApis): Promise<MetadataField[]> {
  const text = await readTextAt(ctx, REPO_SETTINGS_PATH, PROD_BRANCH).catch(() => null);
  return readMetadataFields(text);
}
