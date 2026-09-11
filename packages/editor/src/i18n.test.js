import { describe, expect, it } from "vitest";
import { EN, JA } from "./i18n.jsx";

describe("i18n dictionaries", () => {
  it("EN and JA expose exactly the same keys", () => {
    const enKeys = Object.keys(EN).sort();
    const jaKeys = Object.keys(JA).sort();
    expect(jaKeys).toEqual(enKeys);
  });

  it("has no empty string values in either dictionary", () => {
    for (const [dictName, dict] of [
      ["EN", EN],
      ["JA", JA],
    ]) {
      for (const [key, value] of Object.entries(dict)) {
        expect(value, `${dictName}["${key}"] should not be empty`).not.toBe("");
      }
    }
  });
});
