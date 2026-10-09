import { closeDialogs, dialog, expect, postedNumber, test } from "./fixtures";

test("records a supplier bill, pays it in full and shows it as paid", async ({ signedIn: page }) => {
  await page.goto("/purchases/bills");
  await page.getByRole("button", { name: "New bill" }).click();

  const form = dialog(page, "New supplier bill");
  await form.getByRole("combobox", { name: /^Supplier/ }).selectOption({ label: "Kumasi Packaging Co. (S-0002)" });
  await form.getByRole("textbox", { name: /^Supplier invoice no\./ }).fill(`E2E-${Date.now()}`);
  await form.getByPlaceholder("e.g. Delivery to Osu branch").fill("E2E office supplies");
  const line = form.getByRole("row").filter({ has: page.getByPlaceholder("e.g. Delivery to Osu branch") });
  await line.getByRole("combobox").first().selectOption({ label: "6090 · Office Supplies" });
  await line.getByRole("spinbutton").nth(1).fill("500");
  await expect(form.locator("dl > div").filter({ has: page.getByText("Total", { exact: true }) })).toContainText("600.00");
  await form.getByRole("textbox", { name: /^Purchase order number/ }).fill("PO-E2E-001");
  await form.getByRole("button", { name: "Approve & post" }).click();

  const number = await postedNumber(page, /BILL-2026-\d+/);
  await closeDialogs(page);

  await page.getByRole("button", { name: "Record payment" }).click();
  const payment = dialog(page, "Record supplier payment");
  const billSelect = payment.getByRole("combobox", { name: /^Bill/ });
  await billSelect.selectOption({ value: (await billSelect.locator("option", { hasText: number }).getAttribute("value"))! });
  await expect(payment.getByRole("spinbutton", { name: /^Amount/ })).toHaveValue("600");
  await payment.getByRole("button", { name: "Record payment" }).click();
  await expect(payment).toBeHidden();

  await expect(page.getByRole("row").filter({ hasText: number }).getByText("Paid", { exact: true })).toBeVisible();
});
