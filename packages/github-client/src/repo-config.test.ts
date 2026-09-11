import { describe, expect, it } from "vitest";
import {
  DEFAULT_REPO_CONFIG,
  isWithinRoot,
  parseRepoConfig,
  serializeRepoConfig,
  validateRepoConfig,
} from "./repo-config.ts";

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
      layout: {},
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

describe("parseRepoConfig layout", () => {
  it("keeps usable numbers", () => {
    expect(parseRepoConfig('{"layout":{"nodeW":220,"xPad":0}}').layout).toEqual({
      nodeW: 220,
      xPad: 0,
    });
  });

  it("drops entries that are not usable numbers, rather than failing the page", () => {
    const c = parseRepoConfig('{"layout":{"nodeW":"220","rowH":null,"xPad":-4,"headerH":80}}');
    expect(c.layout).toEqual({ headerH: 80 });
  });

  it("treats a non-object layout as absent", () => {
    expect(parseRepoConfig('{"layout":[1,2]}').layout).toEqual({});
    expect(parseRepoConfig('{"layout":"wide"}').layout).toEqual({});
  });

  it("never shares the default layout object between parses", () => {
    // A caller mutating one config must not leak into DEFAULT_REPO_CONFIG.
    const a = parseRepoConfig(null);
    a.layout.nodeW = 999;
    expect(parseRepoConfig(null).layout).toEqual({});
    expect(DEFAULT_REPO_CONFIG.layout).toEqual({});
  });
});

describe("validateRepoConfig", () => {
  it("accepts a full config and reports no errors", () => {
    const { config, errors } = validateRepoConfig({
      diagramsRoot: "docs/flows",
      title: "Ops",
      themeKey: "washi",
      integrationBranch: "develop",
      layout: { nodeW: 220 },
    });
    expect(errors).toEqual([]);
    expect(config).toEqual({
      diagramsRoot: "docs/flows",
      title: "Ops",
      themeKey: "washi",
      integrationBranch: "develop",
      layout: { nodeW: 220 },
    });
  });

  it("defaults every omitted field", () => {
    const { config, errors } = validateRepoConfig({});
    expect(errors).toEqual([]);
    expect(config).toEqual(DEFAULT_REPO_CONFIG);
  });

  it("normalises the root the same way parseRepoConfig does", () => {
    expect(validateRepoConfig({ diagramsRoot: " ./diagrams/ " }).config.diagramsRoot).toBe(
      "diagrams",
    );
  });

  it("accepts an empty root as the whole repository", () => {
    const { config, errors } = validateRepoConfig({ diagramsRoot: "" });
    expect(errors).toEqual([]);
    expect(config.diagramsRoot).toBe("");
  });

  const fieldsOf = (input: unknown) => validateRepoConfig(input).errors.map((e) => e.field);

  it("rejects a root that escapes the repository", () => {
    expect(fieldsOf({ diagramsRoot: "../etc" })).toEqual(["diagramsRoot"]);
    expect(fieldsOf({ diagramsRoot: "a/../b" })).toEqual(["diagramsRoot"]);
    expect(fieldsOf({ diagramsRoot: "a\\b" })).toEqual(["diagramsRoot"]);
    expect(fieldsOf({ diagramsRoot: 42 })).toEqual(["diagramsRoot"]);
  });

  it("rejects an over-long title", () => {
    expect(fieldsOf({ title: "x".repeat(201) })).toEqual(["title"]);
    expect(fieldsOf({ title: "x".repeat(200) })).toEqual([]);
  });

  it("rejects a theme key that is not an identifier", () => {
    expect(fieldsOf({ themeKey: "a theme" })).toEqual(["themeKey"]);
    expect(fieldsOf({ themeKey: "-dark" })).toEqual(["themeKey"]);
    expect(fieldsOf({ themeKey: "basic" })).toEqual([]);
  });

  it("rejects branch names git itself would refuse", () => {
    for (const bad of ["-lead", "a..b", "x.lock", "has space", "ends/", ".hidden", "a~b", "a^b"]) {
      expect(fieldsOf({ integrationBranch: bad }), bad).toEqual(["integrationBranch"]);
    }
    for (const ok of ["test", "develop", "release/2026", "feature-1"]) {
      expect(fieldsOf({ integrationBranch: ok }), ok).toEqual([]);
    }
  });

  it("names the field for a bad layout value instead of silently dropping it", () => {
    // parseRepoConfig drops these; an editor must be told, or the user would
    // believe a value was saved that never was.
    expect(fieldsOf({ layout: { nodeW: "220" } })).toEqual(["layout"]);
    expect(fieldsOf({ layout: { nodeW: -1 } })).toEqual(["layout"]);
    expect(fieldsOf({ layout: { nodeW: 10001 } })).toEqual(["layout"]);
    expect(fieldsOf({ layout: [] })).toEqual(["layout"]);
  });

  it("blank strings fall back to the default, as in a cleared input", () => {
    const { config, errors } = validateRepoConfig({
      title: "   ",
      themeKey: "",
      integrationBranch: " ",
    });
    expect(errors).toEqual([]);
    expect(config.title).toBeNull();
    expect(config.themeKey).toBe("basic");
    expect(config.integrationBranch).toBe("test");
  });

  it("collects every problem, not just the first", () => {
    expect(fieldsOf({ diagramsRoot: "../x", themeKey: "no good" })).toEqual([
      "diagramsRoot",
      "themeKey",
    ]);
  });
});

describe("serializeRepoConfig", () => {
  it("writes 2-space JSON with a trailing newline", () => {
    expect(serializeRepoConfig(DEFAULT_REPO_CONFIG)).toBe(
      `{\n  "diagramsRoot": "",\n  "title": null,\n  "themeKey": "basic",\n  "integrationBranch": "test"\n}\n`,
    );
  });

  it("omits an empty layout, so a repo that never touches geometry keeps its file", () => {
    expect(serializeRepoConfig(DEFAULT_REPO_CONFIG)).not.toContain("layout");
  });

  it("includes the layout once something is overridden", () => {
    const out = serializeRepoConfig({ ...DEFAULT_REPO_CONFIG, layout: { nodeW: 220 } });
    expect(out).toContain('"layout": {\n    "nodeW": 220\n  }');
  });

  it("carries over keys it does not know about", () => {
    const existing = '{"diagramsRoot":"old","futureSetting":{"a":1}}';
    const out = serializeRepoConfig({ ...DEFAULT_REPO_CONFIG, diagramsRoot: "new" }, existing);
    expect(JSON.parse(out)).toEqual({
      diagramsRoot: "new",
      title: null,
      themeKey: "basic",
      integrationBranch: "test",
      futureSetting: { a: 1 },
    });
  });

  it("ignores a malformed previous file rather than refusing to write", () => {
    expect(() => serializeRepoConfig(DEFAULT_REPO_CONFIG, "{not json")).not.toThrow();
    expect(serializeRepoConfig(DEFAULT_REPO_CONFIG, "{not json")).toBe(
      serializeRepoConfig(DEFAULT_REPO_CONFIG),
    );
  });

  it("round-trips through parseRepoConfig", () => {
    const config = {
      diagramsRoot: "docs",
      title: "Ops",
      themeKey: "ink",
      integrationBranch: "develop",
      layout: { nodeW: 220, xPad: 10 },
    };
    expect(parseRepoConfig(serializeRepoConfig(config))).toEqual(config);
  });
});
