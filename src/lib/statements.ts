import type { CreditNote, Party, Payment, PurchaseBill, SalesInvoice, TaxCode } from "@/models/accounting";
import { isLivePayment } from "@/models/accounting";
import { ageingBucket, documentTotals, emptyAgeing, type AgeingBucket } from "@/lib/documents";
import { round2 } from "@/utils/format";

export type StatementEntryType = "INVOICE" | "BILL" | "RECEIPT" | "PAYMENT" | "CREDIT_NOTE" | "SUPPLIER_CREDIT";

export interface StatementEntry {
  date: string;
  type: StatementEntryType;
  number: string;
  /** The invoice or bill the entry belongs to. */
  document_id: string;
  description: string;
  /** Increases what is owed (invoice or bill). */
  charge: number;
  /** Reduces what is owed (receipt, payment or credit). */
  credit: number;
  /** Amount owed after this entry: by the customer, or to the supplier. */
  balance: number;
}

export interface PartyStatement {
  kind: "CUSTOMER" | "SUPPLIER";
  party_id: string;
  party_name: string;
  party_code: string;
  currency: string;
  /** Every currency the party has approved documents in; one statement per currency. */
  currencies: string[];
  from_date: string;
  to_date: string;
  opening_balance: number;
  entries: StatementEntry[];
  total_charges: number;
  total_credits: number;
  closing_balance: number;
  /** Outstanding at `to_date` by days past due. */
  ageing: Record<AgeingBucket, number> & { total: number };
  open_documents: { document_id: string; number: string; issue_date: string; due_date: string; total: number; outstanding: number; bucket: AgeingBucket }[];
}

interface StatementSource {
  customers: Party[];
  suppliers: Party[];
  invoices: SalesInvoice[];
  bills: PurchaseBill[];
  receipts: Payment[];
  supplierPayments: Payment[];
  creditNotes: CreditNote[];
  supplierCredits: CreditNote[];
  taxCodes: TaxCode[];
}

const ORDER: Record<StatementEntryType, number> = { INVOICE: 0, BILL: 0, CREDIT_NOTE: 1, SUPPLIER_CREDIT: 1, RECEIPT: 2, PAYMENT: 2 };

/**
 * Statement of account for one customer or supplier in one currency. Approved
 * documents count from their issue date; drafts and voided documents are left out.
 * Returns null when the party does not exist.
 */
export const partyStatement = (
  s: StatementSource,
  kind: "CUSTOMER" | "SUPPLIER",
  partyId: string,
  fromDate: string,
  toDate: string,
  currency?: string,
): PartyStatement | null => {
  const isCustomer = kind === "CUSTOMER";
  const party = (isCustomer ? s.customers : s.suppliers).find((p) => p.id === partyId);
  if (!party) return null;
  const allDocs: (SalesInvoice | PurchaseBill)[] = (isCustomer ? s.invoices : s.bills).filter(
    (d) => d.state === "APPROVED" && (isCustomer ? (d as SalesInvoice).customer_id : (d as PurchaseBill).supplier_id) === partyId,
  );
  const currencies = [...new Set(allDocs.map((d) => d.currency))].sort();
  const cur = currency || (currencies.includes(party.currency) ? party.currency : (currencies[0] ?? party.currency));
  const docs = allDocs.filter((d) => d.currency === cur);
  const docIds = new Set(docs.map((d) => d.id));
  const totals = new Map(docs.map((d) => [d.id, documentTotals(d.lines, s.taxCodes).total]));
  const numbers = new Map(docs.map((d) => [d.id, d.number]));

  const raw: Omit<StatementEntry, "balance">[] = [
    ...docs.map((d) => ({
      date: d.issue_date,
      type: (isCustomer ? "INVOICE" : "BILL") as StatementEntryType,
      number: d.number,
      document_id: d.id,
      description: isCustomer ? `Invoice, due ${d.due_date}` : `Bill ${(d as PurchaseBill).supplier_reference}, due ${d.due_date}`,
      charge: totals.get(d.id)!,
      credit: 0,
    })),
    ...(isCustomer ? s.receipts : s.supplierPayments)
      .filter((p) => isLivePayment(p) && docIds.has(p.document_id))
      .map((p) => ({
        date: p.date,
        type: (isCustomer ? "RECEIPT" : "PAYMENT") as StatementEntryType,
        number: p.number,
        document_id: p.document_id,
        description: `${isCustomer ? "Payment received" : "Payment made"} – ${numbers.get(p.document_id)}${p.reference ? ` (${p.reference})` : ""}`,
        charge: 0,
        credit: p.amount,
      })),
    ...(isCustomer ? s.creditNotes : s.supplierCredits)
      .filter((c) => c.state === "APPROVED" && docIds.has(c.document_id))
      .map((c) => ({
        date: c.date,
        type: (isCustomer ? "CREDIT_NOTE" : "SUPPLIER_CREDIT") as StatementEntryType,
        number: c.number,
        document_id: c.document_id,
        description: `Credit against ${numbers.get(c.document_id)} – ${c.reason}`,
        charge: 0,
        credit: documentTotals(c.lines, s.taxCodes).total,
      })),
  ].sort((a, b) => a.date.localeCompare(b.date) || ORDER[a.type] - ORDER[b.type] || a.number.localeCompare(b.number));

  const net = (e: { charge: number; credit: number }) => e.charge - e.credit;
  const opening = round2(raw.filter((e) => e.date < fromDate).reduce((t, e) => t + net(e), 0));
  let balance = opening;
  const entries: StatementEntry[] = raw
    .filter((e) => e.date >= fromDate && e.date <= toDate)
    .map((e) => {
      balance = round2(balance + net(e));
      return { ...e, balance };
    });

  const settledBy = new Map<string, number>();
  for (const e of raw) {
    if (e.credit && e.date <= toDate) settledBy.set(e.document_id, (settledBy.get(e.document_id) ?? 0) + e.credit);
  }
  const ageing = { ...emptyAgeing(), total: 0 };
  const openDocuments: PartyStatement["open_documents"] = [];
  for (const d of docs) {
    if (d.issue_date > toDate) continue;
    const outstanding = round2(totals.get(d.id)! - (settledBy.get(d.id) ?? 0));
    if (outstanding <= 0.005) continue;
    const bucket = ageingBucket(d.due_date, toDate);
    ageing[bucket] = round2(ageing[bucket] + outstanding);
    ageing.total = round2(ageing.total + outstanding);
    openDocuments.push({ document_id: d.id, number: d.number, issue_date: d.issue_date, due_date: d.due_date, total: totals.get(d.id)!, outstanding, bucket });
  }
  openDocuments.sort((a, b) => a.due_date.localeCompare(b.due_date));

  return {
    kind,
    party_id: party.id,
    party_name: party.name,
    party_code: party.code,
    currency: cur,
    currencies: currencies.length ? currencies : [cur],
    from_date: fromDate,
    to_date: toDate,
    opening_balance: opening,
    entries,
    total_charges: round2(entries.reduce((t, e) => t + e.charge, 0)),
    total_credits: round2(entries.reduce((t, e) => t + e.credit, 0)),
    closing_balance: round2(balance),
    ageing,
    open_documents: openDocuments,
  };
};
