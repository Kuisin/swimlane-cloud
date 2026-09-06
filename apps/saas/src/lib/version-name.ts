/**
 * Version numbers for the one-step Publish flow: always semver, normalized
 * to a `v` prefix, with the next one suggested from what has already shipped.
 */

export const SEMVER_RE = /^v?(\d+)\.(\d+)\.(\d+)$/;

/** "1.2.0" or "v1.2.0" → "v1.2.0"; anything else (including "1.2") → null. */
export function normalizeVersionName(input: string): string | null {
  const m = SEMVER_RE.exec(input.trim());
  if (!m) return null;
  return `v${m[1]}.${m[2]}.${m[3]}`;
}

type SemverTuple = [number, number, number];

function parseTuple(name: string): SemverTuple | null {
  const m = SEMVER_RE.exec(name.trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function compareTuples(a: SemverTuple, b: SemverTuple): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i]! - b[i]!;
  }
  return 0;
}

/** The highest existing semver name among `existing`, minor bumped; `v1.0.0` if none match. */
export function nextVersionName(existing: string[]): string {
  let best: SemverTuple | null = null;
  for (const name of existing) {
    const tuple = parseTuple(name);
    if (tuple && (!best || compareTuples(tuple, best) > 0)) best = tuple;
  }
  if (!best) return "v1.0.0";
  const [major, minor] = best;
  return `v${major}.${minor + 1}.0`;
}
