import { describe, expect, it } from "vitest";
import {
  cacheClear,
  cacheEntries,
  cacheEvict,
  cacheGet,
  cacheSet,
  type StorageLike,
} from "./local-cache";

/** In-memory localStorage stand-in, with an optional byte quota that throws like a browser does. */
class FakeStorage implements StorageLike {
  private map = new Map<string, string>();
  constructor(private quotaChars = Number.POSITIVE_INFINITY) {}
  get length() {
    return this.map.size;
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    const others = [...this.map.entries()]
      .filter(([key]) => key !== k)
      .reduce((n, [key, val]) => n + key.length + val.length, 0);
    if (others + k.length + v.length > this.quotaChars) {
      throw new DOMException("quota", "QuotaExceededError");
    }
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

describe("cacheGet / cacheSet", () => {
  it("round-trips a value and reports when it was written", () => {
    const s = new FakeStorage();
    expect(cacheSet(s, "state:p1", { a: 1 }, { now: 1000 })).toBe(true);
    expect(cacheGet(s, "state:p1", { now: 2000 })).toEqual({ value: { a: 1 }, at: 1000 });
  });

  it("misses on an unknown key and on no storage at all", () => {
    expect(cacheGet(new FakeStorage(), "nope")).toBeNull();
    expect(cacheGet(null, "nope")).toBeNull();
    expect(cacheSet(null, "k", 1)).toBe(false);
  });

  it("treats a corrupt entry as a miss and removes it", () => {
    const s = new FakeStorage();
    s.setItem("sw-cache:bad", "{not json");
    expect(cacheGet(s, "bad")).toBeNull();
    expect(s.getItem("sw-cache:bad")).toBeNull();
  });

  it("ignores an entry written by an incompatible format", () => {
    const s = new FakeStorage();
    s.setItem("sw-cache:old", JSON.stringify({ f: 0, at: 1, value: 1 }));
    expect(cacheGet(s, "old")).toBeNull();
  });

  it("expires an entry older than maxAgeMs", () => {
    const s = new FakeStorage();
    cacheSet(s, "k", "v", { now: 0 });
    expect(cacheGet(s, "k", { now: 10, maxAgeMs: 100 })).not.toBeNull();
    expect(cacheGet(s, "k", { now: 101, maxAgeMs: 100 })).toBeNull();
    expect(s.length).toBe(0);
  });

  it("refuses a single entry larger than the whole budget rather than thrashing", () => {
    const s = new FakeStorage();
    expect(cacheSet(s, "k", "x".repeat(1000), { budgetBytes: 100 })).toBe(false);
    expect(s.length).toBe(0);
  });
});

describe("eviction", () => {
  // Reads default to the real clock, so timestamps are offsets from now.
  const T = Date.now();

  it("drops the oldest entries first until the budget fits", () => {
    const s = new FakeStorage();
    cacheSet(s, "a", "x".repeat(100), { now: T - 3000, budgetBytes: 1_000_000 });
    cacheSet(s, "b", "x".repeat(100), { now: T - 2000, budgetBytes: 1_000_000 });
    cacheSet(s, "c", "x".repeat(100), { now: T - 1000, budgetBytes: 1_000_000 });
    // Each entry costs roughly (key + envelope) * 2 bytes; keep room for about two.
    cacheEvict(s, 600, { now: T });
    expect(cacheGet(s, "a")).toBeNull();
    expect(cacheGet(s, "b")).not.toBeNull();
    expect(cacheGet(s, "c")).not.toBeNull();
  });

  it("makes room when the browser throws on quota and keeps the entry being written", () => {
    // A quota far below the budget, the way a crowded origin behaves.
    const s = new FakeStorage(700);
    expect(cacheSet(s, "a", "x".repeat(200), { now: T - 3000 })).toBe(true);
    expect(cacheSet(s, "b", "x".repeat(200), { now: T - 2000 })).toBe(true);
    // A third entry does not fit; the oldest goes and the new one lands.
    expect(cacheSet(s, "c", "x".repeat(200), { now: T - 1000 })).toBe(true);
    expect(cacheGet(s, "a")).toBeNull();
    expect(cacheGet(s, "c")).not.toBeNull();
  });

  it("keeps nothing but the new entry when even half the cache is too much", () => {
    const s = new FakeStorage(300);
    expect(cacheSet(s, "a", "x".repeat(100), { now: T - 2000 })).toBe(true);
    expect(cacheSet(s, "big", "x".repeat(200), { now: T - 1000 })).toBe(true);
    expect(cacheGet(s, "a")).toBeNull();
    expect(cacheGet(s, "big")).not.toBeNull();
  });

  it("never evicts the entry just written even when it is the oldest by clock", () => {
    const s = new FakeStorage();
    cacheSet(s, "new", "x".repeat(100), { now: T - 5000, budgetBytes: 1_000_000 });
    cacheSet(s, "later", "x".repeat(100), { now: T - 1000, budgetBytes: 1_000_000 });
    cacheEvict(s, 300, { now: T, protect: "sw-cache:new" });
    expect(cacheGet(s, "new")).not.toBeNull();
  });
});

describe("cacheClear", () => {
  it("removes only this cache's keys, optionally under a prefix, and leaves other storage alone", () => {
    const s = new FakeStorage();
    s.setItem("sw-mirror:x", "keep");
    cacheSet(s, "state:p1", 1);
    cacheSet(s, "tree:p1:main", 2);
    cacheSet(s, "state:p2", 3);
    expect(cacheEntries(s).length).toBe(3);
    cacheClear(s, "state:");
    expect(cacheGet(s, "state:p1")).toBeNull();
    expect(cacheGet(s, "state:p2")).toBeNull();
    expect(cacheGet(s, "tree:p1:main")).not.toBeNull();
    cacheClear(s);
    expect(cacheEntries(s).length).toBe(0);
    expect(s.getItem("sw-mirror:x")).toBe("keep");
  });
});
