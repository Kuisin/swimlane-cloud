/**
 * Paths a step's link points at.
 *
 * A link is written the way an `@use` import is: relative to the folder of
 * the file it appears in (`../sales/order.md`), or from the diagrams root
 * with a leading `/` (`/sales/order.md`). Hosts hold repository-relative ids
 * (`sales/order.md`), so both directions are needed — resolving a link to an
 * id to open it, and writing the shortest relative form back into the DSL
 * when the GUI picks a target.
 */

function segmentsOf(path) {
  return String(path ?? "")
    .split("/")
    .filter((s) => s !== "" && s !== ".");
}

/** The folder part of a repository-relative file path, as segments. */
function dirSegments(file) {
  const segs = segmentsOf(file);
  segs.pop();
  return segs;
}

/**
 * The repository-relative id a link points at from `fromFile`, or `null`
 * when it climbs out of the repository. `..` past the root is a broken link,
 * not a file.
 */
export function resolveLinkPath(link, fromFile) {
  const raw = String(link ?? "").trim();
  if (!raw) return null;
  const base = raw.startsWith("/") ? [] : dirSegments(fromFile);
  for (const seg of segmentsOf(raw)) {
    if (seg === "..") {
      if (!base.length) return null;
      base.pop();
      continue;
    }
    base.push(seg);
  }
  return base.length ? base.join("/") : null;
}

/**
 * The shortest link from `fromFile` to `targetFile`: a bare name for a
 * sibling, `../` per folder climbed otherwise. Always relative, never a
 * leading `/`, so moving a whole folder keeps its internal links intact.
 */
export function relativeLinkPath(targetFile, fromFile) {
  const target = segmentsOf(targetFile);
  const from = dirSegments(fromFile);
  let common = 0;
  while (common < from.length && common < target.length - 1 && from[common] === target[common]) {
    common++;
  }
  const ups = from.length - common;
  const rest = target.slice(common);
  return [...Array(ups).fill(".."), ...rest].join("/");
}
