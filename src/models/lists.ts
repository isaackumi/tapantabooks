import type {
  ActorType,
  CreditNote,
  DocumentDisplayStatus,
  ImportBatch,
  JournalEntry,
  JournalStatus,
  Payment,
  PurchaseBill,
  SalesInvoice,
} from "./accounting";

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

/** A credit note or supplier credit as listed; amounts in the credit's (the document's) currency. */
export type CreditListItem = CreditNote & {
  party_name: string;
  document_number: string;
  subtotal: number;
  tax: number;
  total: number;
  journal_number: string | null;
};

/** One invoice or bill with everything its detail view shows. */
export type DocumentDetail<T extends SalesInvoice | PurchaseBill = SalesInvoice | PurchaseBill> = T &
  DocumentListFields & {
    tax_by_code: { tax_code_id: string; amount: number }[];
    journal_number: string | null;
    /** Receipts or supplier payments against it, oldest first. */
    payments: PaymentListItem[];
    /** Credit notes or supplier credits against it, including voided ones, oldest first. */
    credits: CreditListItem[];
    /** Net realised exchange gain (+) or loss (−) on its payments, base currency. */
    realised_fx: number;
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

/** Base-currency totals of live (not voided) credits. */
export interface CreditStatistics {
  as_at: string;
  this_month: { month: string; total: number; count: number };
  /** Financial year to date. */
  year_to_date: { from_date: string; total: number; count: number; tax: number };
  state_counts: { ALL: number; APPROVED: number; VOID: number };
}

/** What one customer or supplier owes or is owed, base currency at document rates. */
export interface PartyBalance {
  party_id: string;
  outstanding: number;
  overdue: number;
  open_count: number;
  /** Outstanding on documents in the party's own currency, when that is not the base currency. */
  outstanding_fc: number;
}

export interface PartyBalances {
  as_at: string;
  /** Only parties with something outstanding. */
  items: PartyBalance[];
  totals: { outstanding: number; overdue: number; with_balance_count: number; overdue_count: number };
}

/** Open foreign-currency receivables and payables, in each currency. */
export interface CurrencyExposure {
  as_at: string;
  items: { currency: string; open_documents: number; receivable: number; payable: number }[];
}

export type ImportListItem = ImportBatch & {
  source_name: string;
  row_count: number;
  valid_count: number;
  warning_count: number;
  error_count: number;
  posted_count: number;
};

export interface ImportStatistics {
  batch_count: number;
  row_count: number;
  posted_rows: number;
  /** Rows that failed validation. */
  held_rows: number;
  /** Batches waiting for review or failed. */
  needs_attention: number;
  status_counts: { ALL: number; ATTENTION: number; POSTED: number };
}

/** References from a file that earlier batches already imported. */
export interface ImportReferenceCheck {
  items: { reference: string; batch_id: string; batch_number: string }[];
}

export interface AuditStatistics {
  as_at: string;
  total: number;
  today: number;
  by_actor_type: Record<ActorType, number>;
  entity_types: string[];
  actor_names: string[];
}
