#!/usr/bin/env node
// Captures the screenshots used by docs/PRODUCT_GUIDE.md from a running dev server (npm run dev).
//
//   node scripts/guide/screenshots.mjs [name ...]
//
// With names, only those shots are retaken. Output: docs/guide/img/<name>.png

import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const BASE = process.env.GUIDE_BASE_URL ?? "http://localhost:3005";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "docs", "guide", "img");

const firstRow = async (page) => {
  await page.locator("[data-tour=table] tbody tr, table tbody tr").first().click();
};
const rowWith = (text) => async (page) => page.locator("table tbody tr").filter({ hasText: text }).first().click();
const button = (name) => async (page) => page.getByRole("button", { name }).first().click();

const SHOTS = [
  { name: "login", path: "/auth/login", signedOut: true },
  { name: "dashboard", path: "/dashboard" },
  { name: "chart-of-accounts", path: "/accounting/chart-of-accounts" },
  { name: "journals", path: "/accounting/journals" },
  { name: "journal-detail", path: "/accounting/journals", action: firstRow },
  { name: "journal-new", path: "/accounting/journals", action: button("New journal entry") },
  { name: "general-ledger", path: "/accounting/general-ledger?account=acc_1020" },
  { name: "trial-balance", path: "/accounting/trial-balance" },
  { name: "periods", path: "/accounting/periods" },
  { name: "opening-balances", path: "/accounting/opening-balances" },
  { name: "revaluation", path: "/accounting/revaluation" },
  { name: "customers", path: "/sales/customers" },
  { name: "customer-detail", path: "/sales/customers", action: firstRow },
  { name: "invoices", path: "/sales/invoices" },
  { name: "invoice-detail", path: "/sales/invoices", action: rowWith("INV-2026-0036") },
  { name: "invoice-new", path: "/sales/invoices", action: button("New invoice") },
  { name: "receipts", path: "/sales/receipts" },
  { name: "credit-notes", path: "/sales/credit-notes" },
  { name: "suppliers", path: "/purchases/suppliers" },
  { name: "bills", path: "/purchases/bills" },
  { name: "bill-detail", path: "/purchases/bills", action: firstRow },
  { name: "supplier-payments", path: "/purchases/payments" },
  { name: "supplier-credits", path: "/purchases/supplier-credits" },
  { name: "bank-accounts", path: "/banking/accounts" },
  { name: "reconciliation", path: "/banking/reconciliation" },
  { name: "tax", path: "/tax" },
  { name: "reports", path: "/reports" },
  { name: "income-statement", path: "/reports/income-statement" },
  { name: "balance-sheet", path: "/reports/balance-sheet" },
  { name: "cash-flow", path: "/reports/cash-flow" },
  { name: "ar-ageing", path: "/reports/ar-ageing" },
  { name: "customer-statement", path: "/reports/statements?kind=customer&party=cus_01" },
  { name: "data-sources", path: "/integrations/sources" },
  { name: "imports", path: "/integrations/imports" },
  { name: "import-detail", path: "/integrations/imports", action: firstRow },
  { name: "field-mappings", path: "/integrations/mappings" },
  { name: "accounting-rules", path: "/integrations/rules" },
  { name: "audit-trail", path: "/audit-trail" },
  { name: "settings", path: "/settings" },
  { name: "user-menu", path: "/dashboard", action: button("Open user menu") },
];

const settle = async (page) => {
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
  await page.locator("h1, h2").first().waitFor({ timeout: 60_000 });
  await page
    .waitForFunction(() => !document.querySelector(".animate-pulse") && !document.body.innerText.includes("Loading your books"), null, {
      timeout: 30_000,
    })
    .catch(() => {});
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" }).catch(() => {});
  await page.waitForTimeout(800);
};

const only = new Set(process.argv.slice(2));
const shots = only.size ? SHOTS.filter((s) => only.has(s.name)) : SHOTS;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await context.addInitScript(() => {
  window.localStorage.setItem("tvs-tours", JSON.stringify({ completed: [], welcomeSeen: true }));
});
const page = await context.newPage();

const signIn = async () => {
  await page.goto(`${BASE}/auth/login`);
  await page.getByRole("button", { name: "Continue with the demo company" }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
  await settle(page);
};

let signedIn = false;
for (const shot of shots) {
  if (shot.signedOut) {
    const fresh = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await fresh.goto(`${BASE}${shot.path}`);
    await settle(fresh);
    await fresh.screenshot({ path: join(OUT, `${shot.name}.png`) });
    await fresh.close();
    console.log(`✓ ${shot.name}`);
    continue;
  }
  if (!signedIn) {
    await signIn();
    signedIn = true;
  }
  for (let attempt = 1; ; attempt++) {
    try {
      await page.goto(`${BASE}${shot.path}`, { timeout: 120_000 });
      await settle(page);
      if (shot.action) {
        await shot.action(page);
        await settle(page);
      }
      break;
    } catch (error) {
      if (attempt === 3) throw error;
      console.log(`  retrying ${shot.name}`);
    }
  }
  await page.screenshot({ path: join(OUT, `${shot.name}.png`) });
  console.log(`✓ ${shot.name}`);
  await page.keyboard.press("Escape");
}

await browser.close();
