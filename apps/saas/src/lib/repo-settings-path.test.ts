import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  parseRepoSettings,
  REPO_SETTINGS_PATH,
} from "@swimlane-cloud/github-client";
import { LAYOUT_SETTINGS } from "@swimlane-cloud/diagram-converter/diagram-layout";
import { isDraftablePath, isSettingsPath } from "./repo-files";

describe("isSettingsPath", () => {
  it("matches the settings file and nothing else", () => {
    expect(isSettingsPath(REPO_SETTINGS_PATH)).toBe(true);
    expect(isSettingsPath("diagrams/swimlane-settings.json")).toBe(false);
    expect(isSettingsPath("swimlane-settings.jsonc")).toBe(false);
  });

  it("stays out of isDraftablePath", () => {
    // That predicate also gates files/route.ts (delete / rmdir / rename), and
    // every reader resolves the settings by this exact path — so the file tree
    // must not be able to move or remove it.
    expect(isDraftablePath(REPO_SETTINGS_PATH)).toBe(false);
  });
});

describe("layout settings, across the package boundary", () => {
  it("only offers keys the settings file will actually keep", () => {
    // `@swimlane-cloud/github-client` validates the shape and the engine owns
    // the key list; this is the seam where the two meet, so it is worth
    // pinning that a value the form can produce survives a round trip.
    const layout = Object.fromEntries(LAYOUT_SETTINGS.map((s) => [s.key, s.min + 1]));
    const text = JSON.stringify({ diagram: { ...DEFAULT_SETTINGS.diagram, layout } });
    expect(parseRepoSettings(text).diagram.layout).toEqual(layout);
  });

  it("offers a sane, non-empty set of fields", () => {
    expect(LAYOUT_SETTINGS.length).toBeGreaterThan(0);
    for (const s of LAYOUT_SETTINGS) {
      expect(s.min, s.key).toBeLessThan(s.max);
      expect(["margins", "grid"]).toContain(s.group);
    }
  });
});
