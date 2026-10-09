import { expect, test } from "./fixtures";

test("drills from the trial balance into an account's general ledger", async ({ signedIn: page }) => {
  await page.goto("/accounting/trial-balance");
  await expect(page.getByText("In balance")).toBeVisible();
  await page.getByRole("link", { name: "GCB Bank – Operating" }).click();
  await expect(page).toHaveURL(/\/accounting\/general-ledger\?account=.+&to=\d{4}-\d{2}-\d{2}/);
  await expect(page.getByRole("heading", { name: /GCB Bank – Operating/ })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Closing balance" })).toBeVisible();
});

test("drills from receivables ageing to the documents and the customer statement", async ({ signedIn: page }) => {
  await page.goto("/reports/ar-ageing");
  const firstParty = page.locator("tbody tr").first();
  await expect(firstParty).toBeVisible();
  await firstParty.click();
  await expect(page.getByRole("link", { name: /^INV-/ }).first()).toBeVisible();
  await page.getByRole("link", { name: /^Statement of account for / }).first().click();
  // A cold dev server compiles the statements route on first visit.
  await expect(page).toHaveURL(/\/reports\/statements\?kind=customer&party=/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Statement of account" })).toBeVisible();
});
