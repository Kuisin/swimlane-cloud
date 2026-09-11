import { expect, test } from "@playwright/test";
import { openDemo, showTree } from "./helpers";

/**
 * The editor on a screen too narrow for its columns.
 *
 * Before this layout existed the three GUI panes were laid out side by side
 * regardless of width: on a 412px phone the inspector started at x=512 and the
 * preview was one pixel wide at x=878. The diagram — the thing the product is
 * for — could not be reached at all, which is why the phone tests here used to
 * skip anything that needed it.
 */
test.describe("the narrow layout", () => {
  test.skip(({ isMobile }) => !isMobile, "describes the phone layout");

  test("puts every pane inside the viewport, with nothing overflowing", async ({ page }) => {
    await openDemo(page);
    await page.locator(".sw-tree-file", { hasText: "hiring.txt" }).first().click();

    for (const tab of [/^(Flow|フロー)$/, /^(Edit|編集)$/, /^(Diagram|図)$/]) {
      await page.locator(".sw-pane-switcher [role=tab]").filter({ hasText: tab }).click();
      const { overflow, panes } = await page.evaluate(() => {
        const doc = document.documentElement;
        const sel = ".sw-gui-list-pane, .sw-gui-inspector-pane, .sw-gui-preview-pane";
        return {
          overflow: doc.scrollWidth - doc.clientWidth,
          panes: [...document.querySelectorAll(sel)].map((el) => {
            const r = el.getBoundingClientRect();
            return { right: Math.round(r.right), width: Math.round(r.width) };
          }),
        };
      });
      // No horizontal scrolling of the page itself…
      expect(overflow, String(tab)).toBeLessThanOrEqual(0);
      // …and exactly one pane, wide enough to use, ending inside the screen.
      expect(panes.length, String(tab)).toBe(1);
      expect(panes[0].width).toBeGreaterThan(280);
      expect(panes[0].right).toBeLessThanOrEqual(page.viewportSize()!.width);
    }
  });

  test("reaches the drawn diagram", async ({ page }) => {
    await openDemo(page);
    await page.locator(".sw-tree-file", { hasText: "order-to-cash.txt" }).first().click();
    await page.locator(".sw-pane-switcher [role=tab]").filter({ hasText: /^(Diagram|図)$/ }).click();
    await expect(page.locator(".sw-preview svg#swimlane-svg")).toBeVisible();
  });

  test("keeps text mode's preview reachable too", async ({ page }) => {
    await openDemo(page);
    await page.locator(".sw-tree-file", { hasText: "hiring.txt" }).first().click();
    await page.getByRole("tab", { name: /text/i }).click();
    // Switching mode changes which panes exist, so the switcher has to follow.
    await expect(page.locator(".sw-pane-switcher [role=tab]")).toHaveText([
      /Text|テキスト/,
      /Diagram|図/,
    ]);
    await expect(page.locator("textarea.sw-code-input")).toBeVisible();
    await page.locator(".sw-pane-switcher [role=tab]").filter({ hasText: /^(Diagram|図)$/ }).click();
    await expect(page.locator(".sw-preview svg#swimlane-svg")).toBeVisible();
    await expect(page.locator("textarea.sw-code-input")).toHaveCount(0);
  });

  test("folds the file tree away once a file is open, and back on request", async ({ page }) => {
    await openDemo(page);
    // Nothing open yet, so the tree is the only useful thing and is showing.
    await expect(page.locator(".sw-tree-file").first()).toBeVisible();
    await page.locator(".sw-tree-file", { hasText: "hiring.txt" }).first().click();
    // Picking a file hands the screen to the file.
    await expect(page.locator(".sw-tree-file")).toHaveCount(0);
    await expect(page.locator(".sw-tree-collapsed")).toBeVisible();
    await showTree(page);
    await expect(page.locator(".sw-tree-file").first()).toBeVisible();
  });
});
