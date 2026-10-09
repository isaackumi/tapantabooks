import { describe, expect, it } from "vitest";
import { resolveHandler } from "@/mock/api/routes";
import type { Pagination } from "@/core/apiClient";
import type { AgeingReport } from "@/models/reports";
import type {
  DocumentStatistics,
  InvoiceListItem,
  JournalListItem,
  JournalStatistics,
  PaymentListData,
  PaymentStatistics,
} from "@/models/lists";
import { DEMO_TODAY } from "@/utils/dates";
import { demoBooks } from "./helpers";

const books = demoBooks();
const call = <T>(path: string, query: Record<string, string> = {}) => {
  const handler = resolveHandler("GET", path);
  if (!handler) throw new Error(`No handler for ${path}`);
  const res = handler({ state: books.state, engine: books.engine, q: new URLSearchParams(query), body: null, userId: books.state.currentUserId });
  return { data: res.data as T, pagination: res.pagination as Pagination };
};
const sum = (xs: number[]) => Math.round(xs.reduce((t, v) => t + v, 0) * 100) / 100;

describe("list paging", () => {
  it("caps the page size at 100 and reports the full total", () => {
    const { data, pagination } = call<{ items: JournalListItem[] }>("/journals/list", { size: "500" });
    expect(pagination.size).toBe(100);
    expect(data.items.length).toBeLessThanOrEqual(100);
    expect(pagination.total).toBe(books.state.journals.length);
    expect(pagination.has_next).toBe(pagination.total > 100);
  });

  it("returns journals newest first with their debit total", () => {
    const { data } = call<{ items: JournalListItem[] }>("/journals/list", { size: "50" });
    const dates = data.items.map((j) => j.date);
    expect(dates).toEqual([...dates].sort().reverse());
    for (const j of data.items) expect(j.total).toBeCloseTo(sum(j.lines.map((l) => l.debit)), 2);
  });

  it("filters audit events by the date part of occurred_at before paging", () => {
    const day = books.state.auditEvents[0].occurred_at.slice(0, 10);
    const expected = books.state.auditEvents.filter((e) => e.occurred_at.slice(0, 10) === day).length;
    const { data, pagination } = call<{ items: { occurred_at: string }[] }>("/audit-logs/list", { from_date: day, to_date: day, size: "1" });
    expect(pagination.total).toBe(expected);
    expect(data.items.every((e) => e.occurred_at.startsWith(day))).toBe(true);
  });
});

describe("GET /invoices/list", () => {
  it("filters by derived status and searches by customer name", () => {
    const overdue = call<{ items: InvoiceListItem[] }>("/invoices/list", { status: "OVERDUE", size: "100" }).data.items;
    expect(overdue.length).toBeGreaterThan(0);
    for (const d of overdue) {
      expect(d.status).toBe("OVERDUE");
      expect(d.days_overdue).toBeGreaterThan(0);
    }
    const name = overdue[0].party_name;
    const found = call<{ items: InvoiceListItem[] }>("/invoices/list", { search: name.slice(0, 6).toLowerCase(), size: "100" }).data.items;
    expect(found.some((d) => d.party_name === name)).toBe(true);
  });

  it("sorts by balance due on the server", () => {
    const items = call<{ items: InvoiceListItem[] }>("/invoices/list", { sort_by: "outstanding_base", sort_order: "desc", size: "20" }).data.items;
    const values = items.map((d) => d.outstanding_base);
    expect(values).toEqual([...values].sort((a, b) => b - a));
  });

  it("filters by custom field with cf_<key>", () => {
    const withValue = books.state.invoices.find((d) => Object.keys(d.custom_fields ?? {}).length > 0);
    expect(withValue).toBeDefined();
    const [key, value] = Object.entries(withValue!.custom_fields!)[0];
    const items = call<{ items: InvoiceListItem[] }>("/invoices/list", { [`cf_${key}`]: value, size: "100" }).data.items;
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((d) => d.custom_fields?.[key] === value)).toBe(true);
  });
});

describe("list statistics", () => {
  it("invoice statistics agree with the list and the receivables ageing", () => {
    const st = call<DocumentStatistics>("/invoices/statistics").data;
    const { status_counts: counts } = st;
    expect(counts.DRAFT + counts.OPEN + counts.PARTIALLY_PAID + counts.OVERDUE + counts.PAID + counts.VOID).toBe(counts.ALL);
    expect(call("/invoices/list", { status: "OVERDUE" }).pagination.total).toBe(counts.OVERDUE);
    const ar = call<AgeingReport>("/reports/ar-ageing", { as_at: DEMO_TODAY }).data;
    expect(st.outstanding).toBeCloseTo(ar.totals.total, 2);
  });

  it("journal statistics count every entry once", () => {
    const st = call<JournalStatistics>("/journals/statistics").data;
    const c = st.status_counts;
    expect(c.DRAFT + c.PENDING_APPROVAL + c.POSTED + c.REVERSED).toBe(c.ALL);
    expect(c.ALL).toBe(books.state.journals.length);
  });

  it("payment list totals cover every matching row and match the statistics", () => {
    const st = call<PaymentStatistics>("/receipts/statistics").data;
    const month = st.this_month.month;
    const { data, pagination } = call<PaymentListData>("/receipts/list", { from_date: `${month}-01`, to_date: DEMO_TODAY, size: "1" });
    expect(data.items).toHaveLength(Math.min(1, pagination.total));
    expect(data.totals.count).toBe(st.this_month.count);
    expect(data.totals.base_amount).toBeCloseTo(st.this_month.total, 2);
    expect(st.months[0] >= st.months.at(-1)!).toBe(true);
  });
});
