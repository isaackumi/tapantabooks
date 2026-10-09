import { describe, expect, it } from "vitest";
import { resolveHandler } from "@/mock/api/routes";
import { ApiFault } from "@/mock/api/http";
import type { Pagination } from "@/core/apiClient";
import type {
  AuditStatistics,
  CreditListItem,
  CreditStatistics,
  CurrencyExposure,
  DocumentDetail,
  DocumentListItem,
  ImportListItem,
  ImportReferenceCheck,
  ImportStatistics,
  PartyBalances,
} from "@/models/lists";
import type { AuditEvent } from "@/models/accounting";
import { fiscalYearFor } from "@/lib/fiscalYears";
import { todayIso } from "@/utils/dates";
import { demoBooks } from "./helpers";

const books = demoBooks();
const call = <T>(method: "GET" | "POST", path: string, query: Record<string, string> = {}, body: unknown = null) => {
  const handler = resolveHandler(method, path);
  if (!handler) throw new Error(`No handler for ${method} ${path}`);
  const res = handler({ state: books.state, engine: books.engine, q: new URLSearchParams(query), body, userId: books.state.currentUserId });
  return { data: res.data as T, pagination: res.pagination as Pagination };
};
const get = <T>(path: string, query: Record<string, string> = {}) => call<T>("GET", path, query);
const all = <T>(path: string, query: Record<string, string> = {}) => get<{ items: T[] }>(path, { ...query, size: "100" });
const sum = (xs: number[]) => Math.round(xs.reduce((t, v) => t + v, 0) * 100) / 100;

describe("document lists: open filter", () => {
  it("keeps only invoices and bills with something still owed", () => {
    for (const path of ["/invoices/list", "/bills/list"]) {
      const everything = all<DocumentListItem>(path).data.items;
      const open = all<DocumentListItem>(path, { open: "true" });
      expect(open.data.items.every((d) => d.outstanding_base > 0)).toBe(true);
      expect(open.pagination.total).toBe(everything.filter((d) => d.outstanding_base > 0).length);
    }
  });
});

describe("GET /invoices/get and /bills/get", () => {
  it("returns list fields with the document's payments, credits and journal number", () => {
    const paid = books.state.invoices.find((d) => books.state.receipts.some((r) => r.document_id === d.id))!;
    const detail = get<DocumentDetail>("/invoices/get", { invoice_id: paid.id }).data;
    const listed = all<DocumentListItem>("/invoices/list", { search: paid.number }).data.items.find((d) => d.id === paid.id)!;
    expect(detail.total).toBe(listed.total);
    expect(detail.outstanding_base).toBe(listed.outstanding_base);
    expect(detail.payments.map((p) => p.id).sort()).toEqual(books.state.receipts.filter((r) => r.document_id === paid.id).map((r) => r.id).sort());
    expect(detail.realised_fx).toBeCloseTo(sum(detail.payments.map((p) => p.fx_gain_loss)), 2);
    expect(detail.journal_number).toBe(books.state.journals.find((j) => j.id === paid.journal_id)?.number ?? null);
    expect(sum(detail.tax_by_code.map((t) => t.amount))).toBeCloseTo(detail.tax, 2);
  });

  it("answers 404 for an unknown document", () => {
    expect(() => get("/bills/get", { bill_id: "nope" })).toThrow(ApiFault);
  });
});

describe("credit notes", () => {
  it("lists credits with party, document and totals", () => {
    for (const [path, kind] of [
      ["/credit-notes/list", "creditNotes"],
      ["/supplier-credits/list", "supplierCredits"],
    ] as const) {
      const res = all<CreditListItem>(path);
      expect(res.pagination.total).toBe(books.state[kind].length);
      for (const c of res.data.items) {
        expect(c.total).toBeCloseTo(c.subtotal + c.tax, 2);
        expect(c.document_number).not.toBe("");
      }
    }
  });

  it("totals live credits for the month and financial year to date", () => {
    const today = todayIso();
    const fyStart = fiscalYearFor(books.state.org, today).start_date;
    const st = get<CreditStatistics>("/credit-notes/statistics").data;
    const live = books.state.creditNotes.filter((c) => c.state === "APPROVED" && c.date <= today);
    expect(st.year_to_date.from_date).toBe(fyStart);
    expect(st.year_to_date.total).toBeCloseTo(sum(live.filter((c) => c.date >= fyStart).map((c) => c.base_amount)), 2);
    expect(st.this_month.count).toBe(live.filter((c) => c.date.startsWith(today.slice(0, 7))).length);
    expect(st.state_counts.ALL).toBe(books.state.creditNotes.length);
    expect(st.state_counts.APPROVED + st.state_counts.VOID).toBe(st.state_counts.ALL);
  });
});

describe("party balances", () => {
  it("adds up each party's open documents in base currency", () => {
    const res = get<PartyBalances>("/customers/balances").data;
    const open = all<DocumentListItem>("/invoices/list", { open: "true" }).data.items as (DocumentListItem & { customer_id: string })[];
    for (const b of res.items) {
      const mine = open.filter((d) => d.customer_id === b.party_id);
      expect(b.outstanding).toBeCloseTo(sum(mine.map((d) => d.outstanding_base)), 2);
      expect(b.open_count).toBe(mine.length);
      expect(b.overdue).toBeCloseTo(sum(mine.filter((d) => d.status === "OVERDUE").map((d) => d.outstanding_base)), 2);
    }
    expect(res.totals.outstanding).toBeCloseTo(sum(open.map((d) => d.outstanding_base)), 2);
    expect(res.totals.with_balance_count).toBe(res.items.length);
  });
});

describe("GET /currencies/exposure", () => {
  it("sums open foreign-currency documents in their own currency", () => {
    const res = get<CurrencyExposure>("/currencies/exposure").data;
    const base = books.state.org.base_currency;
    const invoices = all<DocumentListItem>("/invoices/list", { open: "true" }).data.items.filter((d) => d.currency !== base);
    const bills = all<DocumentListItem>("/bills/list", { open: "true" }).data.items.filter((d) => d.currency !== base);
    for (const e of res.items) {
      expect(e.currency).not.toBe(base);
      expect(e.receivable).toBeCloseTo(sum(invoices.filter((d) => d.currency === e.currency).map((d) => d.outstanding)), 2);
      expect(e.payable).toBeCloseTo(sum(bills.filter((d) => d.currency === e.currency).map((d) => d.outstanding)), 2);
    }
    expect(sum(res.items.map((e) => e.open_documents))).toBe(invoices.length + bills.length);
  });
});

describe("imports", () => {
  it("counts rows per batch and filters batches needing attention", () => {
    const st = get<ImportStatistics>("/imports/statistics").data;
    const items = all<ImportListItem>("/imports/list").data.items;
    expect(st.batch_count).toBe(books.state.importBatches.length);
    expect(st.row_count).toBe(sum(items.map((b) => b.row_count)));
    const attention = all<ImportListItem>("/imports/list", { attention: "true" });
    expect(attention.pagination.total).toBe(st.status_counts.ATTENTION);
    expect(attention.data.items.every((b) => ["NEEDS_REVIEW", "FAILED", "PARTIALLY_POSTED"].includes(b.status))).toBe(true);
  });

  it("reports references earlier batches already imported, case-insensitively", () => {
    const batch = books.state.importBatches.find((b) => b.records.length > 0)!;
    const ref = batch.records[0].external_reference;
    const res = call<ImportReferenceCheck>("POST", "/imports/check-references", {}, { references: [ref.toUpperCase(), "never-imported-ref"] }).data;
    expect(res.items).toHaveLength(1);
    expect(res.items[0].reference).toBe(ref.toUpperCase());
    expect(res.items[0].batch_number).toMatch(/^IMP-/);
    expect(() => call("POST", "/imports/check-references", {}, { references: "x" })).toThrow(ApiFault);
  });
});

describe("audit trail", () => {
  it("counts events by channel and filters by actor name", () => {
    const st = get<AuditStatistics>("/audit-logs/statistics").data;
    expect(st.total).toBe(books.state.auditEvents.length);
    expect(st.by_actor_type.USER + st.by_actor_type.SYSTEM + st.by_actor_type.INTEGRATION).toBe(st.total);
    const actor = st.actor_names[0];
    const res = get<{ items: AuditEvent[] }>("/audit-logs/list", { actor_name: actor, size: "100" });
    expect(res.pagination.total).toBe(books.state.auditEvents.filter((e) => e.actor_name === actor).length);
    expect(res.data.items.every((e) => e.actor_name === actor)).toBe(true);
  });
});
