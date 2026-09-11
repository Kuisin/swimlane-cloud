import { expect, test, type Page } from "@playwright/test";

/** The Pixel 7 project. Below the editor's narrow breakpoint. */
export const onPhone = () => test.info().project.name === "phone";

/**
 * Make the file tree reachable.
 *
 * A narrow screen folds the tree away once a file is open — it would otherwise
 * take most of the width — so a test that wants to click a file has to open it
 * first, exactly as a reader would. On a wide screen the tree is already there
 * and this does nothing.
 */
export async function showTree(page: Page) {
  const rail = page.locator(".sw-tree-collapsed button");
  if (await rail.isVisible().catch(() => false)) await rail.click();
  await expect(page.locator(".sw-tree-file").first()).toBeVisible();
}

/** Open the demo from a clean slate, with the tree showing. */
export async function openDemo(page: Page) {
  await page.goto("/?demo=reset");
  // A clean slate also brings back the first-run tour.
  const gotIt = page.getByRole("button", { name: /got it|了解/i });
  if (await gotIt.isVisible().catch(() => false)) await gotIt.click();
  await showTree(page);
}

/**
 * Fold the tree away again on a phone, where it overlays the panes: anything
 * the test wants to click underneath it is covered until it does.
 */
export async function hideTree(page: Page) {
  if (!onPhone()) return;
  const collapse = page.locator(".sw-tree-header button[title='Collapse files']");
  if (await collapse.isVisible().catch(() => false)) await collapse.click();
}

/**
 * Show one of the narrow layout's panes. A no-op on a wide screen, where every
 * pane is on show at once and there is no switcher.
 */
export async function showPane(page: Page, name: RegExp) {
  if (!onPhone()) return;
  await page.locator(".sw-pane-switcher [role=tab]").filter({ hasText: name }).click();
}
