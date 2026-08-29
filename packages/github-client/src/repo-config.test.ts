import { describe, expect, it } from "vitest";
import { DEFAULT_REPO_CONFIG, isWithinRoot, parseRepoConfig } from "./repo-config.ts";

describe("parseRepoConfig", () => {
  it("returns defaults when the repo has no .swimlane.json", () => {
    expect(parseRepoConfig(null)).toEqual(DEFAULT_REPO_CONFIG);
  });

  it("reads the fields it knows about", () => {
    expect(
      parseRepoConfig(
        '{"diagramsRoot":"docs/flows","title":"Ops","themeKey":"dark","integrationBranch":"develop"}',
      ),
    ).toEqual({
      diagramsRoot: "docs/flows",
      title: "Ops",
      themeKey: "dark",
      integrationBranch: "develop",
    });
  });

  it("normalises a root written with ./ or a trailing slash", () => {
    expect(parseRepoConfig('{"diagramsRoot":"./diagrams/"}').diagramsRoot).toBe("diagrams");
    expect(parseRepoConfig('{"diagramsRoot":"/diagrams"}').diagramsRoot).toBe("diagrams");
  });

  it("degrades to defaults on malformed JSON rather than failing the page", () => {
    // A viewer should still see the diagram when someone fat-fingers the config.
    expect(parseRepoConfig("{not json")).toEqual(DEFAULT_REPO_CONFIG);
    expect(parseRepoConfig("[]")).toEqual(DEFAULT_REPO_CONFIG);
    expect(parseRepoConfig("null")).toEqual(DEFAULT_REPO_CONFIG);
  });

  it("ignores fields of the wrong type", () => {
    expect(parseRepoConfig('{"diagramsRoot":42,"title":{},"themeKey":[]}')).toEqual(
      DEFAULT_REPO_CONFIG,
    );
  });

  it("treats blank strings as absent", () => {
    const c = parseRepoConfig('{"title":"   ","themeKey":"","integrationBranch":" "}');
    expect(c.title).toBeNull();
    expect(c.themeKey).toBe("basic");
    expect(c.integrationBranch).toBe("test");
  });
});

describe("isWithinRoot", () => {
  it("accepts everything when no root is configured", () => {
    expect(isWithinRoot(DEFAULT_REPO_CONFIG, "anything/at/all.txt")).toBe(true);
  });

  it("scopes to the configured root", () => {
    const c = parseRepoConfig('{"diagramsRoot":"diagrams"}');
    expect(isWithinRoot(c, "diagrams/a.txt")).toBe(true);
    expect(isWithinRoot(c, "diagrams")).toBe(true);
    expect(isWithinRoot(c, "other/a.txt")).toBe(false);
  });

  it("does not let a sibling prefix sneak in", () => {
    const c = parseRepoConfig('{"diagramsRoot":"diagrams"}');
    expect(isWithinRoot(c, "diagrams-old/a.txt")).toBe(false);
  });
});
