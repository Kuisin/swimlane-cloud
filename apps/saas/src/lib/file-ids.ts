/**
 * Stable per-file ids (`file_identities`), so a deep link keeps opening the
 * same file after it moves to another folder.
 *
 * A diagram's editor-level identity is its POSIX path (see
 * @swimlane-cloud/editor's dsl-document.js), and that is what git, the
 * `drafts` table, and every host adapter key on. A path is not stable across
 * a move, so `?file=<path>` breaks the moment someone drags a file into a
 * different folder. This table adds an id that survives that: minted lazily
 * per project the first time a path is seen (see `ensureFileIds`, called
 * from the tree route), and repointed in place by the one function that
 * already handles a rename (POST .../files {op:"rename"}).
 */
import { getServiceSupabase } from "./supabase/server";
import { ApiError } from "./api";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Every path in `paths` gets a file id for this project, minting one for any
 * that don't have one yet, and the full path -> id map for exactly the
 * requested paths comes back. Lazy by design: a repository that predates this
 * table acquires ids one tree listing at a time, with no backfill needed.
 */
export async function ensureFileIds(
  projectId: string,
  paths: string[],
): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const supabase = getServiceSupabase();

  const { data: existing, error: selectError } = await supabase
    .from("file_identities")
    .select("id, filepath")
    .eq("project_id", projectId)
    .in("filepath", paths);
  if (selectError) throw new ApiError(500, `file id lookup failed: ${selectError.message}`);

  const byPath: Record<string, string> = {};
  for (const row of existing ?? []) byPath[row.filepath as string] = row.id as string;

  const missing = paths.filter((p) => !(p in byPath));
  if (missing.length === 0) return byPath;

  // `ignoreDuplicates` so a path minted by a concurrent request (the unique
  // (project_id, filepath) index wins the race) doesn't turn into a 500 here.
  const { data: inserted, error: insertError } = await supabase
    .from("file_identities")
    .upsert(
      missing.map((filepath) => ({ project_id: projectId, filepath })),
      { onConflict: "project_id,filepath", ignoreDuplicates: true },
    )
    .select("id, filepath");
  if (insertError) throw new ApiError(500, `file id mint failed: ${insertError.message}`);
  for (const row of inserted ?? []) byPath[row.filepath as string] = row.id as string;

  // A path that lost that race isn't returned by an ignoreDuplicates upsert,
  // so read back whatever is still unaccounted for.
  const stillMissing = missing.filter((p) => !(p in byPath));
  if (stillMissing.length > 0) {
    const { data: reread, error: rereadError } = await supabase
      .from("file_identities")
      .select("id, filepath")
      .eq("project_id", projectId)
      .in("filepath", stillMissing);
    if (rereadError) throw new ApiError(500, `file id lookup failed: ${rereadError.message}`);
    for (const row of reread ?? []) byPath[row.filepath as string] = row.id as string;
  }

  return byPath;
}

/** Current path for a file id within a project, or null if it's unknown. */
export async function resolveFileId(projectId: string, fid: string): Promise<string | null> {
  if (!UUID_RE.test(fid)) return null; // avoid a Postgres error on a garbage/foreign fid
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("file_identities")
    .select("filepath")
    .eq("project_id", projectId)
    .eq("id", fid)
    .maybeSingle();
  if (error) throw new ApiError(500, `file id resolve failed: ${error.message}`);
  return (data?.filepath as string | undefined) ?? null;
}

/**
 * Repoint a path's identity at its new location. Called from the one place
 * the app moves a file (POST .../files {op:"rename"}) alongside the existing
 * `drafts` upsert + tombstone, so the id follows the move instead of a new
 * one being minted for `to` and the old row going stale.
 *
 * Deliberately only called for a rename on the shared integration branch, not
 * on a private `tmp-*` edit branch: identity is per-project, not per-branch,
 * so repointing it for a rename that only exists in one person's unmerged
 * edit session would make that fid resolve to a path other branches don't
 * have yet. Deletes are left alone for the same reason — a stale row just
 * means a fid resolves to a path whose content fetch then 404s on that
 * branch, which is the correct failure, not the wrong file opening silently.
 */
export async function moveFileId(projectId: string, from: string, to: string): Promise<void> {
  const supabase = getServiceSupabase();
  const { error } = await supabase
    .from("file_identities")
    .update({ filepath: to })
    .eq("project_id", projectId)
    .eq("filepath", from);
  if (error) throw new ApiError(500, `file id move failed: ${error.message}`);
}
