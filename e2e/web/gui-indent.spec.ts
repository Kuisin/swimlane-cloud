import { expect, test, type Page } from "@playwright/test";

/**
 * The GUI flow list indents every row by how deeply it nests. That indent is
 * the only thing on screen that shows structure — the list draws no connecting
 * lines — so when it is wrong the document reads as flat.
 *
 * It was wrong: the indent counted branches only, and fell back to whatever
 * `depth` the parser had stamped on a row outside them. A `section`/`branch`
 * group therefore contributed nothing, so a group inside a case rendered flush
 * with its own contents, and an `if` inside a `section` dropped back to the
 * top-level column. Both are visible to the naked eye, so both are checked
 * against the `padding-left` actually computed for each row.
 */

const NESTED = `@kai-swimlane

/role/

<a>
label: A;

/line/

[a: top]
if (q1?) is (yes) than
  [a: in-case]
  branch (Side)
    [a: in-branch]
    section (Deep)
      [a: in-section-in-branch]
    end-section
  end-branch
  []
  loop
else-if () than
  section (Other)
    [a: in-section]
  end-section
  [goto: fin]
end-if
section (Top)
  [a: in-top-section]
  if (q2?) is (y) than
    [a: nested]
  end-if
end-section
[a: fin]
  id: fin;

@end
`;

/**
 * How the list above must read, as `[summary, indent level]`. Written out in
 * full because the bug was precisely that some rows landed on the wrong level
 * while their neighbours were fine — a spot check is what let it through.
 */
const EXPECTED: [string, number][] = [
  ["top", 0],
  ["q1?", 0],
  ["yes", 1],
  ["in-case", 2],
  ["sub-branch", 2],
  ["in-branch", 3],
  ["section box", 3],
  ["in-section-in-branch", 4],
  ["end of section", 3],
  ["end of sub-branch", 2],
  ["(blank line)", 2],
  ["loop within branch", 2],
  ["otherwise", 1],
  ["section box", 2],
  ["in-section", 3],
  ["end of section", 2],
  ["goto → fin", 2],
  ["end of branch", 0],
  ["section box", 0],
  ["in-top-section", 1],
  ["q2?", 1],
  ["y", 2],
  ["nested", 3],
  ["end of branch", 1],
  ["end of section", 0],
  ["fin", 0],
];

/** Load `dsl` into the demo editor's open file and come back to GUI mode. */
async function typeDocument(page: Page, dsl: string) {
  await page.goto("/?demo=reset");
  await expect(page.locator(".sw-tree-file").first()).toBeVisible();
  const gotIt = page.getByRole("button", { name: /got it|了解/i });
  if (await gotIt.isVisible().catch(() => false)) await gotIt.click();
  await page.locator(".sw-tree-file", { hasText: "hiring.txt" }).first().click();

  await page.getByRole("tab", { name: /text/i }).click();
  const textarea = page.locator("textarea.sw-code-input");
  await expect(textarea).toBeVisible();
  await textarea.fill(dsl);
  await page.getByRole("tab", { name: /gui/i }).click();
  await expect(page.locator(".sw-flow-row").first()).toBeVisible();
  // A parse error would lock the rows and change what the list shows.
  await expect(page.locator(".sw-error-list")).toHaveCount(0);
}

test.describe("the GUI flow list's nesting indent", () => {
  test("indents every row by its real nesting, groups included", async ({ page }) => {
    await typeDocument(page, NESTED);

    const rows = await page.locator(".sw-flow-row").evaluateAll((els) =>
      els.map((el) => ({
        text: (el.querySelector(".sw-flow-summary")?.textContent ?? "").trim(),
        level: Number(el.getAttribute("data-indent")),
        padding: Number.parseFloat(getComputedStyle(el).paddingLeft),
      })),
    );

    expect(rows.map((r) => [r.text, r.level])).toEqual(EXPECTED);

    // …and the level is what is actually drawn, not just an attribute: every
    // row's left inset is one fixed step per level off a common base.
    const base = rows[0].padding;
    const unit = rows.find((r) => r.level === 1)!.padding - base;
    expect(unit).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.padding, `${row.text} @ level ${row.level}`).toBe(base + row.level * unit);
    }
  });
});
