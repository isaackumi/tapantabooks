import { describe, expect, it } from "vitest";
import { ApiFault, resolveHandler } from "@/mock/api/routes";
import type { AgeingReport, BalanceSheetReport, DashboardStatistics, IncomeStatementReport, MonthlyTrendReport } from "@/models/reports";
import { DEMO_TODAY, endOfMonth } from "@/utils/dates";
import { demoBooks } from "./helpers";

const get = <T>(path: string, query: Record<string, string> = {}): T => {
  const books = demoBooks();
  const handler = resolveHandler("GET", path);
  if (!handler) throw new Error(`No handler for ${path}`);
  const res = handler({ state: books.state, engine: books.engine, q: new URLSearchParams(query), body: null, userId: books.state.currentUserId });
  return res.data as T;
};

const sum = (xs: number[]) => Math.round(xs.reduce((t, v) => t + v, 0) * 100) / 100;

describe("GET /reports/monthly-trend", () => {
  it("defaults to the twelve months ending this month", () => {
    const t = get<MonthlyTrendReport>("/reports/monthly-trend");
    expect(t.to_date).toBe(DEMO_TODAY);
    expect(t.months).toHaveLength(12);
    expect(t.months.at(-1)!.month).toBe(DEMO_TODAY.slice(0, 7));
  });

  it("agrees with the income statement for a month and with the dashboard cash balance", () => {
    const t = get<MonthlyTrendReport>("/reports/monthly-trend", { from_date: "2026-01-01", to_date: DEMO_TODAY });
    const sep = t.months.find((m) => m.month === "2026-09")!;
    const is = get<IncomeStatementReport>("/reports/income-statement", { from_date: "2026-09-01", to_date: endOfMonth("2026-09") });
    expect(sep.revenue).toBeCloseTo(is.total_revenue, 2);
    expect(sep.net_income).toBeCloseTo(is.net_income, 2);

    const stats = get<DashboardStatistics>("/dashboard/statistics", { as_at: DEMO_TODAY });
    expect(t.months.at(-1)!.closing_cash).toBeCloseTo(stats.cash_balance, 2);
  });

  it("rejects an inverted or over-long range", () => {
    expect(() => get("/reports/monthly-trend", { from_date: "2026-10-01", to_date: "2026-09-30" })).toThrow(ApiFault);
    expect(() => get("/reports/monthly-trend", { from_date: "2024-01-01", to_date: DEMO_TODAY })).toThrow(/at most 24 months/);
  });
});

describe("GET /reports/ar-ageing", () => {
  it("lists the documents behind every party total", () => {
    const a = get<AgeingReport>("/reports/ar-ageing", { as_at: DEMO_TODAY });
    expect(a.rows.length).toBeGreaterThan(0);
    for (const row of a.rows) {
      expect(row.party_code).not.toBe("");
      expect(sum(row.documents.map((d) => d.outstanding))).toBeCloseTo(row.total, 2);
      for (const d of row.documents) expect(d.days_overdue).toBeGreaterThanOrEqual(0);
    }
    expect(sum(a.rows.map((r) => r.total))).toBeCloseTo(a.totals.total, 2);
  });

  it("leaves out documents issued after the as-at date", () => {
    const asAt = "2026-08-31";
    const a = get<AgeingReport>("/reports/ar-ageing", { as_at: asAt });
    const docs = a.rows.flatMap((r) => r.documents);
    expect(docs.every((d) => d.issue_date <= asAt)).toBe(true);
    const now = get<AgeingReport>("/reports/ar-ageing", { as_at: DEMO_TODAY });
    expect(now.rows.flatMap((r) => r.documents).length).toBeGreaterThan(docs.length);
  });
});

describe("GET /dashboard/statistics", () => {
  it("matches the reports it summarises", () => {
    const stats = get<DashboardStatistics>("/dashboard/statistics", { as_at: DEMO_TODAY });
    const ytd = get<IncomeStatementReport>("/reports/income-statement", { from_date: "2026-01-01", to_date: DEMO_TODAY });
    expect(stats.revenue_ytd).toBeCloseTo(ytd.total_revenue, 2);
    expect(stats.net_income_ytd).toBeCloseTo(ytd.net_income, 2);

    const ar = get<AgeingReport>("/reports/ar-ageing", { as_at: DEMO_TODAY });
    expect(stats.receivables).toBeCloseTo(ar.totals.total, 2);
    expect(stats.payables_due_7_days).toBeLessThanOrEqual(stats.payables);
    expect(stats.draft_journals).toBeGreaterThanOrEqual(0);
  });
});

describe("GET /reports/balance-sheet", () => {
  it("returns section totals that add up to the statement totals", () => {
    const bs = get<BalanceSheetReport>("/reports/balance-sheet", { as_at: DEMO_TODAY });
    expect(bs.total_current_assets + bs.total_fixed_assets).toBeCloseTo(bs.total_assets, 2);
    expect(bs.total_current_liabilities + bs.total_long_term_liabilities).toBeCloseTo(bs.total_liabilities, 2);
    expect(bs.total_liabilities_and_equity).toBeCloseTo(bs.total_assets, 2);
  });
});
