import { dialog, expect, test } from "./fixtures";

test("shows a balance sheet where assets equal liabilities plus equity", async ({ signedIn: page }) => {
  await page.goto("/reports/balance-sheet");
  await expect(page.getByText("Assets equal liabilities plus equity")).toBeVisible();
  await expect(page.getByText(/Out of balance by/)).toHaveCount(0);
});

test("will not close the current financial year while its months are still open", async ({ signedIn: page }) => {
  await page.goto("/accounting/periods");
  const year = page.locator("section[data-tour=fiscal-years] .rounded-xl").filter({ hasText: "Current year" });
  await year.getByRole("button", { name: "Preview close" }).click();

  const preview = dialog(page, /^Close /);
  await expect(preview.getByText("This year cannot be closed yet")).toBeVisible();
  await expect(preview.getByRole("button", { name: "Close year" })).toBeDisabled();
});
