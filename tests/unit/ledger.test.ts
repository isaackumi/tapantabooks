import { describe, expect, it } from "vitest";
import { balanceSheet, incomeStatement, isBalanced, lineTotals, trialBalance } from "@/lib/ledger";
import { affectsLedger } from "@/lib/ledger";
import { createInitialState } from "@/mock/api/engine";
import { DEMO_TODAY } from "@/utils/dates";

const seed = createInitialState();

describe("lineTotals and isBalanced", () => {
  it("rounds totals and reports the difference", () => {
    expect(lineTotals([{ debit: 0.1, credit: 0 }, { debit: 0.2, credit: 0 }, { debit: 0, credit: 0.3 }])).toEqual({
      debit: 0.3,
      credit: 0.3,
      difference: 0,
    });
  });

  it("rejects one-sided and empty entries", () => {
    expect(isBalanced([{ debit: 100, credit: 0 }, { debit: 0, credit: 100 }])).toBe(true);
    expect(isBalanced([{ debit: 100, credit: 0 }, { debit: 0, credit: 99.99 }])).toBe(false);
    expect(isBalanced([{ debit: 0, credit: 0 }])).toBe(false);
  });
});

describe("the demo books", () => {
  it("contain only balanced posted journals", () => {
    const unbalanced = seed.journals.filter((j) => affectsLedger(j) && !isBalanced(j.lines)).map((j) => j.number);
    expect(unbalanced).toEqual([]);
  });

  it("have a trial balance that balances", () => {
    expect(trialBalance(seed.accounts, seed.journals, DEMO_TODAY).totals.difference).toBe(0);
  });

  it.each(["2026-03-31", "2026-06-30", DEMO_TODAY])("have a balance sheet that balances on %s", (asAt) => {
    expect(balanceSheet(seed.accounts, seed.journals, asAt).difference).toBeCloseTo(0, 2);
  });

  it("show current-year profit in equity equal to the income statement", () => {
    const pnl = incomeStatement(seed.accounts, seed.journals, "2026-01-01", DEMO_TODAY);
    expect(balanceSheet(seed.accounts, seed.journals, DEMO_TODAY).currentEarnings).toBe(pnl.netIncome);
    expect(pnl.netIncome).toBe(Math.round((pnl.grossProfit - pnl.totalOperating) * 100) / 100);
  });
});
