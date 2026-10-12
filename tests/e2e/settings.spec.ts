import { dialog, expect, expectNoDialogs, test } from "./fixtures";

test("renames a branch and deactivates it after confirming", async ({ signedIn: page }) => {
  await page.goto("/settings?tab=dimensions");
  const row = page.getByRole("row").filter({ hasText: "BR-TKD" });
  await row.getByRole("button", { name: "Edit BR-TKD" }).click();
  const edit = dialog(page, "Edit BR-TKD");
  await expect(edit.getByRole("textbox", { name: /^Code/ })).toBeDisabled();
  await edit.getByRole("textbox", { name: /^Name/ }).fill("Takoradi Harbour");
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Takoradi Harbour saved" })).toBeVisible();
  await expectNoDialogs(page);
  await expect(row).toContainText("Takoradi Harbour");

  await row.getByRole("button", { name: "Deactivate BR-TKD" }).click();
  await dialog(page, "Deactivate Takoradi Harbour?").getByRole("button", { name: "Deactivate" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Takoradi Harbour deactivated" })).toBeVisible();
  await expect(row.getByText(/inactive/i)).toBeVisible();
});

test("renames a currency and confirms before deleting a manual rate", async ({ signedIn: page }) => {
  await page.goto("/settings?tab=currencies");
  const row = page.getByRole("row").filter({ hasText: "USD" }).first();
  await row.getByRole("button", { name: "Edit USD" }).click();
  const edit = dialog(page, "Edit USD");
  await edit.getByRole("textbox", { name: /^Name/ }).fill("US dollar (cash)");
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status").filter({ hasText: "USD saved" })).toBeVisible();
  await expectNoDialogs(page);
  await expect(row).toContainText("US dollar (cash)");

  await row.click();
  await page.getByRole("spinbutton", { name: /GH₵ per 1 USD/ }).fill("15.1234");
  await page.getByRole("button", { name: "Record rate" }).click();
  await expect(page.getByRole("status").filter({ hasText: "USD rate recorded" })).toBeVisible();
  await page.getByRole("button", { name: /^Delete rate for / }).first().click();
  await dialog(page, /^Delete the USD rate for /).getByRole("button", { name: "Delete rate" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Rate deleted" })).toBeVisible();
});
