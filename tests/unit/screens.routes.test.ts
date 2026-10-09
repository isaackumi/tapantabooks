import { describe, expect, it } from "vitest";
import { resolveHandler } from "@/mock/api/routes";
import type { Pagination } from "@/core/apiClient";
import type {
  AccountBalances,
  AgeingReport,
  CustomFieldUsage,
  DashboardStatistics,
  PeriodStatistics,
  ReportsSummary,
} from "@/models/reports";
import type { JournalListItem } from "@/models/lists";
import { affectsLedger } from "@/lib/ledger";
import { DEMO_TODAY } from "@/utils/dates";
import { demoBooks } from "./helpers";

const books = demoBooks();
const call = <T>(path: string, query: Record<string, string> = {}) => {
  const handler = resolveHandler("GET", path);
  if (!handler) throw new Error(`No handler for ${path}`);
  const res = handler({ state: books.state, engine: books.engine, q: new URLSearchParams(query), body: null, userId: books.state.currentUserId });
  return { data: res.data as T, pagination: res.pagination as Pagination };
};

describe("GET /reports/summary", () => {
  it("agrees with the balance sheet, trial balance and ageing reports", () => {
    const s = call<ReportsSummary>("/reports/summary", { as_at: DEMO_TODAY }).data;
    const bs = call<{ total_assets: number }>("/reports/balance-sheet", { as_at: DEMO_TODAY }).data;
    const tb = call<{ totals: { debit: number } }>("/reports/trial-balance", { as_at: DEMO_TODAY }).data;
    const ar = call<AgeingReport>("/reports/ar-ageing", { as_at: DEMO_TODAY }).data;
    const ap = call<AgeingReport>("/reports/ap-ageing", { as_at: DEMO_TODAY }).data;
    expect(s.total_assets).toBeCloseTo(bs.total_assets, 2);
    expect(s.trial_balance_total).toBeCloseTo(tb.totals.debit, 2);
    expect(s.receivables).toBeCloseTo(ar.totals.total, 2);
    expect(s.payables).toBeCloseTo(ap.totals.total, 2);
    expect(s.from_date <= s.as_at).toBe(true);
  });
});

describe("GET /accounts/balances", () => {
  it("returns every account, with group balances equal to the sum of their children", () => {
    const { items } = call<AccountBalances>("/accounts/balances", { as_at: DEMO_TODAY }).data;
    expect(items).toHaveLength(books.state.accounts.length);
    const byId = new Map(items.map((b) => [b.account_id, b.balance]));
    const group = books.state.accounts.find((a) => a.is_group && books.state.accounts.some((c) => c.parent_id === a.id))!;
    const children = books.state.accounts.filter((c) => c.parent_id === group.id);
    expect(byId.get(group.id)).toBeCloseTo(children.reduce((t, c) => t + (byId.get(c.id) ?? 0), 0), 2);
    const posted = new Set(books.state.journals.filter(affectsLedger).flatMap((j) => j.lines.map((l) => l.account_id)));
    for (const b of items) expect(b.has_postings).toBe(posted.has(b.account_id));
  });
});

describe("GET /fiscal-periods/statistics", () => {
  it("counts each ledger journal in exactly one period", () => {
    const { items } = call<{ items: PeriodStatistics[] }>("/fiscal-periods/statistics").data;
    expect(items).toHaveLength(books.state.periods.length);
    const first = books.state.periods[0].start_date;
    const last = books.state.periods.at(-1)!.end_date;
    const inRange = books.state.journals.filter((j) => affectsLedger(j) && j.date >= first && j.date <= last);
    expect(items.reduce((t, s) => t + s.posted_count, 0)).toBe(inRange.length);
  });
});

describe("GET /custom-fields/usage", () => {
  it("counts records holding a value for each field", () => {
    const { items } = call<{ items: CustomFieldUsage[] }>("/custom-fields/usage").data;
    expect(items).toHaveLength(books.state.customFields.length);
    const invoiceField = books.state.customFields.find((f) => f.entity === "Invoice")!;
    const expected = books.state.invoices.filter((d) => (d.custom_fields?.[invoiceField.key] ?? "") !== "").length;
    expect(items.find((u) => u.custom_field_id === invoiceField.id)?.record_count).toBe(expected);
  });
});

describe("work-queue counts", () => {
  it("dashboard statistics count imports needing review", () => {
    const s = call<DashboardStatistics>("/dashboard/statistics", { as_at: DEMO_TODAY }).data;
    const expected = books.state.importBatches.filter((b) => b.status === "NEEDS_REVIEW" || b.status === "FAILED").length;
    expect(s.imports_needing_review).toBe(expected);
  });

  it("journals can be filtered to those touching one account", () => {
    const accountId = books.state.bankAccounts[0].gl_account_id;
    const { data, pagination } = call<{ items: JournalListItem[] }>("/journals/list", { account_id: accountId, size: "100" });
    expect(pagination.total).toBe(books.state.journals.filter((j) => j.lines.some((l) => l.account_id === accountId)).length);
    expect(data.items.every((j) => j.lines.some((l) => l.account_id === accountId))).toBe(true);
  });
});
