import { INTEGRATION_BRANCH } from "@swimlane-cloud/github-client";
import { ASSET_EXTENSIONS, checkImportPath, dirOf } from "@swimlane-cloud/diagram-converter/parser";
import { withApi, json, ApiError } from "@/lib/api";
import { assertRef, assertRepoPath } from "@/lib/guard";
import { requireProjectRole } from "@/lib/projects";
import { readTextAt, resolveSha } from "@/lib/repo-files";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Matches the parser: an image is embedded, everything else is merged text. */
const MIME: Record<string, string> = ASSET_EXTENSIONS;

/** 2 MiB, the parser's per-image ceiling, checked before we send the bytes. */
const MAX_BYTES = 2 * 1024 * 1024;

/** `./` and `../` resolve against the importing file, everything else at the root. */
function resolveImportPath(from: string, path: string): string {
  const segments =
    path.startsWith("./") || path.startsWith("../")
      ? `${dirOf(from)}/${path}`.split("/")
      : path.split("/");
  const parts: string[] = [];
  for (const seg of segments) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return parts.join("/");
}

/**
 * GET /api/projects/[projectId]/import?branch=&from=&path=
 *
 * One `@use` target for the editor: `{ text }` for a fragment, `{ dataUri }`
 * for an image. The parser cannot fetch during a parse, so the editor reads
 * targets through here and re-parses when they land.
 *
 * The path is validated with the same rules the parser applies and resolved
 * the same way, then read at the branch tip — so a caller cannot reach outside
 * the repository, and a draft of an imported file is deliberately not
 * consulted: an import is a committed dependency.
 */
export const GET = withApi(async (req, ctx: { params: Promise<{ projectId: string }> }) => {
  const { projectId } = await ctx.params;
  const url = new URL(req.url);
  const branch = url.searchParams.get("branch") ?? INTEGRATION_BRANCH;
  const from = url.searchParams.get("from") ?? "";
  const path = url.searchParams.get("path");
  if (!path) throw new ApiError(400, "path is required");
  assertRef(branch);

  const bad = checkImportPath(path, dirOf(from));
  if (bad) throw new ApiError(400, bad);
  const target = assertRepoPath(resolveImportPath(from, path));

  const project = await requireProjectRole(projectId, "viewer");
  const extension = target.slice(target.lastIndexOf(".") + 1).toLowerCase();
  const mime = MIME[extension];

  if (!mime) {
    const text = await readTextAt(project, target, branch);
    if (text === null) throw new ApiError(404, `${path} does not exist on ${branch}.`);
    return json({ text });
  }

  if (!project.write.readFileBase64) {
    throw new ApiError(501, "This provider cannot read images.");
  }
  const sha = await resolveSha(project, branch);
  const base64 = await project.write.readFileBase64(target, sha);
  if (base64 === null) throw new ApiError(404, `${path} does not exist on ${branch}.`);
  if ((base64.length * 3) / 4 > MAX_BYTES) {
    throw new ApiError(413, `${path} is larger than the 2 MiB limit for an imported image.`);
  }
  return json({ dataUri: `data:${mime};base64,${base64}` });
});
