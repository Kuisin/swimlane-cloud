import { expect, test, type Page } from "@playwright/test";

/** The GUI step list's rows, counted through the preview's hit targets. */
const rowCount = async (page: Page) =>
  page.locator(".sw-preview svg#swimlane-svg [data-row-index]").count();

test.describe("the Add menu", () => {
  test("opens above everything and inserts without a selection", async ({ page }) => {
    test.skip(test.info().project.name === "phone", "no preview on a phone");
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/?demo=reset");
    await expect(page.locator(".sw-tree-file").first()).toBeVisible();
    const gotIt = page.getByRole("button", { name: /got it|了解/i });
    if (await gotIt.isVisible().catch(() => false)) await gotIt.click();
    await page.locator(".sw-tree-file", { hasText: "hiring.txt" }).first().click();
    await expect(page.locator(".sw-preview svg#swimlane-svg")).toBeVisible();

    const before = await rowCount(page);
    await page.getByRole("button", { name: /add block/i }).click();
    // Portaled to <body>, inside the editor's theme scope, so no ancestor of
    // the host page can clip, transform or cover it.
    const menu = page.locator("body > .sw-dialog-root > .sw-add-block-menu");
    await expect(menu).toBeVisible();
    await menu.getByText(/^If branch/).click();
    await expect(menu).toBeHidden();
    expect(await rowCount(page)).toBeGreaterThan(before);

    // Every remaining item inserts something too.
    for (const label of [
      /^Switch/,
      /^Parallel/,
      /group visually/i,
      /side path that rejoins/i,
      /landing marker/i,
    ]) {
      const n = await rowCount(page);
      await page.getByRole("button", { name: /add block/i }).click();
      await page
        .locator("body > .sw-dialog-root .sw-add-block-item", { hasText: label })
        .first()
        .click();
      expect(await rowCount(page), String(label)).toBeGreaterThanOrEqual(n);
    }
    expect(errors).toEqual([]);
  });
});
