import { describe, expect, it } from "vitest";
import { credentialEnv } from "./push.ts";

describe("credentialEnv", () => {
  const env = credentialEnv("gho_secret_token");

  it("clears BOTH the generic and the URL-scoped helper before installing ours", () => {
    // Measured on a real machine: `gh auth setup-git` installs
    // `credential.https://github.com.helper`, which survives a bare
    // `credential.helper=` reset and wins. Clearing only the generic key means
    // our helper never runs.
    const pairs: Array<[string, string]> = [];
    const count = Number(env.GIT_CONFIG_COUNT);
    for (let i = 0; i < count; i++)
      pairs.push([env[`GIT_CONFIG_KEY_${i}`]!, env[`GIT_CONFIG_VALUE_${i}`]!]);

    expect(pairs[0]).toEqual(["credential.helper", ""]);
    expect(pairs[1]).toEqual(["credential.https://github.com.helper", ""]);
    expect(pairs[2]![0]).toBe("credential.helper");
    expect(pairs[3]![0]).toBe("credential.https://github.com.helper");
    expect(pairs[2]![1]).toContain("x-access-token");
    expect(pairs[3]![1]).toContain("x-access-token");
  });

  it("passes the token by environment, never inside the helper body", () => {
    // The helper body ends up in the process environment, which is visible to
    // the user but not to other users' `ps`. The token must be a separate
    // variable the helper dereferences, not a literal in any config value.
    for (const [k, v] of Object.entries(env)) {
      if (k === "SWIMLANE_GH_TOKEN") continue;
      expect(v).not.toContain("gho_secret_token");
    }
    expect(env.SWIMLANE_GH_TOKEN).toBe("gho_secret_token");
  });

  it("dereferences the token variable rather than interpolating it", () => {
    expect(env.GIT_CONFIG_VALUE_2).toContain("$SWIMLANE_GH_TOKEN");
  });

  it("disables terminal prompts so a credential failure cannot hang the host", () => {
    expect(env.GIT_TERMINAL_PROMPT).toBe("0");
  });

  it("declares exactly as many entries as it sets", () => {
    const count = Number(env.GIT_CONFIG_COUNT);
    expect(env[`GIT_CONFIG_KEY_${count}`]).toBeUndefined();
    expect(env[`GIT_CONFIG_KEY_${count - 1}`]).toBeDefined();
  });
});
