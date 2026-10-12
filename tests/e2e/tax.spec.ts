import { dialog, expect, expectNoDialogs, test } from "./fixtures";

test("adds a tax code, edits it and deactivates it", async ({ signedIn: page }) => {
  await page.goto("/tax");
  await page.getByRole("button", { name: "Add tax code" }).click();
  const add = dialog(page, "Add tax code");
  await add.getByPlaceholder("e.g. GH-TOUR").fill("e2e-tour");
  await add.getByPlaceholder("e.g. Tourism levy").fill("E2E tourism levy");
  await add.getByPlaceholder("e.g. 20").fill("1");
  await add.getByRole("combobox", { name: /^Output tax account/ }).selectOption({ index: 1 });
  await add.getByRole("button", { name: "Add tax code" }).click();
  await expect(page.getByRole("status").filter({ hasText: "E2E-TOUR added" })).toBeVisible();
  await expectNoDialogs(page);

  const row = page.getByRole("row").filter({ hasText: "E2E-TOUR" });
  await expect(row).toContainText("1%");
  await row.getByRole("button", { name: "Edit E2E-TOUR" }).click();
  const edit = dialog(page, "Edit E2E-TOUR");
  await edit.getByPlaceholder("e.g. 20").fill("2.5");
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status").filter({ hasText: "E2E-TOUR saved" })).toBeVisible();
  await expect(row).toContainText("2.5%");

  await row.getByRole("button", { name: "Edit E2E-TOUR" }).click();
  await dialog(page, "Edit E2E-TOUR").getByRole("button", { name: "Deactivate" }).click();
  await expect(page.getByRole("status").filter({ hasText: "E2E-TOUR deactivated" })).toBeVisible();
  await expect(row.getByText(/inactive/i)).toBeVisible();
});
