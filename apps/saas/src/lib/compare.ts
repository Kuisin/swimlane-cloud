/**
 * Changed diagrams between two refs, with the text on both sides — what the
 * commit detail and pull-request review views render.
 */
import type { ProjectCtx } from "./projects";
import { isDiagramPath, mapLimit, readConfigAt, readTextAt } from "./repo-files";
import type { CompareFile, CompareResponse } from "./types";

const FILE_CAP = 100;

/** Changed diagrams between two refs, with the text on both sides. */
export async function compareDiagrams(
  ctx: ProjectCtx,
  base: string,
  head: string,
): Promise<CompareResponse> {
  const cmp = await ctx.commits.compare(base, head);
  const config = await readConfigAt(ctx, head);
  const relevant = cmp.files
    .filter(
      (f) =>
        isDiagramPath(f.path, config) || (f.previousPath && isDiagramPath(f.previousPath, config)),
    )
    .filter((f) => f.status !== "unchanged")
    .slice(0, FILE_CAP);

  const files = await mapLimit(relevant, 8, async (f): Promise<CompareFile> => {
    const status: CompareFile["status"] =
      f.status === "added"
        ? "added"
        : f.status === "removed"
          ? "removed"
          : f.status === "renamed"
            ? "renamed"
            : "changed";
    const beforePath = f.previousPath ?? f.path;
    const [before, after] = await Promise.all([
      status === "added" ? null : readTextAt(ctx, beforePath, cmp.mergeBaseSha),
      status === "removed" ? null : readTextAt(ctx, f.path, head),
    ]);
    return { path: f.path, status, before, after };
  });

  return {
    status: cmp.status,
    aheadBy: cmp.aheadBy,
    behindBy: cmp.behindBy,
    mergeBaseSha: cmp.mergeBaseSha,
    files,
  };
}
