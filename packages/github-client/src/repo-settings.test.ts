import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  isCurrentRepoSettings,
  normalizeRepoSettingsText,
  parseRepoSettings,
  repoSettingsJson,
} from "./repo-settings.ts";
import { INTEGRATION_BRANCH, PROD_BRANCH } from "./branch-model.ts";

describe("repoSettingsJson / parseRepoSettings", () => {
  it("round-trips the defaults", () => {
    expect(parseRepoSettings(repoSettingsJson())).toEqual(DEFAULT_SETTINGS);
    expect(isCurrentRepoSettings(repoSettingsJson())).toBe(true);
  });

  it("allows preview and release-* to reach the published branch", () => {
    // `release-*` is what a published version is cut onto; dropping it from
    // the defaults would stop every publish.
    expect(DEFAULT_SETTINGS.rules.allowedPublishedSources).toEqual([
      INTEGRATION_BRANCH,
      "release-*",
    ]);
    expect(DEFAULT_SETTINGS.branches.published).toBe(PROD_BRANCH);
  });

  it("keeps an edited allowlist", () => {
    const text = JSON.stringify({ rules: { allowedPublishedSources: ["preview"] } });
    expect(parseRepoSettings(text).rules.allowedPublishedSources).toEqual(["preview"]);
  });
});

/**
 * A settings file is editable by anyone with repository access, so the parser
 * has to fail *closed*: nothing malformed may end up weakening a rule.
 */
describe("a malformed settings file never weakens the rules", () => {
  it("falls back to the defaults rather than to nothing", () => {
    for (const text of ["", "not json", "null", "[]", '"a string"', "{}"]) {
      expect(parseRepoSettings(text), text).toEqual(DEFAULT_SETTINGS);
    }
    expect(parseRepoSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it("ignores a wrongly typed rule instead of treating it as off", () => {
    const text = JSON.stringify({
      rules: {
        publishedRequiresPullRequest: "no",
        forbidDirectPush: 0,
        allowedPublishedSources: "preview",
      },
    });
    const parsed = parseRepoSettings(text);
    expect(parsed.rules.publishedRequiresPullRequest).toBe(true);
    expect(parsed.rules.forbidDirectPush).toBe(true);
    expect(parsed.rules.allowedPublishedSources).toEqual(
      DEFAULT_SETTINGS.rules.allowedPublishedSources,
    );
  });

  it("rejects an allowlist containing a non-string", () => {
    const text = JSON.stringify({ rules: { allowedPublishedSources: ["preview", 7] } });
    expect(parseRepoSettings(text).rules.allowedPublishedSources).toEqual(
      DEFAULT_SETTINGS.rules.allowedPublishedSources,
    );
  });
});

describe("diagram settings and template modes", () => {
  it("default to drawing everything and forcing nothing", () => {
    expect(DEFAULT_SETTINGS.diagram).toEqual({
      showGatewayIcons: true,
      blockMargin: 0,
      blockText: "truncate",
    });
    expect(DEFAULT_SETTINGS.templates).toEqual({});
  });

  it("keeps what the owner chose", () => {
    const text = JSON.stringify({
      diagram: { showGatewayIcons: false, blockMargin: 24, blockText: "wrap" },
      templates: { role: "template-only", block: "base", prop: "none" },
    });
    const parsed = parseRepoSettings(text);
    expect(parsed.diagram).toEqual({ showGatewayIcons: false, blockMargin: 24, blockText: "wrap" });
    expect(parsed.templates).toEqual({ role: "template-only", block: "base", prop: "none" });
  });

  it("drops a value the renderer could not honour rather than guessing", () => {
    const text = JSON.stringify({
      diagram: { showGatewayIcons: "no", blockMargin: 500, blockText: "sideways" },
      templates: { role: "forced", page: 1, title: "none" },
    });
    const parsed = parseRepoSettings(text);
    expect(parsed.diagram).toEqual(DEFAULT_SETTINGS.diagram);
    expect(parsed.templates).toEqual({});
  });
});

/**
 * The metadata schema is a section of this file like any other, so it has to
 * behave like one: absent means "no declared fields", which is exactly how
 * every repository behaves today.
 */
describe("the metadata schema", () => {
  it("defaults to declaring nothing", () => {
    expect(DEFAULT_SETTINGS.metadata).toEqual({ fields: [] });
    expect(parseRepoSettings("{}").metadata).toEqual({ fields: [] });
  });

  it("keeps a declared schema, dropping only what it cannot use", () => {
    const text = JSON.stringify({
      metadata: {
        fields: [
          { key: "owner", type: "string", label: "Owner", required: true },
          { key: "status", type: "enum", values: ["draft", "approved"], default: "draft" },
          { key: "broken", type: "colour" },
        ],
      },
    });
    expect(parseRepoSettings(text).metadata.fields).toEqual([
      { key: "owner", type: "string", label: "Owner", required: true },
      { key: "status", type: "enum", values: ["draft", "approved"], default: "draft" },
    ]);
  });

  it("survives a malformed block instead of taking the whole file down", () => {
    for (const metadata of ["nonsense", 7, { fields: "all of them" }, { fields: [null] }]) {
      expect(parseRepoSettings(JSON.stringify({ metadata })).metadata).toEqual({ fields: [] });
    }
  });

  it("round-trips through the canonical text", () => {
    const declared = repoSettingsJson({
      ...DEFAULT_SETTINGS,
      metadata: { fields: [{ key: "dueDate", type: "date", help: "ISO, YYYY-MM-DD" }] },
    });
    expect(isCurrentRepoSettings(declared)).toBe(true);
    expect(parseRepoSettings(declared).metadata.fields).toEqual([
      { key: "dueDate", type: "date", help: "ISO, YYYY-MM-DD" },
    ]);
  });
});

/**
 * Connecting a repository rewrites this file when it is not "current". That
 * must mean "missing a key a newer app added", never "differs from the
 * defaults" — or every reconnect would reset what the owner configured.
 */
describe("normalizeRepoSettingsText", () => {
  it("fills in keys an older file lacks and keeps its values", () => {
    const older = JSON.stringify({ rules: { allowedPublishedSources: ["preview"] } }, null, 2);
    expect(isCurrentRepoSettings(older)).toBe(false);
    const upgraded = parseRepoSettings(normalizeRepoSettingsText(older));
    expect(upgraded.rules.allowedPublishedSources).toEqual(["preview"]);
    expect(upgraded.diagram).toEqual(DEFAULT_SETTINGS.diagram);
  });

  it("leaves a customised, complete file alone", () => {
    const custom = repoSettingsJson({
      ...DEFAULT_SETTINGS,
      diagram: { ...DEFAULT_SETTINGS.diagram, blockText: "wrap" },
    });
    expect(isCurrentRepoSettings(custom)).toBe(true);
    expect(normalizeRepoSettingsText(custom)).toBe(custom);
  });
});
