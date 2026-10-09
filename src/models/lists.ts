import type { DocumentDisplayStatus, JournalEntry, JournalStatus, Payment, PurchaseBill, SalesInvoice } from "./accounting";

/** A journal as listed: the stored entry plus its debit total. */
export type JournalListItem = JournalEntry & { total: number };

/** Read-only fields the API adds to invoices and bills in lists. */
export interface DocumentListFields {
  party_code: string;
  party_name: string;
  /** Derived from state, payments and due date as at today. */
  status: DocumentDisplayStatus;
  /** Days past the due date while OVERDUE, otherwise 0. */
  days_overdue: number;
  /** Document currency. */
  subtotal: number;
  tax: number;
  total: number;
  outstanding: number;
  /** Base currency at the document rate. */
  total_base: number;
  outstanding_base: number;
}

export type InvoiceListItem = SalesInvoice & DocumentListFields;
export type BillListItem = PurchaseBill & DocumentListFields;
export type DocumentListItem = InvoiceListItem | BillListItem;

export type PaymentListItem = Payment & {
  party_name: string;
  document_number: string;
  bank_account_name: string;
};

export interface PaymentListData {
  items: PaymentListItem[];
  /** Over every row matching the filters, not just this page. */
  totals: { count: number; base_amount: number };
}

export interface JournalStatistics {
  as_at: string;
  status_counts: Record<"ALL" | JournalStatus, number>;
  posted_this_month_count: number;
  posted_this_month_total: number;
  pending_approval_count: number;
  pending_approval_total: number;
  /** Share of all entries created by integrations and imports, 0–100. */
  integration_share_pct: number;
}

export interface DocumentStatistics {
  as_at: string;
  status_counts: Record<"ALL" | DocumentDisplayStatus, number>;
  /** Base currency. */
  outstanding: number;
  open_count: number;
  overdue: number;
  overdue_count: number;
  due_7_days: number;
  /** Receipts (or supplier payments) dated this calendar month. */
  settled_this_month: number;
  settled_this_month_count: number;
  /** Currencies used by at least one document. */
  currencies: string[];
}

export interface PaymentStatistics {
  as_at: string;
  this_month: { month: string; total: number; count: number };
  last_month: { month: string; total: number; count: number };
  /** Financial year to date. */
  year_to_date: { from_date: string; total: number; count: number };
  /** Share of payments by count made by mobile money, 0–100. */
  mobile_money_share_pct: number;
  /** Months (YYYY-MM) with at least one payment, newest first. */
  months: string[];
}
