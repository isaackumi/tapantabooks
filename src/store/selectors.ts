import type {
  Account,
  DocumentDisplayStatus,
  Party,
  PurchaseBill,
  SalesInvoice,
} from "@/models/accounting";
import { documentTotals, displayStatus, type DocumentTotals } from "@/lib/documents";
import { balancesByAccount } from "@/lib/ledger";
import { toBase } from "@/lib/fx";
import { round2 } from "@/utils/format";
import { todayIso } from "@/utils/dates";
import type { LedgerState } from "./ledgerStore";

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

export const invoiceRows = (s: LedgerState): DocumentRow<SalesInvoice>[] => {
  const parties = new Map(s.customers.map((c) => [c.id, c]));
  return s.invoices
    .map((doc) => {
      const totals = documentTotals(doc.lines, s.taxCodes);
      const status = displayStatus(doc, totals.total, todayIso());
      return {
        doc,
        party: parties.get(doc.customer_id),
        totals,
        status,
        ...money(doc, totals),
      };
    })
    .sort((a, b) => b.doc.issue_date.localeCompare(a.doc.issue_date) || b.doc.number.localeCompare(a.doc.number));
};

export const billRows = (s: LedgerState): DocumentRow<PurchaseBill>[] => {
  const parties = new Map(s.suppliers.map((c) => [c.id, c]));
  return s.bills
    .map((doc) => {
      const totals = documentTotals(doc.lines, s.taxCodes);
      const status = displayStatus(doc, totals.total, todayIso());
      return {
        doc,
        party: parties.get(doc.supplier_id),
        totals,
        status,
        ...money(doc, totals),
      };
    })
    .sort((a, b) => b.doc.issue_date.localeCompare(a.doc.issue_date) || b.doc.number.localeCompare(a.doc.number));
};

export const outstandingByParty = <T>(rows: DocumentRow<T>[], partyOf: (doc: T) => string) => {
  const map = new Map<string, { outstanding: number; overdue: number; open: number }>();
  for (const r of rows) {
    if (r.outstanding <= 0) continue;
    const id = partyOf(r.doc);
    const m = map.get(id) ?? { outstanding: 0, overdue: 0, open: 0 };
    m.outstanding = round2(m.outstanding + r.outstanding);
    if (r.status === "OVERDUE") m.overdue = round2(m.overdue + r.outstanding);
    m.open += 1;
    map.set(id, m);
  }
  return map;
};

export const accountMap = (s: LedgerState) => new Map(s.accounts.map((a) => [a.id, a]));

export const postableAccounts = (s: LedgerState, opts: { includeControl?: boolean } = {}) =>
  s.accounts
    .filter((a) => !a.is_group && a.is_active && (opts.includeControl || !a.is_control))
    .sort((a, b) => a.code.localeCompare(b.code));

export const accountLabel = (a: Account | undefined) => (a ? `${a.code} · ${a.name}` : "—");

/** Ledger balance of each bank account in base currency. */
export const bankBaseBalances = (s: LedgerState) => {
  const balances = balancesByAccount(s.accounts, s.journals);
  return new Map(s.bankAccounts.map((b) => [b.id, balances.get(b.gl_account_id) ?? 0]));
};

export const dimensionsOf = (s: LedgerState, kind: string) =>
  s.dimensions.filter((d) => d.kind === kind && d.is_active);

export const dimensionName = (s: LedgerState, id: string | null | undefined) =>
  s.dimensions.find((d) => d.id === id)?.name ?? "—";
