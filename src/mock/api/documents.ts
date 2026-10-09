import type { CreditNote, DocumentDisplayStatus, Party, PurchaseBill, SalesInvoice } from "@/models/accounting";
import type {
  CreditListItem,
  CreditStatistics,
  CurrencyExposure,
  DocumentDetail,
  DocumentListFields,
  PartyBalance,
  PartyBalances,
  PaymentListItem,
} from "@/models/lists";
import { displayStatus, documentTotals, type DocumentTotals } from "@/lib/documents";
import { fiscalYearFor } from "@/lib/fiscalYears";
import { toBase } from "@/lib/fx";
import { daysBetween, todayIso } from "@/utils/dates";
import { round2 } from "@/utils/format";
import type { LedgerState } from "./engine";
import { found } from "./http";

export interface DocumentRow<T> {
  doc: T;
  party: Party | undefined;
  /** In the document currency. */
  totals: DocumentTotals;
  status: DocumentDisplayStatus;
  /** Base currency at the document rate; every total, ageing and report uses this. */
  outstanding: number;
  /** In the document currency. */
  outstanding_fc: number;
  total_base: number;
  currency: string;
}

const money = (
  doc: { state: string; currency: string; exchange_rate: number; amount_paid: number; amount_paid_base: number },
  totals: DocumentTotals,
) => {
  const open = doc.state === "APPROVED";
  const total_base = toBase(totals.total, doc.exchange_rate);
  return {
    total_base,
    currency: doc.currency,
    outstanding: open ? round2(total_base - doc.amount_paid_base) : 0,
    outstanding_fc: open ? round2(totals.total - doc.amount_paid) : 0,
  };
};

const rows = <T extends SalesInvoice | PurchaseBill>(s: LedgerState, docs: T[], parties: Party[], partyOf: (d: T) => string): DocumentRow<T>[] => {
  const byId = new Map(parties.map((p) => [p.id, p]));
  const today = todayIso();
  return docs
    .map((doc) => {
      const totals = documentTotals(doc.lines, s.taxCodes);
      return { doc, party: byId.get(partyOf(doc)), totals, status: displayStatus(doc, totals.total, today), ...money(doc, totals) };
    })
    .sort((a, b) => b.doc.issue_date.localeCompare(a.doc.issue_date) || b.doc.number.localeCompare(a.doc.number));
};

export const invoiceRows = (s: LedgerState) => rows(s, s.invoices, s.customers, (d) => d.customer_id);
export const billRows = (s: LedgerState) => rows(s, s.bills, s.suppliers, (d) => d.supplier_id);

export const documentItems = <T extends SalesInvoice | PurchaseBill>(docRows: DocumentRow<T>[]): (T & DocumentListFields)[] =>
  docRows.map((r) => ({
    ...r.doc,
    party_code: r.party?.code ?? "",
    party_name: r.party?.name ?? "",
    status: r.status,
    days_overdue: r.status === "OVERDUE" ? Math.max(0, daysBetween(r.doc.due_date, todayIso())) : 0,
    subtotal: r.totals.subtotal,
    tax: r.totals.tax,
    total: r.totals.total,
    outstanding: r.outstanding_fc,
    total_base: r.total_base,
    outstanding_base: r.outstanding,
  }));

export const paymentItems = (state: LedgerState, kind: "receipt" | "payment"): PaymentListItem[] => {
  const isReceipt = kind === "receipt";
  const parties = new Map((isReceipt ? state.customers : state.suppliers).map((p) => [p.id, p.name]));
  const docs = new Map<string, string>((isReceipt ? state.invoices : state.bills).map((d) => [d.id, d.number]));
  const banks = new Map(state.bankAccounts.map((b) => [b.id, b.name]));
  return (isReceipt ? state.receipts : state.supplierPayments).map((p) => ({
    ...p,
    party_name: parties.get(p.party_id) ?? "",
    document_number: docs.get(p.document_id) ?? "",
    bank_account_name: banks.get(p.bank_account_id) ?? "",
  }));
};

const journalNumbers = (state: LedgerState) => new Map(state.journals.map((j) => [j.id, j.number]));

export const creditItems = (state: LedgerState, kind: "customer" | "supplier"): CreditListItem[] => {
  const isCustomer = kind === "customer";
  const parties = new Map((isCustomer ? state.customers : state.suppliers).map((p) => [p.id, p.name]));
  const docs = new Map<string, string>((isCustomer ? state.invoices : state.bills).map((d) => [d.id, d.number]));
  const journals = journalNumbers(state);
  return (isCustomer ? state.creditNotes : state.supplierCredits).map((c: CreditNote) => {
    const t = documentTotals(c.lines, state.taxCodes);
    return {
      ...c,
      party_name: parties.get(c.party_id) ?? "",
      document_number: docs.get(c.document_id) ?? "",
      subtotal: t.subtotal,
      tax: t.tax,
      total: t.total,
      journal_number: c.journal_id ? (journals.get(c.journal_id) ?? null) : null,
    };
  });
};

export const creditStatistics = (state: LedgerState, kind: "customer" | "supplier"): CreditStatistics => {
  const today = todayIso();
  const month = today.slice(0, 7);
  const fyStart = fiscalYearFor(state.org, today).start_date;
  const items = creditItems(state, kind);
  const live = items.filter((c) => c.state === "APPROVED" && c.date <= today);
  const sum = (rs: CreditListItem[]) => round2(rs.reduce((t, c) => t + c.base_amount, 0));
  const ytd = live.filter((c) => c.date >= fyStart);
  const thisMonth = live.filter((c) => c.date.startsWith(month));
  return {
    as_at: today,
    this_month: { month, total: sum(thisMonth), count: thisMonth.length },
    year_to_date: {
      from_date: fyStart,
      total: sum(ytd),
      count: ytd.length,
      tax: round2(ytd.reduce((t, c) => t + toBase(c.tax, c.exchange_rate), 0)),
    },
    state_counts: {
      ALL: items.length,
      APPROVED: items.filter((c) => c.state === "APPROVED").length,
      VOID: items.filter((c) => c.state === "VOID").length,
    },
  };
};

export const documentDetail = (state: LedgerState, kind: "invoice" | "bill", id: string): DocumentDetail => {
  const isInvoice = kind === "invoice";
  const docRows: DocumentRow<SalesInvoice | PurchaseBill>[] = isInvoice ? invoiceRows(state) : billRows(state);
  const row = found(
    docRows.find((r) => r.doc.id === id),
    isInvoice ? "Invoice" : "Bill",
  );
  const [item] = documentItems([row]);
  const byDate = <T extends { date: string; number: string }>(a: T, b: T) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number);
  const payments = paymentItems(state, isInvoice ? "receipt" : "payment")
    .filter((p) => p.document_id === id)
    .sort(byDate);
  return {
    ...item,
    tax_by_code: row.totals.taxByCode,
    journal_number: item.journal_id ? (journalNumbers(state).get(item.journal_id) ?? null) : null,
    payments,
    credits: creditItems(state, isInvoice ? "customer" : "supplier")
      .filter((c) => c.document_id === id)
      .sort(byDate),
    realised_fx: round2(payments.reduce((t, p) => t + p.fx_gain_loss, 0)),
  };
};

export const partyBalances = (state: LedgerState, kind: "customer" | "supplier"): PartyBalances => {
  const docRows: DocumentRow<SalesInvoice | PurchaseBill>[] = kind === "customer" ? invoiceRows(state) : billRows(state);
  const base = state.org.base_currency;
  const map = new Map<string, PartyBalance>();
  for (const r of docRows) {
    if (r.outstanding <= 0 || !r.party) continue;
    const b = map.get(r.party.id) ?? { party_id: r.party.id, outstanding: 0, overdue: 0, open_count: 0, outstanding_fc: 0 };
    b.outstanding = round2(b.outstanding + r.outstanding);
    if (r.status === "OVERDUE") b.overdue = round2(b.overdue + r.outstanding);
    b.open_count += 1;
    if (r.currency !== base && r.currency === r.party.currency) b.outstanding_fc = round2(b.outstanding_fc + r.outstanding_fc);
    map.set(r.party.id, b);
  }
  const items = [...map.values()].sort((a, b) => b.outstanding - a.outstanding);
  return {
    as_at: todayIso(),
    items,
    totals: {
      outstanding: round2(items.reduce((t, b) => t + b.outstanding, 0)),
      overdue: round2(items.reduce((t, b) => t + b.overdue, 0)),
      with_balance_count: items.length,
      overdue_count: items.filter((b) => b.overdue > 0).length,
    },
  };
};

export const currencyExposure = (state: LedgerState): CurrencyExposure => {
  const base = state.org.base_currency;
  const map = new Map<string, CurrencyExposure["items"][number]>();
  const add = (r: DocumentRow<unknown>, side: "receivable" | "payable") => {
    if (r.currency === base || r.outstanding_fc <= 0) return;
    const e = map.get(r.currency) ?? { currency: r.currency, open_documents: 0, receivable: 0, payable: 0 };
    e.open_documents += 1;
    e[side] = round2(e[side] + r.outstanding_fc);
    map.set(r.currency, e);
  };
  invoiceRows(state).forEach((r) => add(r, "receivable"));
  billRows(state).forEach((r) => add(r, "payable"));
  return { as_at: todayIso(), items: [...map.values()].sort((a, b) => a.currency.localeCompare(b.currency)) };
};
