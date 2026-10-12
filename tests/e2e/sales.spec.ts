import { closeDialogs, dialog, expect, expectNoDialogs, postedNumber, test } from "./fixtures";

test("raises an invoice, collects it in full and shows it as paid", async ({ signedIn: page }) => {
  await page.goto("/sales/invoices");
  await page.getByRole("button", { name: "New invoice" }).click();

  const form = dialog(page, "New sales invoice");
  await form.getByRole("combobox", { name: /^Customer/ }).selectOption({ label: "Osu Fresh Mart (C-0003)" });
  await form.getByPlaceholder("e.g. Rice 25kg × bags").fill("E2E rice delivery");
  const line = form.getByRole("row").filter({ has: page.getByPlaceholder("e.g. Rice 25kg × bags") });
  await line.getByRole("spinbutton").nth(1).fill("1000");
  await expect(form.locator("dl > div").filter({ has: page.getByText("Total", { exact: true }) })).toContainText("1,200.00");
  await form.getByRole("button", { name: "Approve & post" }).click();
  const number = await postedNumber(page, /INV-2026-\d+/);
  await closeDialogs(page);

  await page.getByRole("button", { name: "Record receipt" }).click();
  const receipt = dialog(page, "Record customer receipt");
  const invoiceSelect = receipt.getByRole("combobox", { name: /^Invoice/ });
  const option = invoiceSelect.locator("option", { hasText: number });
  await invoiceSelect.selectOption({ value: (await option.getAttribute("value"))! });
  await expect(receipt.getByRole("spinbutton", { name: /^Amount/ })).toHaveValue("1200");
  await receipt.getByRole("button", { name: "Record receipt" }).click();
  await expect(receipt).toBeHidden();

  const row = page.getByRole("row").filter({ hasText: number });
  await expect(row.getByText("Paid", { exact: true })).toBeVisible();
});

test("voids a receipt and the invoice is owed again", async ({ signedIn: page }) => {
  await page.goto("/sales/invoices");
  await page.getByRole("button", { name: "New invoice" }).click();
  const form = dialog(page, "New sales invoice");
  await form.getByRole("combobox", { name: /^Customer/ }).selectOption({ label: "Osu Fresh Mart (C-0003)" });
  await form.getByPlaceholder("e.g. Rice 25kg × bags").fill("E2E bounced cheque");
  const line = form.getByRole("row").filter({ has: page.getByPlaceholder("e.g. Rice 25kg × bags") });
  await line.getByRole("spinbutton").nth(1).fill("500");
  await form.getByRole("button", { name: "Approve & post" }).click();
  const invoice = await postedNumber(page, /INV-2026-\d+/);
  await closeDialogs(page);

  await page.getByRole("button", { name: "Record receipt" }).click();
  const receiptForm = dialog(page, "Record customer receipt");
  const invoiceSelect = receiptForm.getByRole("combobox", { name: /^Invoice/ });
  await invoiceSelect.selectOption({ value: (await invoiceSelect.locator("option", { hasText: invoice }).getAttribute("value"))! });
  await receiptForm.getByRole("combobox", { name: /^Method/ }).selectOption("CHEQUE");
  await receiptForm.getByRole("button", { name: "Record receipt" }).click();
  const receipt = await postedNumber(page, /RCT-2026-\d+/);
  await expectNoDialogs(page);

  await page.goto("/sales/receipts");
  await page.getByRole("row").filter({ hasText: receipt }).getByText(receipt).click();
  await page.getByRole("button", { name: "Void receipt" }).click();
  const confirm = dialog(page, `Void ${receipt}`);
  await confirm.getByRole("textbox").fill("Cheque returned unpaid");
  await confirm.getByRole("button", { name: "Void receipt" }).click();
  await expect(page.getByRole("status").filter({ hasText: `${receipt} voided` })).toBeVisible();
  await expect(confirm).toBeHidden();
  await page.getByRole("button", { name: "Close" }).first().click();
  await expectNoDialogs(page);
  await expect(page.getByRole("row").filter({ hasText: receipt }).getByText("VOID")).toBeVisible();

  await page.goto("/sales/invoices");
  await expect(page.getByRole("row").filter({ hasText: invoice }).getByText("Open", { exact: true })).toBeVisible();
});
