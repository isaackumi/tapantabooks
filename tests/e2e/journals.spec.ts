import type { Page } from "@playwright/test";
import { closeDialogs, dialog, expect, postedNumber, switchUser, test } from "./fixtures";

const openNewJournal = async (page: Page) => {
  await page.goto("/accounting/journals");
  await page.getByRole("button", { name: "New journal entry" }).click();
  return dialog(page, "New journal entry");
};

const fillLines = async (form: ReturnType<typeof dialog>, debit: string, credit: string, amount: string) => {
  const lines = form.locator("tbody tr");
  await lines.nth(0).getByRole("combobox").first().selectOption({ label: debit });
  await lines.nth(0).getByRole("spinbutton").first().fill(amount);
  await lines.nth(1).getByRole("combobox").first().selectOption({ label: credit });
  await lines.nth(1).getByRole("spinbutton").nth(1).fill(amount);
  await expect(form.getByText("Balanced", { exact: true })).toBeVisible();
};

test("needs a second person to approve a journal at or above the threshold", async ({ signedIn: page }) => {
  const form = await openNewJournal(page);
  await form.getByRole("textbox", { name: /^Memo/ }).fill("E2E accrue October salaries");
  await fillLines(form, "6010 · Salaries & Wages", "1020 · GCB Bank – Operating", "60000");
  await expect(form.getByText(/a second person must approve before it posts/)).toBeVisible();
  await form.getByRole("button", { name: "Submit for approval" }).click();

  const number = await postedNumber(page, /JE-2026-\d+/);
  await closeDialogs(page);
  const row = page.getByRole("row").filter({ hasText: number });
  await expect(row.getByText("Awaiting approval")).toBeVisible();

  await row.click();
  await expect(page.getByText("You prepared this entry, so a different person has to approve it.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve & post" })).toBeDisabled();
  await closeDialogs(page);

  await switchUser(page, "Kofi Boateng");
  await row.click();
  await page.getByRole("button", { name: "Approve & post" }).click();
  await expect(page.getByText(`${number} approved and posted`)).toBeVisible();
  await closeDialogs(page);
  await expect(row.getByText("Posted", { exact: true })).toBeVisible();
});

test("refuses to post into a locked month", async ({ signedIn: page }) => {
  const form = await openNewJournal(page);
  await form.locator('input[type="date"]').fill("2026-07-15");
  await expect(form.getByText("July 2026 is locked", { exact: true })).toBeVisible();
  await form.getByRole("textbox", { name: /^Memo/ }).fill("E2E late July adjustment");
  await fillLines(form, "6060 · Bank Charges", "1020 · GCB Bank – Operating", "45");
  await form.getByRole("button", { name: "Post entry" }).click();
  await expect(form.getByText("July 2026 is locked. Reopen it in Fiscal periods before posting to it.")).toBeVisible();
  await expect(form).toBeVisible();
});
