// Response shapes of the report and statistics endpoints (snake_case, as on the wire).
// Definitions: docs/PROCESSING_RULES.md section 17. Amounts are base currency unless stated.

import type { Account, JournalEntry, JournalLine } from "./accounting";

export interface DebitCreditTotals {
  debit: number;
  credit: number;
  difference: number;
}

/** One account's amount in a statement section. */
export interface ReportAccountLine {
  account: Account;
  amount: number;
}

export interface TrialBalanceReport {
  rows: { account: Account; debit: number; credit: number }[];
  totals: DebitCreditTotals;
}

export interface GeneralLedgerReport {
  opening: number;
  rows: { journal: JournalEntry; line: JournalLine; balance: number }[];
  totals: DebitCreditTotals;
  closing: number;
}

export interface IncomeStatementReport {
  revenue: ReportAccountLine[];
  cost_of_sales: ReportAccountLine[];
  operating: ReportAccountLine[];
  total_revenue: number;
  total_cost_of_sales: number;
  gross_profit: number;
  total_operating: number;
  net_income: number;
}

export interface BalanceSheetReport {
  current_assets: ReportAccountLine[];
  fixed_assets: ReportAccountLine[];
  current_liabilities: ReportAccountLine[];
  long_term_liabilities: ReportAccountLine[];
  equity: ReportAccountLine[];
  current_earnings: number;
  total_current_assets: number;
  total_fixed_assets: number;
  total_current_liabilities: number;
  total_long_term_liabilities: number;
  total_assets: number;
  total_liabilities: number;
  total_equity: number;
  total_liabilities_and_equity: number;
  difference: number;
}

export interface CashFlowLine {
  label: string;
  amount: number;
}

export interface CashFlowReport {
  operating: CashFlowLine[];
  investing: CashFlowLine[];
  financing: CashFlowLine[];
  total_operating: number;
  total_investing: number;
  total_financing: number;
  opening: number;
  net_change: number;
  closing: number;
}

/** Bucket label, e.g. "Current" or "1–30 days" (en dash), to amount. */
export type AgeingBuckets = Record<string, number>;

export interface AgeingDocument {
  document_id: string;
  number: string;
  issue_date: string;
  due_date: string;
  days_overdue: number;
  bucket: string;
  outstanding: number;
}

export interface AgeingReport {
  as_at: string;
  buckets: string[];
  rows: {
    party_id: string;
    party_code: string;
    party_name: string;
    buckets: AgeingBuckets;
    total: number;
    documents: AgeingDocument[];
  }[];
  totals: AgeingBuckets & { total: number };
}

export interface MonthlyTrendPoint {
  /** YYYY-MM */
  month: string;
  revenue: number;
  expenses: number;
  net_income: number;
  /** Cash and bank balance at the end of the month, or at `to_date` for the last month. */
  closing_cash: number;
}

export interface MonthlyTrendReport {
  from_date: string;
  to_date: string;
  months: MonthlyTrendPoint[];
}

export interface DashboardStatistics {
  as_at: string;
  revenue_mtd: number;
  expenses_mtd: number;
  net_income_mtd: number;
  revenue_ytd: number;
  net_income_ytd: number;
  cash_balance: number;
  receivables: number;
  overdue_receivables: number;
  overdue_invoices: number;
  payables: number;
  overdue_payables: number;
  payables_due_7_days: number;
  journals_pending_approval: number;
  draft_journals: number;
  unmatched_statement_lines: number;
}
