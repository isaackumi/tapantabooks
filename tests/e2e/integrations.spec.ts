import { dialog, expect, expectNoDialogs, test } from "./fixtures";

test("adds a posting rule, edits it and deletes it", async ({ signedIn: page }) => {
  await page.goto("/integrations/rules");
  await page.getByRole("button", { name: "New rule" }).click();
  const add = dialog(page, "New posting rule");
  await add.getByPlaceholder("e.g. Loan fee charged").fill("E2E fee rule");
  await add.getByPlaceholder("e.g. loans.fee.charged").fill("e2e.fee.charged");
  await add.getByRole("combobox", { name: "Line 1 account" }).selectOption({ index: 1 });
  await add.getByRole("combobox", { name: "Line 2 account" }).selectOption({ index: 2 });
  await expect(add.getByText(/balanced/)).toBeVisible();
  await add.getByRole("button", { name: "Add rule" }).click();
  await expect(page.getByRole("status").filter({ hasText: "E2E fee rule added" })).toBeVisible();
  await expectNoDialogs(page);

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const edit = dialog(page, "Edit E2E fee rule");
  await edit.getByPlaceholder("e.g. Loan fee charged").fill("E2E fee rule v2");
  await edit.getByRole("button", { name: "Save rule" }).click();
  await expect(page.getByRole("status").filter({ hasText: "E2E fee rule v2 saved" })).toBeVisible();
  await expectNoDialogs(page);

  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await dialog(page, "Delete E2E fee rule v2?").getByRole("button", { name: "Delete rule" }).click();
  await expect(page.getByRole("status").filter({ hasText: "E2E fee rule v2 deleted" })).toBeVisible();
  await expect(page.getByRole("button", { name: /E2E fee rule v2/ })).toHaveCount(0);
});

test("adds a data source and removes it", async ({ signedIn: page }) => {
  await page.goto("/integrations/sources");
  await page.getByRole("button", { name: "Add source" }).click();
  const add = dialog(page, "Add data source");
  await add.getByPlaceholder("e.g. Hubtel POS").fill("E2E POS");
  await add.getByPlaceholder("e.g. Hubtel", { exact: true }).fill("E2E Vendor");
  await add.getByRole("combobox", { name: /^How the data arrives/ }).selectOption("API");
  await add.getByRole("textbox", { name: /^Records it sends/ }).fill("Sales, Refunds");
  await add.getByRole("button", { name: "Add source" }).click();
  await expect(page.getByRole("status").filter({ hasText: "E2E POS added" })).toBeVisible();

  const drawer = dialog(page, "E2E POS");
  await drawer.getByRole("button", { name: "Remove source" }).click();
  await dialog(page, "Remove E2E POS?").getByRole("button", { name: "Remove source" }).click();
  await expect(page.getByRole("status").filter({ hasText: "E2E POS removed" })).toBeVisible();
  await expectNoDialogs(page);
});
