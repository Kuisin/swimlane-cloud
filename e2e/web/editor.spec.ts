import { expect, test, type Page } from "@playwright/test";

/**
 * The phone layout keeps the tree and the step list and pushes the preview
 * off-screen, so anything that needs the drawn diagram is desktop-only.
 */
const onPhone = () => test.info().project.name === "phone";

/** The diagram itself — the preview also holds small icon SVGs. */
const diagram = (page: Page) => page.locator(".sw-preview svg#swimlane-svg");

/** Open the demo from a clean slate and wait for the file tree. */
async function openDemo(page: Page) {
  await page.goto("/?demo=reset");
  await expect(page.locator(".sw-tree-file").first()).toBeVisible();
  // A clean slate also brings back the first-run tour; it sits over the
  // preview on a phone.
  const gotIt = page.getByRole("button", { name: /got it|了解/i });
  if (await gotIt.isVisible().catch(() => false)) await gotIt.click();
}

async function openFile(page: Page, name: string) {
  await page.locator(".sw-tree-file", { hasText: name }).first().click();
  await expect(page.locator(".sw-tree-active .sw-tree-label", { hasText: name })).toBeVisible();
  if (!onPhone()) await expect(diagram(page)).toBeVisible();
}

test.describe("the demo editor", () => {
  test("seeds the samples and renders the first one opened", async ({ page }) => {
    await openDemo(page);
    await expect(page.locator(".sw-tree-file")).toHaveCount(4);
    await openFile(page, "order-to-cash.txt");
    test.skip(onPhone(), "no preview on a phone");
    const svg = diagram(page);
    // Numbering levels reach the gutter, a landing marker takes no space,
    // and the linked step carries its ↗ tile.
    await expect(svg).toContainText("2-1. ");
    await expect(svg.locator("[data-link]")).toHaveCount(1);
  });

  test("a dialog draws with a real background", async ({ page }) => {
    await openDemo(page);
    await openFile(page, "hiring.txt");
    // On a touch screen there is no hover: the open file must show its
    // rename action without one.
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
    await page.locator(".sw-tree-active .sw-tree-item-del[title='Rename file']").click();
    const input = page.locator(".sw-modal.sw-dialog input");
    await input.fill("recruiting.txt");
    await input.press("Enter");
    await expect(page.locator(".sw-tree-file", { hasText: "recruiting.txt" })).toBeVisible();
    await expect(page.locator(".sw-tree-file", { hasText: "hiring.txt" })).toHaveCount(0);
    // It stuck: a reload (without the reset) still lists the new name.
    await page.goto("/");
    await expect(page.locator(".sw-tree-file", { hasText: "recruiting.txt" })).toBeVisible();
  });

  test("clicking a linked step's ↗ opens the target flow", async ({ page }) => {
    test.skip(onPhone(), "no preview on a phone");
    await openDemo(page);
    await openFile(page, "order-to-cash.txt");
    await page.locator(".sw-preview [data-link]").click();
    await expect(
      page.locator(".sw-tree-active .sw-tree-label", { hasText: "hiring.txt" }),
    ).toBeVisible();
  });

  test("adding a section from the GUI draws a visible box", async ({ page }) => {
    test.skip(onPhone(), "no preview on a phone");
    await openDemo(page);
    await openFile(page, "hiring.txt");
    // Select the first step, then add a group around it via the Add menu.
    await page.locator(".sw-preview [data-row-index]").first().click();
    await page.getByRole("button", { name: /add block/i }).click();
    await page.getByText(/group visually/i).click();
    const boxes = diagram(page).locator("rect[stroke-dasharray]");
    await expect(boxes.first()).toBeVisible();
    const height = await boxes.first().evaluate((el) => Number(el.getAttribute("height")));
    expect(height).toBeGreaterThanOrEqual(30);
  });
});
