import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  isCurrentRepoSettings,
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
