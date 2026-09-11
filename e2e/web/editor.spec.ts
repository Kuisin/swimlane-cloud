import { expect, test, type Page } from "@playwright/test";
import { hideTree, onPhone, openDemo, showPane, showTree } from "./helpers";

/**
 * A phone shows one pane at a time, so a test that wants the drawn diagram has
 * to ask for it first — `showPane` does that, and is a no-op on a wide screen
 * where every pane is already visible.
 */

/** The diagram itself — the preview also holds small icon SVGs. */
const diagram = (page: Page) => page.locator(".sw-preview svg#swimlane-svg");

async function openFile(page: Page, name: string) {
  await showTree(page);
  await page.locator(".sw-tree-file", { hasText: name }).first().click();
  // Picking a file folds the tree away on a phone; bring it back so the
  // assertion below, and anything the test does to the tree, can see it.
  await showTree(page);
  await expect(page.locator(".sw-tree-active .sw-tree-label", { hasText: name })).toBeVisible();
  // On a phone the tree floats over the panes, so leaving it open would cover
  // whatever the test means to touch next.
  await hideTree(page);
  if (!onPhone()) await expect(diagram(page)).toBeVisible();
}

test.describe("the demo editor", () => {
  test("seeds the samples and renders the first one opened", async ({ page }) => {
    await openDemo(page);
    await expect(page.locator(".sw-tree-file")).toHaveCount(4);
    await openFile(page, "order-to-cash.txt");
    await showPane(page, /^(Diagram|図)$/);
    const svg = diagram(page);
    // Numbering levels reach the gutter and the linked step carries its ↗
    // tile. (The sample's `[goto: invoice]` lands on a real step, so there
    // is no marker row taking up space either way.)
    await expect(svg).toContainText("2-1. ");
    await expect(svg.locator("[data-link]")).toHaveCount(1);
  });

  test("a dialog draws with a real background", async ({ page }) => {
    await openDemo(page);
    await openFile(page, "hiring.txt");
    // On a touch screen there is no hover: the open file must show its
    // rename action without one.
    await showTree(page);
    await page.locator(".sw-tree-active .sw-tree-item-del[title='Rename file']").click();
    const modal = page.locator(".sw-modal.sw-dialog");
    await expect(modal).toBeVisible();
    const bg = await modal.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
    await page.keyboard.press("Escape");
    await expect(modal).toBeHidden();
  });

  test("renames a file from the tree", async ({ page }) => {
    await openDemo(page);
    await openFile(page, "hiring.txt");
    await showTree(page);
    await page.locator(".sw-tree-active .sw-tree-item-del[title='Rename file']").click();
    const input = page.locator(".sw-modal.sw-dialog input");
    await input.fill("recruiting.txt");
    await input.press("Enter");
    await showTree(page);
    await expect(page.locator(".sw-tree-file", { hasText: "recruiting.txt" })).toBeVisible();
    await expect(page.locator(".sw-tree-file", { hasText: "hiring.txt" })).toHaveCount(0);
    // It stuck: a reload (without the reset) still lists the new name.
    await page.goto("/");
    await showTree(page);
    await expect(page.locator(".sw-tree-file", { hasText: "recruiting.txt" })).toBeVisible();
  });

  test("clicking a linked step's ↗ opens the target flow", async ({ page }) => {
    await openDemo(page);
    await openFile(page, "order-to-cash.txt");
    await showPane(page, /^(Diagram|図)$/);
    await page.locator(".sw-preview [data-link]").click();
    await showTree(page);
    await expect(
      page.locator(".sw-tree-active .sw-tree-label", { hasText: "hiring.txt" }),
    ).toBeVisible();
  });

  test("adding a section from the GUI draws a visible box", async ({ page }) => {
    await openDemo(page);
    await openFile(page, "hiring.txt");
    // Select the first step from the diagram, then add a group around it via
    // the Add menu, which lives over in the flow pane.
    await showPane(page, /^(Diagram|図)$/);
    await page.locator(".sw-preview [data-row-index]").first().click();
    await showPane(page, /^(Flow|フロー)$/);
    await page.getByRole("button", { name: /add block/i }).click();
    await page.getByText(/group visually/i).click();
    await showPane(page, /^(Diagram|図)$/);
    const boxes = diagram(page).locator("rect[stroke-dasharray]");
    await expect(boxes.first()).toBeVisible();
    const height = await boxes.first().evaluate((el) => Number(el.getAttribute("height")));
    expect(height).toBeGreaterThanOrEqual(30);
  });
});
