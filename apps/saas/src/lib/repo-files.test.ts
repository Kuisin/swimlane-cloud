import { describe, expect, it } from "vitest";
import { REPO_CONFIG_PATH } from "@swimlane-cloud/github-client";
import { isDiagramPath, isDraftablePath, isSettingsPath } from "./repo-files";
import { repoConfigJson } from "./seed";

describe("isSettingsPath", () => {
  it("matches the repo-wide settings file and nothing else", () => {
    expect(isSettingsPath(REPO_CONFIG_PATH)).toBe(true);
    expect(isSettingsPath("diagrams/.swimlane.json")).toBe(false);
    expect(isSettingsPath(".swimlane.jsonc")).toBe(false);
    expect(isSettingsPath("swimlane.json")).toBe(false);
  });
});

describe("isDraftablePath", () => {
  it("does not claim the settings file", () => {
    // The gate that keeps files/route.ts (delete / rmdir / rename) away from
    // `.swimlane.json`: every reader resolves it by that exact path, so it must
    // not be movable or removable from the file tree.
    expect(isDraftablePath(REPO_CONFIG_PATH)).toBe(false);
  });

  it("still claims diagrams and folder markers", () => {
    expect(isDraftablePath("diagrams/a.txt")).toBe(true);
    expect(isDraftablePath("diagrams/.gitkeep")).toBe(true);
    expect(isDraftablePath("templates/page/standard.txt")).toBe(false);
  });
});

describe("isDiagramPath", () => {
  it("keeps the settings file out of the diagram tree", () => {
    // Which is why a settings draft never leaks into a snapshot or a version.
    const config = {
      diagramsRoot: "",
      title: null,
      themeKey: "basic",
      integrationBranch: "test",
      layout: {},
    };
    expect(isDiagramPath(REPO_CONFIG_PATH, config)).toBe(false);
    expect(isDiagramPath("a.txt", config)).toBe(true);
  });
});

describe("repoConfigJson", () => {
  it("is unchanged by the move to the shared serializer", () => {
    // Byte-for-byte what the seed wrote before, so an existing repository and a
    // newly created one stay identical.
    expect(repoConfigJson("Ops")).toBe(
      `{\n  "diagramsRoot": "diagrams",\n  "title": "Ops",\n  "themeKey": "basic",\n  "integrationBranch": "test"\n}\n`,
    );
  });
});
