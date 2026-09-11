import { describe, expect, it } from "vitest";
import {
  clearMirror,
  clearScope,
  mirrorKey,
  readMirror,
  reconcileMirror,
  writeMirror,
} from "./local-mirror.js";

/** Minimal in-memory Storage stand-in, so these tests never touch jsdom's localStorage. */
function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    get length() {
      return map.size;
    },
    key: (i) => [...map.keys()][i] ?? null,
    _map: map,
  };
}

describe("mirrorKey", () => {
  it("namespaces by scope and id", () => {
    expect(mirrorKey("proj:branch", "a.txt")).toBe("sw-mirror:proj:branch:a.txt");
  });
});

describe("writeMirror / readMirror / clearMirror", () => {
  it("round-trips src and base", () => {
    const storage = fakeStorage();
    writeMirror(storage, "s", "a.txt", "new text", "old text");
    expect(readMirror(storage, "s", "a.txt")).toMatchObject({ src: "new text", base: "old text" });
  });

  it("returns null when nothing is stored", () => {
    expect(readMirror(fakeStorage(), "s", "missing.txt")).toBeNull();
  });

  it("tolerates corrupt JSON instead of throwing", () => {
    const storage = fakeStorage();
    storage.setItem(mirrorKey("s", "a.txt"), "{not json");
    expect(readMirror(storage, "s", "a.txt")).toBeNull();
  });

  it("tolerates a well-formed but shapeless value", () => {
    const storage = fakeStorage();
    storage.setItem(mirrorKey("s", "a.txt"), JSON.stringify({ foo: "bar" }));
    expect(readMirror(storage, "s", "a.txt")).toBeNull();
  });

  it("clearMirror removes only that document", () => {
    const storage = fakeStorage();
    writeMirror(storage, "s", "a.txt", "1", "0");
    writeMirror(storage, "s", "b.txt", "1", "0");
    clearMirror(storage, "s", "a.txt");
    expect(readMirror(storage, "s", "a.txt")).toBeNull();
    expect(readMirror(storage, "s", "b.txt")).not.toBeNull();
  });

  it("silently no-ops when storage is unavailable", () => {
    expect(() => writeMirror(null, "s", "a.txt", "1", "0")).not.toThrow();
    expect(readMirror(null, "s", "a.txt")).toBeNull();
    expect(() => clearMirror(null, "s", "a.txt")).not.toThrow();
  });
});

describe("clearScope", () => {
  it("removes every key under the scope and leaves other scopes intact", () => {
    const storage = fakeStorage();
    writeMirror(storage, "proj:branch-1", "a.txt", "1", "0");
    writeMirror(storage, "proj:branch-1", "b.txt", "1", "0");
    writeMirror(storage, "proj:branch-2", "a.txt", "1", "0");
    clearScope(storage, "proj:branch-1");
    expect(readMirror(storage, "proj:branch-1", "a.txt")).toBeNull();
    expect(readMirror(storage, "proj:branch-1", "b.txt")).toBeNull();
    expect(readMirror(storage, "proj:branch-2", "a.txt")).not.toBeNull();
  });
});

describe("reconcileMirror", () => {
  it("drops when there is no mirror", () => {
    expect(reconcileMirror(null, "host content")).toEqual({
      action: "drop",
      src: "host content",
    });
  });

  it("drops when the mirror already matches the host (already synced)", () => {
    const mirror = { src: "same", base: "old", at: 1 };
    expect(reconcileMirror(mirror, "same")).toEqual({ action: "drop", src: "same" });
  });

  it("restores when the host is unchanged since the local edit", () => {
    const mirror = { src: "my local edit", base: "host content", at: 1 };
    expect(reconcileMirror(mirror, "host content")).toEqual({
      action: "restore",
      src: "my local edit",
    });
  });

  it("drops when the host moved since the local edit, never clobbering a remote save", () => {
    const mirror = { src: "my local edit", base: "stale base", at: 1 };
    expect(reconcileMirror(mirror, "someone else's save")).toEqual({
      action: "drop",
      src: "someone else's save",
    });
  });
});
