import { describe, expect, it } from "vitest";
import { draftVersion, fileVersionIn, gitVersion, isCommitSha } from "./file-version";

const sha = "0123456789abcdef0123456789abcdef01234567";
const tree = {
  sha,
  files: [
    { id: "diagrams/a.txt", name: "a.txt", fid: "f-a" },
    { id: "diagrams/b.txt", name: "b.txt", fid: "f-b" },
  ],
  drafts: { "diagrams/b.txt": "2026-09-07T01:02:03.000Z" },
};

describe("fileVersionIn", () => {
  it("names a committed file by the listing's commit", () => {
    expect(fileVersionIn(tree, "diagrams/a.txt")).toBe(gitVersion(sha));
  });

  it("names a drafted file by the draft's updated_at, not the commit", () => {
    expect(fileVersionIn(tree, "diagrams/b.txt")).toBe(draftVersion("2026-09-07T01:02:03.000Z"));
  });

  it("returns null for a path the listing does not have, so no cache can answer for it", () => {
    expect(fileVersionIn(tree, "diagrams/gone.txt")).toBeNull();
  });

  it("tolerates a listing without a drafts map (an older server)", () => {
    const legacy = { sha, files: tree.files } as unknown as typeof tree;
    expect(fileVersionIn(legacy, "diagrams/b.txt")).toBe(gitVersion(sha));
  });
});

describe("isCommitSha", () => {
  it("accepts a full 40-char sha and nothing shorter or non-hex", () => {
    expect(isCommitSha(sha)).toBe(true);
    expect(isCommitSha(sha.slice(0, 7))).toBe(false);
    expect(isCommitSha("preview")).toBe(false);
  });
});
