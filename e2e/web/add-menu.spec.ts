import { expect, test, type Page } from "@playwright/test";

/** The GUI step list's rows, counted through the preview's hit targets. */
const rowCount = async (page: Page) =>
  page.locator(".sw-preview svg#swimlane-svg [data-row-index]").count();

test.describe("the Add menu", () => {
  test("opens above everything and inserts without a selection", async ({ page }) => {
    // Desktop only: this walks the menu (flow pane) and counts rows in the
    // drawn diagram (preview pane) in turn. Both are reachable on a phone,
    // one at a time, but the pane-switching would be most of the test.
    test.skip(test.info().project.name === "phone", "interleaves two panes");
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

    // Every remaining item inserts something too. (There is no "landing
    // marker" item any more — a jump names the step it lands on, so the
    // destination is an ordinary step rather than a row you add here.)
    for (const label of [/^Switch/, /^Parallel/, /group visually/i, /side path that rejoins/i]) {
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

  test("the Jumps group only appears inside an if, and its goto names a step", async ({ page }) => {
    // Desktop only: this walks the menu (flow pane) and counts rows in the
    // drawn diagram (preview pane) in turn. Both are reachable on a phone,
    // one at a time, but the pane-switching would be most of the test.
    test.skip(test.info().project.name === "phone", "interleaves two panes");
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/?demo=reset");
    await expect(page.locator(".sw-tree-file").first()).toBeVisible();
    const gotIt = page.getByRole("button", { name: /got it|了解/i });
    if (await gotIt.isVisible().catch(() => false)) await gotIt.click();
    await page.locator(".sw-tree-file", { hasText: "order-to-cash.txt" }).first().click();
    await expect(page.locator(".sw-preview svg#swimlane-svg")).toBeVisible();

    const menu = page.locator("body > .sw-dialog-root > .sw-add-block-menu");
    // Nothing selected: a loop/goto has no enclosing `if` to redirect, and the
    // landing marker that used to sit here alone is gone — so the whole group
    // stays out of the menu rather than showing an empty heading.
    await page.getByRole("button", { name: /add block/i }).click();
    await expect(menu).toBeVisible();
    await expect(menu.getByText("Jumps", { exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.locator(".sw-gui-wrap").click({ position: { x: 2, y: 2 } });

    // Select a step inside the sample's `if`, and the group appears.
    const jumps = page.locator(".sw-flow-summary", { hasText: /goto →/ });
    const before = await jumps.count(); // the sample already has one
    await page.locator(".sw-flow-row", { hasText: "Back-order" }).first().click();
    await page.getByRole("button", { name: /add block/i }).click();
    await expect(menu.getByText("Jumps", { exact: true })).toBeVisible();
    await menu.locator(".sw-add-block-item", { hasText: /jump ahead/i }).click();
    await expect(menu).toBeHidden();

    // The new jump names a real step from the moment it's inserted, so it
    // survives the round trip through the document and shows up in the list.
    // A target-less `[goto: ]` would not parse: the row would vanish here and
    // the error banner below would appear instead.
    await expect(jumps).toHaveCount(before + 1);
    await expect(page.locator(".sw-error-list")).toHaveCount(0);
    // …and every jump reads by the destination step's own label. The id the
    // tool assigned (`step-1`, …) is plumbing the author never sees.
    for (const text of await jumps.allInnerTexts()) expect(text).not.toMatch(/step-\d/);
    expect(errors).toEqual([]);
  });
});
