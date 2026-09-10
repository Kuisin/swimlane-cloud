/**
 * The two dictionaries must carry the same keys. `t()` falls back to the key
 * itself, so a missing translation is not an error anywhere — it just quietly
 * renders `md.document` to a Japanese reader.
 */
import { describe, expect, it } from "vitest";
import { EN, JA } from "../i18n";

describe("i18n dictionaries", () => {
  it("carry exactly the same keys", () => {
    const en = Object.keys(EN).sort();
    const ja = Object.keys(JA).sort();
    expect(ja.filter((k) => !(k in EN))).toEqual([]);
    expect(en.filter((k) => !(k in JA))).toEqual([]);
    expect(ja).toEqual(en);
  });

  it("leave no value empty", () => {
    for (const [dict, name] of [
      [EN, "EN"],
      [JA, "JA"],
    ] as const) {
      for (const [key, value] of Object.entries(dict)) {
        expect(value.trim(), `${name}.${key} is empty`).not.toBe("");
      }
    }
  });
});
