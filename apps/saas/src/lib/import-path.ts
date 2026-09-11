import { dirOf } from "@swimlane-cloud/diagram-converter/parser";

/**
 * Where an `@use` operand points, as a path from the repository root.
 *
 * `./` and `../` resolve against the importing file, everything else against
 * the root — exactly one lookup, no probing (dsl-rule.md I03/I04).
 *
 * This is shared rather than inlined because two callers have to agree on it
 * exactly: the route that fetches an import, and the conversion that rewrites
 * one. If they disagreed, a conversion would silently break an import it
 * believed it had left alone.
 */
export function resolveImportPath(from: string, path: string): string {
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
