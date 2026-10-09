import { test as base, expect, type Page } from "@playwright/test";

/** Each test runs in a fresh browser context, so it starts from the seed data with no session. */
export const test = base.extend<{ signedIn: Page }>({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("tvs-tours", JSON.stringify({ completed: [], welcomeSeen: true }));
    });
    await use(page);
  },
  signedIn: async ({ page }, use) => {
    await signInAsDemo(page);
    await use(page);
  },
});

export { expect };

export const signInAsDemo = async (page: Page) => {
  await page.goto("/auth/login");
  await page.getByRole("button", { name: "Continue with the demo company" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Open user menu" })).toBeVisible();
};

/**
 * Headless UI's role="dialog" wrapper has no box of its own, so Playwright always reports it hidden.
 * The panel inside it is what is actually on screen.
 */
const PANEL = '[id^="headlessui-dialog-panel"]';

export const dialog = (page: Page, title: string | RegExp) => page.locator(PANEL).filter({ has: page.getByRole("heading", { name: title }) });

/** Waits out closing transitions too: a closing panel still shows its old content. */
export const expectNoDialogs = (page: Page) => expect(page.locator(`${PANEL}:visible`)).toHaveCount(0);

export const closeDialogs = async (page: Page) => {
  await page.keyboard.press("Escape");
  await expectNoDialogs(page);
};

/** Reads the document number from the success toast, e.g. "INV-2026-0044 approved and posted". */
export const postedNumber = async (page: Page, pattern: RegExp) => {
  const toast = page.getByRole("status").filter({ hasText: pattern }).first();
  await expect(toast).toBeVisible();
  return (await toast.textContent())!.match(pattern)![0];
};

export const switchUser = async (page: Page, name: string) => {
  await page.getByRole("button", { name: "Open user menu" }).click();
  await page.getByRole("menuitem", { name: new RegExp(name) }).click();
  await expect(page.getByText(`Now acting as ${name}`)).toBeVisible();
};
