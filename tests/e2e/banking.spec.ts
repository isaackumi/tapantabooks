import { dialog, expect, expectNoDialogs, test } from "./fixtures";

test("reconciles the GCB statement line by line and signs it off", async ({ signedIn: page }) => {
  await page.goto("/banking/reconciliation");
  const complete = page.getByRole("button", { name: "Complete reconciliation" });
  const difference = page.locator("dl > div").filter({ hasText: "Unexplained difference" });
  await expect(complete).toBeDisabled();
  await expect(difference).toContainText("0.00");

  await page.getByRole("button", { name: "Accept all suggestions" }).click();
  await expect(page.getByText(/\d+ suggested matches accepted/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Accept all suggestions|Accepting/ })).toHaveCount(0);

  // What is left either has a ledger entry of the exact amount to find, or needs an entry posting.
  const open = page.locator("[data-tour=rec-lines] tbody tr").filter({ has: page.getByRole("button", { name: "Create" }) });
  for (let remaining = await open.count(); remaining > 0; remaining = await open.count()) {
    const line = open.first();
    const description = (await line.locator("td").nth(1).textContent())!;
    await line.getByRole("button", { name: "Find" }).click();
    const finder = dialog(page, "Match to a ledger entry");
    await expect(finder).toContainText(description);
    const exact = finder.getByRole("listitem").filter({ hasText: "exact amount" }).first();
    if (await exact.count()) {
      await exact.getByRole("button", { name: "Match" }).click();
    } else {
      await page.keyboard.press("Escape");
      await expectNoDialogs(page);
      await line.getByRole("button", { name: "Create" }).click();
      const create = dialog(page, "Create entry from statement line");
      const account = create.getByRole("combobox");
      if (!(await account.inputValue())) await account.selectOption({ label: "2200 · Accrued Expenses" });
      await create.getByRole("button", { name: "Post & match" }).click();
    }
    await expectNoDialogs(page);
    await expect(open).toHaveCount(remaining - 1);
  }

  await expect(page.getByText("Every line is matched. Complete the reconciliation to sign it off.")).toBeVisible();
  await expect(difference).toContainText("0.00");
  await complete.click();
  await expect(page.getByText("GCB Operating Account reconciled")).toBeVisible();
});
