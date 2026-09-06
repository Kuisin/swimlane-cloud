import { describe, expect, it } from "vitest";
import {
  createHistory,
  pushHistory,
  undo,
  redo,
  canUndo,
  canRedo,
  currentSrc,
} from "./undo-stack.js";

describe("undo-stack", () => {
  it("has nothing to undo/redo on a fresh history", () => {
    const h = createHistory("a");
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
    expect(currentSrc(h)).toBe("a");
  });

  it("undo/redo are no-ops (same reference) past either end", () => {
    const h = createHistory("a");
    expect(undo(h)).toBe(h);
    const h2 = pushHistory(h, "b", { tag: "structural", now: 1000 });
    expect(redo(h2)).toBe(h2);
  });

  it("coalesces consecutive typing pushes within the idle window into one entry", () => {
    let h = createHistory("a");
    h = pushHistory(h, "ab", { tag: "typing", now: 1000 });
    h = pushHistory(h, "abc", { tag: "typing", now: 1200 });
    h = pushHistory(h, "abcd", { tag: "typing", now: 1400 });
    expect(h.entries).toEqual(["a", "abcd"]);
    expect(currentSrc(h)).toBe("abcd");
    h = undo(h);
    expect(currentSrc(h)).toBe("a");
  });

  it("starts a new entry when the idle window has elapsed", () => {
    let h = createHistory("a");
    h = pushHistory(h, "ab", { tag: "typing", now: 1000 });
    h = pushHistory(h, "abc", { tag: "typing", now: 1000 + 601 });
    expect(h.entries).toEqual(["a", "ab", "abc"]);
  });

  it("never coalesces structural pushes, even back to back", () => {
    let h = createHistory("a");
    h = pushHistory(h, "b", { tag: "structural", now: 1000 });
    h = pushHistory(h, "c", { tag: "structural", now: 1001 });
    expect(h.entries).toEqual(["a", "b", "c"]);
  });

  it("does not coalesce a typing push into a preceding structural push", () => {
    let h = createHistory("a");
    h = pushHistory(h, "b", { tag: "structural", now: 1000 });
    h = pushHistory(h, "bc", { tag: "typing", now: 1001 });
    expect(h.entries).toEqual(["a", "b", "bc"]);
  });

  it("is a no-op when pushing content identical to the current entry", () => {
    const h = createHistory("a");
    const h2 = pushHistory(h, "a", { tag: "typing", now: 1000 });
    expect(h2).toBe(h);
  });

  it("drops the redo-able future when a new push happens after undo", () => {
    let h = createHistory("a");
    h = pushHistory(h, "b", { tag: "structural", now: 1000 });
    h = pushHistory(h, "c", { tag: "structural", now: 2000 });
    h = undo(h); // back to "b", "c" is redo-able
    expect(canRedo(h)).toBe(true);
    h = pushHistory(h, "d", { tag: "structural", now: 3000 });
    expect(h.entries).toEqual(["a", "b", "d"]);
    expect(canRedo(h)).toBe(false);
  });

  it("undo then redo restores the exact same content", () => {
    let h = createHistory("a");
    h = pushHistory(h, "b", { tag: "structural", now: 1000 });
    h = undo(h);
    expect(currentSrc(h)).toBe("a");
    h = redo(h);
    expect(currentSrc(h)).toBe("b");
  });

  it("caps the stack size, evicting the oldest entries first", () => {
    let h = createHistory("0");
    for (let i = 1; i <= 150; i++) {
      h = pushHistory(h, String(i), { tag: "structural", now: 1000 * i });
    }
    expect(h.entries.length).toBe(100);
    expect(h.entries[0]).toBe("51");
    expect(h.entries[h.entries.length - 1]).toBe("150");
    expect(currentSrc(h)).toBe("150");
  });
});
