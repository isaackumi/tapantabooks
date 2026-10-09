import { describe, expect, it } from "vitest";
import { fiscalYearPeriods } from "@/mock/api/engine";
import { fiscalYearFor, fiscalYearsView, yearEndPreview } from "@/lib/fiscalYears";
import { balanceSheet, incomeStatement, trialBalance } from "@/lib/ledger";
import { ACC } from "@/mock/seed";
import { DEMO_TODAY } from "@/utils/dates";
import { demoBooks, expectFail, expectOk } from "./helpers";

/** The demo books plus a finished FY 2025 with sales of 1,000 and rent of 300. */
const withFy2025 = () => {
  const books = demoBooks();
  books.ref.current = { ...books.state, periods: [...fiscalYearPeriods("01-01", "2025-06-01"), ...books.state.periods] };
  const post = (date: string, debit: string, credit: string, amount: number) =>
    expectOk(
      books.engine.createJournal(
        { date, memo: "FY 2025 activity", branch_id: null, lines: [{ account_id: debit, debit: amount, credit: 0 }, { account_id: credit, debit: 0, credit: amount }] },
        "POST",
      ),
    );
  post("2025-03-10", ACC.prepaid, ACC.sales, 1000);
  post("2025-11-20", ACC.rent, ACC.accrued, 300);
  return books;
};

describe("fiscalYearFor", () => {
  it("names calendar and split financial years", () => {
    expect(fiscalYearFor({ fiscal_year_start: "01-01" }, "2026-10-05")).toEqual({
      id: "fy_2026",
      name: "FY 2026",
      start_date: "2026-01-01",
      end_date: "2026-12-31",
    });
    expect(fiscalYearFor({ fiscal_year_start: "07-01" }, "2026-03-15")).toEqual({
      id: "fy_2025",
      name: "FY 2025/26",
      start_date: "2025-07-01",
      end_date: "2026-06-30",
    });
  });
});

describe("year-end close", () => {
  it("is blocked for a year that has not ended", () => {
    const books = demoBooks();
    const preview = yearEndPreview(books.state, "fy_2026")!;
    expect(preview.blockers[0]).toMatch(/It can be closed from/);
    expectFail(books.engine.closeFiscalYear("fy_2026"), /It can be closed from/);
  });

  it("previews P&L to retained earnings", () => {
    const books = withFy2025();
    const preview = yearEndPreview(books.state, "fy_2025")!;
    expect(preview.blockers).toEqual([]);
    expect(preview.net_income).toBe(700);
    expect(preview.lines).toEqual(
      expect.arrayContaining([
        { account_id: ACC.sales, debit: 1000, credit: 0 },
        { account_id: ACC.rent, debit: 0, credit: 300 },
        { account_id: ACC.retained, debit: 0, credit: 700 },
      ]),
    );
  });

  it("posts a YEAR_END journal, closes the periods and keeps the reports right", () => {
    const books = withFy2025();
    const { fiscal_year, journal } = expectOk(books.engine.closeFiscalYear("fy_2025"));
    expect(fiscal_year.status).toBe("CLOSED");
    expect(journal).toMatchObject({ date: "2025-12-31", source: { type: "YEAR_END", reference: "FY 2025" } });
    const s = books.state;
    expect(s.periods.filter((p) => p.start_date.startsWith("2025")).every((p) => p.status === "CLOSED")).toBe(true);

    expect(incomeStatement(s.accounts, s.journals, "2025-01-01", "2025-12-31").netIncome).toBe(700);
    const postClosing = trialBalance(s.accounts, s.journals, "2025-12-31").rows.filter((r) => ["REVENUE", "EXPENSE"].includes(r.account.type));
    expect(postClosing).toEqual([]);
    for (const asAt of ["2025-12-31", DEMO_TODAY]) expect(balanceSheet(s.accounts, s.journals, asAt).difference).toBe(0);

    expectFail(books.engine.reverseJournal(journal!.id, DEMO_TODAY, "Undo"), /reopening the year/);
    expectFail(books.engine.setPeriodStatus("per_2025_12", "OPEN"), /FY 2025 is closed/);
    expectFail(books.engine.createJournal({ date: "2025-12-15", memo: "Late", branch_id: null, lines: [{ account_id: ACC.rent, debit: 1, credit: 0 }, { account_id: ACC.accrued, debit: 0, credit: 1 }] }, "POST"), /closed/);
  });

  it("reopens by reversing the closing entry and locking the periods, and can close again", () => {
    const books = withFy2025();
    const { journal } = expectOk(books.engine.closeFiscalYear("fy_2025"));
    expectFail(books.engine.reopenFiscalYear("fy_2025", " "), /reason/);
    const view = expectOk(books.engine.reopenFiscalYear("fy_2025", "Audit adjustment"));
    expect(view.status).toBe("OPEN");
    const s = books.state;
    expect(s.journals.find((j) => j.id === journal!.id)?.status).toBe("REVERSED");
    expect(s.periods.filter((p) => p.start_date.startsWith("2025")).every((p) => p.status === "LOCKED")).toBe(true);
    expect(fiscalYearsView(s).find((y) => y.id === "fy_2025")?.closing_journal_id).toBeNull();

    const again = expectOk(books.engine.closeFiscalYear("fy_2025"));
    expect(again.fiscal_year.closing_journal_id).toBe(again.journal!.id);
    expect(balanceSheet(s.accounts, books.state.journals, DEMO_TODAY).difference).toBe(0);
  });

  it("closes years in order", () => {
    const books = withFy2025();
    books.ref.current = { ...books.state, periods: [...fiscalYearPeriods("01-01", "2024-06-01"), ...books.state.periods] };
    expectFail(books.engine.closeFiscalYear("fy_2025"), /Close FY 2024 first/);
  });

  it("opens next year's periods only within the lead time", () => {
    const books = demoBooks();
    const view = expectOk(books.engine.addFiscalYear());
    expect(view).toMatchObject({ id: "fy_2027", status: "OPEN", periods: { total: 12, open: 12 } });
    expectFail(books.engine.addFiscalYear(), /FY 2028 can be opened from/);
  });
});
