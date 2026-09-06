/**
 * Resolving `@use` for the editor.
 *
 * The parser is synchronous and a host's file read is not, so an import cannot
 * be fetched during a parse. The editor keeps what it has already read in a
 * cache, parses with whatever is in it, and re-parses when a read lands. A
 * diagram therefore appears immediately, without its imports, and fills in.
 *
 * Entries are keyed by the importing file as well as the target, because `./`
 * and `../` resolve against the importing file: two diagrams in different
 * folders writing `./shared.txt` mean two different files.
 */
import { scanImports } from "@swimlane-cloud/diagram-converter/parser";

/** A read that produced nothing. Cached, so a missing file is read once. */
const MISSING = Object.freeze({ missing: true });

export function cacheKey(filename, path) {
  return `${filename || ""} ${path}`;
}

/**
 * The imports of `src` the cache has no answer for, deduped, in source order.
 * An import that resolved to nothing counts as answered.
 */
export function missingImports(src, filename, cache) {
  const seen = new Set();
  const out = [];
  for (const use of scanImports(src, filename)) {
    const key = cacheKey(filename, use.path);
    if (seen.has(key) || cache.has(key)) continue;
    seen.add(key);
    out.push(use);
  }
  return out;
}

/** Parser options over the cache. Never throws, never blocks, never reads. */
export function resolversFrom(filename, cache) {
  const read = (path, field) => {
    const hit = cache.get(cacheKey(filename, path));
    if (!hit || hit === MISSING) return null;
    return hit[field] ?? null;
  };
  return {
    filename,
    resolveImport: (path) => read(path, "text"),
    resolveAsset: (path) => read(path, "dataUri"),
  };
}

/**
 * Read every outstanding import through the host.
 *
 * A host implementing neither reader returns nothing, which is why an app that
 * has not been wired degrades to "the import did not resolve" rather than to
 * an error. A failed read is cached as missing, so a broken path is not
 * retried on every keystroke.
 */
export async function fetchImports(uses, host) {
  const entries = [];
  await Promise.all(
    uses.map(async (use) => {
      try {
        if (use.kind === "asset") {
          const dataUri = host?.readAsset ? await host.readAsset(use.path) : null;
          entries.push([use.path, typeof dataUri === "string" ? { dataUri } : MISSING]);
          return;
        }
        const text = host?.readImport ? await host.readImport(use.path) : null;
        entries.push([use.path, typeof text === "string" ? { text } : MISSING]);
      } catch {
        entries.push([use.path, MISSING]);
      }
    }),
  );
  return entries;
}

/** A new cache with `entries` added; the old one is left alone for React. */
export function withEntries(cache, filename, entries) {
  const next = new Map(cache);
  for (const [path, value] of entries) next.set(cacheKey(filename, path), value);
  return next;
}
