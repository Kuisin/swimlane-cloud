import { describe, it, expect, vi } from "vitest";
import {
  cacheKey,
  fetchImports,
  missingImports,
  resolversFrom,
  withEntries,
} from "./import-cache.js";

const SRC = [
  "@kai-swimlane 2",
  "@use templates/role/standard.txt;",
  "@use assets/logo.svg;",
  "/line/",
  "[a: x]",
  "@end",
].join("\n");

describe("import cache", () => {
  it("lists what it has no answer for, in source order", () => {
    const uses = missingImports(SRC, "diagrams/a.txt", new Map());
    expect(uses.map((u) => [u.path, u.kind])).toEqual([
      ["templates/role/standard.txt", "fragment"],
      ["assets/logo.svg", "asset"],
    ]);
  });

  it("asks once per path, even when the answer is nothing", async () => {
    const host = { readImport: vi.fn(async () => null), readAsset: vi.fn(async () => null) };
    let cache = new Map();
    const first = missingImports(SRC, "d/a.txt", cache);
    cache = withEntries(cache, "d/a.txt", await fetchImports(first, host));
    expect(missingImports(SRC, "d/a.txt", cache)).toEqual([]);
    expect(host.readImport).toHaveBeenCalledTimes(1);
    expect(host.readAsset).toHaveBeenCalledTimes(1);
  });

  it("keys by importing file, so one path in two folders is two entries", () => {
    expect(cacheKey("a/x.txt", "./s.txt")).not.toBe(cacheKey("b/x.txt", "./s.txt"));
  });

  it("hands the parser what it has and null for the rest", async () => {
    const host = {
      readImport: async () => "/role/\n<a>\n  label: A;\n",
      readAsset: async () => null,
    };
    const uses = missingImports(SRC, "d/a.txt", new Map());
    const cache = withEntries(new Map(), "d/a.txt", await fetchImports(uses, host));
    const r = resolversFrom("d/a.txt", cache);
    expect(r.filename).toBe("d/a.txt");
    expect(r.resolveImport("templates/role/standard.txt")).toContain("label: A;");
    expect(r.resolveAsset("assets/logo.svg")).toBeNull();
    expect(r.resolveImport("never/fetched.txt")).toBeNull();
  });

  it("survives a host that throws, and one with no readers at all", async () => {
    const throwing = {
      readImport: async () => {
        throw new Error("offline");
      },
    };
    const entries = await fetchImports(missingImports(SRC, "a.txt", new Map()), throwing);
    expect(entries).toHaveLength(2);
    const cache = withEntries(new Map(), "a.txt", entries);
    expect(resolversFrom("a.txt", cache).resolveImport("templates/role/standard.txt")).toBeNull();
    await expect(fetchImports(missingImports(SRC, "a.txt", new Map()), {})).resolves.toHaveLength(
      2,
    );
  });
});
