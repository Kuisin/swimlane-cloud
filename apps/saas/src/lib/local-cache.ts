/**
 * A small localStorage cache that makes navigation instant without ever
 * presenting stale data as fresh.
 *
 * Two kinds of entry live here, and the difference is the whole design:
 *
 *  - **Stale-while-revalidate** entries (project state, tree listings, the
 *    dashboard's project list). Shown at once so the page paints, then
 *    replaced by the server's answer — which is always fetched. The cached
 *    copy is a head start, never the answer.
 *  - **Versioned** entries (file text keyed by `git:<sha>` or
 *    `draft:<updated_at>`, see `file-version.ts`). Immutable by construction:
 *    the text under a version token never changes, so it is served without a
 *    request — but only after a fresh tree listing has confirmed that token
 *    is the file's current version.
 *
 * Every function takes the storage explicitly so the logic is testable with
 * a plain object; `localCache` binds them to `window.localStorage` and is
 * what the app uses. Storage is best-effort throughout: quota errors, private
 * mode and corrupt entries all degrade to "no cache", never to an exception.
 */

export interface StorageLike {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const PREFIX = "sw-cache:";
/** Bump to invalidate every entry after an incompatible change to a cached shape. */
const FORMAT = 1;

/** Total bytes this cache may hold; the oldest entries go first when exceeded. */
export const DEFAULT_BUDGET_BYTES = 3_000_000;
/** Entries older than this are treated as misses and dropped on read. */
export const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface Envelope<T> {
  f: number;
  at: number;
  value: T;
}

export interface CacheHit<T> {
  value: T;
  /** When the entry was written (ms since epoch). */
  at: number;
}

/** The cache keys the app uses, in one place so producers and consumers cannot drift. */
export const CACHE_KEY = {
  state: (projectId: string) => `state:${projectId}`,
  tree: (projectId: string, branch: string) => `tree:${projectId}:${branch}`,
  file: (projectId: string, path: string, version: string) =>
    `file:${projectId}:${version}:${path}`,
  snapshot: (projectId: string, sha: string) => `snapshot:${projectId}:${sha}`,
  compare: (projectId: string, base: string, head: string) =>
    `compare:${projectId}:${base}..${head}`,
  projects: () => "projects",
} as const;

function fullKey(key: string): string {
  return `${PREFIX}${key}`;
}

/** UTF-16 storage cost of one entry, close enough to what browsers charge against quota. */
function entryBytes(key: string, raw: string): number {
  return (key.length + raw.length) * 2;
}

/** Every key this cache owns (full storage keys). */
export function cacheEntries(storage: StorageLike | null): string[] {
  if (!storage) return [];
  const keys: string[] = [];
  try {
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
  } catch {
    /* unavailable */
  }
  return keys;
}

export function cacheGet<T>(
  storage: StorageLike | null,
  key: string,
  opts: { maxAgeMs?: number; now?: number } = {},
): CacheHit<T> | null {
  if (!storage) return null;
  const k = fullKey(key);
  let raw: string | null;
  try {
    raw = storage.getItem(k);
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed: Envelope<T>;
  try {
    parsed = JSON.parse(raw) as Envelope<T>;
  } catch {
    cacheDelete(storage, key);
    return null;
  }
  if (!parsed || parsed.f !== FORMAT || typeof parsed.at !== "number" || !("value" in parsed)) {
    cacheDelete(storage, key);
    return null;
  }
  const now = opts.now ?? Date.now();
  const maxAge = opts.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  if (now - parsed.at > maxAge) {
    cacheDelete(storage, key);
    return null;
  }
  return { value: parsed.value, at: parsed.at };
}

/**
 * Write an entry. Returns false when it could not be stored (quota exhausted
 * even after evicting, or storage unavailable) — callers treat that as "no
 * cache", never as an error.
 */
export function cacheSet<T>(
  storage: StorageLike | null,
  key: string,
  value: T,
  opts: { budgetBytes?: number; now?: number } = {},
): boolean {
  if (!storage) return false;
  const now = opts.now ?? Date.now();
  const budget = opts.budgetBytes ?? DEFAULT_BUDGET_BYTES;
  const k = fullKey(key);
  const envelope: Envelope<T> = { f: FORMAT, at: now, value };
  let raw: string;
  try {
    raw = JSON.stringify(envelope);
  } catch {
    return false;
  }
  if (entryBytes(k, raw) > budget) return false;
  try {
    storage.setItem(k, raw);
  } catch {
    // The browser's quota, which may be far below our budget (other origins,
    // private mode). Free half of what is actually stored and try again; if
    // that is still not enough, keep nothing but this entry.
    cacheEvict(storage, Math.floor(cacheBytes(storage) / 2), { now, protect: k });
    try {
      storage.setItem(k, raw);
    } catch {
      cacheEvict(storage, 0, { now, protect: k });
      try {
        storage.setItem(k, raw);
      } catch {
        return false;
      }
    }
  }
  cacheEvict(storage, budget, { now, protect: k });
  return true;
}

/** Bytes this cache currently occupies (by the same estimate eviction uses). */
export function cacheBytes(storage: StorageLike | null): number {
  if (!storage) return 0;
  let total = 0;
  for (const key of cacheEntries(storage)) {
    try {
      const raw = storage.getItem(key);
      if (raw) total += entryBytes(key, raw);
    } catch {
      /* ignore */
    }
  }
  return total;
}

export function cacheDelete(storage: StorageLike | null, key: string): void {
  if (!storage) return;
  try {
    storage.removeItem(fullKey(key));
  } catch {
    /* ignore */
  }
}

/** Remove every entry, or only those whose key starts with `keyPrefix`. */
export function cacheClear(storage: StorageLike | null, keyPrefix = ""): void {
  if (!storage) return;
  const prefix = fullKey(keyPrefix);
  for (const k of cacheEntries(storage)) {
    if (!k.startsWith(prefix)) continue;
    try {
      storage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Drop the oldest entries until the cache fits `budgetBytes`. Also drops
 * anything unreadable. `protect` names one key never to evict (the one being
 * written).
 */
export function cacheEvict(
  storage: StorageLike | null,
  budgetBytes: number,
  opts: { now?: number; protect?: string } = {},
): void {
  if (!storage) return;
  const entries: { key: string; at: number; bytes: number }[] = [];
  for (const key of cacheEntries(storage)) {
    let raw: string | null = null;
    try {
      raw = storage.getItem(key);
    } catch {
      /* ignore */
    }
    if (!raw) continue;
    let at = 0;
    try {
      const parsed = JSON.parse(raw) as Envelope<unknown>;
      at = typeof parsed?.at === "number" ? parsed.at : 0;
    } catch {
      at = 0;
    }
    entries.push({ key, at, bytes: entryBytes(key, raw) });
  }
  let total = entries.reduce((sum, e) => sum + e.bytes, 0);
  if (total <= budgetBytes) return;
  entries.sort((a, b) => a.at - b.at);
  for (const e of entries) {
    if (total <= budgetBytes) break;
    if (e.key === opts.protect) continue;
    try {
      storage.removeItem(e.key);
      total -= e.bytes;
    } catch {
      /* ignore */
    }
  }
}

function browserStorage(): StorageLike | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The cache bound to `window.localStorage`; a no-op wherever that is unavailable. */
export const localCache = {
  get<T>(key: string): CacheHit<T> | null {
    return cacheGet<T>(browserStorage(), key);
  },
  set<T>(key: string, value: T): boolean {
    return cacheSet(browserStorage(), key, value);
  },
  delete(key: string): void {
    cacheDelete(browserStorage(), key);
  },
  clear(keyPrefix = ""): void {
    cacheClear(browserStorage(), keyPrefix);
  },
};
