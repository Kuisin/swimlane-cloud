import { describe, expect, it, beforeEach } from "vitest";
import { FsHost } from "../src/fs-host.ts";
import { setFiles, Uri } from "./vscode-stub.ts";

/**
 * The edit scope is what stops an edit started for one folder from touching
 * another. It is enforced on every path-taking method, not only on listing,
 * because a write can arrive with an id the tree never produced.
 */

const ROOT = Uri.file("/ws") as never;
let host: FsHost;

beforeEach(() => {
  setFiles(["diagrams/ops/a.txt", "diagrams/ops/deep/c.txt", "diagrams/hr/b.txt"]);
  host = new FsHost(ROOT, "diagrams");
});

describe("listing", () => {
  it("shows every diagram when unscoped", async () => {
    expect((await host.list()).map((f) => f.id).sort()).toEqual([
      "diagrams/hr/b.txt",
      "diagrams/ops/a.txt",
      "diagrams/ops/deep/c.txt",
    ]);
  });

  it("shows only the scoped folder, including nested files", async () => {
    host.setScope("diagrams/ops");
    expect((await host.list()).map((f) => f.id).sort()).toEqual([
      "diagrams/ops/a.txt",
      "diagrams/ops/deep/c.txt",
    ]);
  });

  it("widens again when the scope is cleared", async () => {
    host.setScope("diagrams/ops");
    host.setScope(null);
    expect(await host.list()).toHaveLength(3);
  });
});

describe("writes outside the scope are refused", () => {
  beforeEach(() => host.setScope("diagrams/ops"));

  it("refuses a write to another folder", async () => {
    await expect(host.write("diagrams/hr/b.txt", "x")).rejects.toThrow(
      /outside this edit's folder/,
    );
  });

  it("refuses create, delete and rename too — not just write", async () => {
    await expect(host.create("diagrams/hr/new.txt", "x")).rejects.toThrow(/outside this edit/);
    await expect(host.delete("diagrams/hr/b.txt")).rejects.toThrow(/outside this edit/);
    await expect(host.rename("diagrams/ops/a.txt", "diagrams/hr/a.txt")).rejects.toThrow(
      /outside this edit/,
    );
  });

  it("refuses a read outside the scope", async () => {
    await expect(host.read("diagrams/hr/b.txt")).rejects.toThrow(/outside this edit/);
  });

  it("does not let a sibling prefix slip through", async () => {
    // "diagrams/ops-archive" must not pass a "diagrams/ops" scope.
    await expect(host.write("diagrams/ops-archive/x.txt", "x")).rejects.toThrow(
      /outside this edit/,
    );
  });

  it("allows writes inside the scope, including nested", async () => {
    await expect(host.write("diagrams/ops/a.txt", "x")).resolves.toBeUndefined();
    await expect(host.write("diagrams/ops/deep/c.txt", "x")).resolves.toBeUndefined();
  });

  it("still rejects traversal and absolute ids", async () => {
    await expect(host.write("/etc/passwd", "x")).rejects.toThrow(/Invalid diagram id/);
    await expect(host.write("diagrams/ops/../hr/b.txt", "x")).rejects.toThrow();
  });
});
