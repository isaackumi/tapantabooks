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

export type TaxReturnStatus = "IN_PROGRESS" | "DUE" | "OVERDUE" | "FILED" | "NOTHING_DUE";

export interface TaxReturnFiling {
  journal_id: string;
  number: string;
  date: string;
  amount: number;
}

export interface TaxSummaryMonth {
  /** YYYY-MM */
  month: string;
  /** Net output tax charged in the month (credit notes reduce it). */
  output_tax: number;
  /** Net input tax recoverable in the month. */
  input_tax: number;
  /** output_tax − input_tax; negative is a refund position. */
  net_payable: number;
  withholding_tax: number;
  due_date: string;
  status: TaxReturnStatus;
  filing: TaxReturnFiling | null;
}

export interface TaxAccountBalance {
  account_id: string;
  code: string;
  name: string;
  /** In the account's normal direction, as at `to_date`. */
  balance: number;
}

export interface TaxSummaryReport {
  from_date: string;
  to_date: string;
  /** Day of the following month a VAT return is due. */
  return_due_day: number;
  months: TaxSummaryMonth[];
  totals: { output_tax: number; input_tax: number; net_payable: number; withholding_tax: number };
  /** Earliest unfiled return that is due or overdue, or null. */
  next_return: TaxSummaryMonth | null;
  accounts: { output: TaxAccountBalance[]; input: TaxAccountBalance[]; withholding: TaxAccountBalance[] };
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
  /** Import batches that are NEEDS_REVIEW or FAILED. */
  imports_needing_review: number;
}

/** Headline figures for the reports landing page; year to date runs from the start of the fiscal year. */
export interface ReportsSummary {
  as_at: string;
  from_date: string;
  total_assets: number;
  net_income: number;
  cash_net_change: number;
  receivables: number;
  payables: number;
  /** Total of either side of the trial balance. */
  trial_balance_total: number;
}

export interface AccountBalance {
  account_id: string;
  /** Signed balance (positive is the normal side); group accounts carry the sum of their posting accounts. */
  balance: number;
  /** Appears on at least one POSTED or REVERSED journal line (posting accounts only). */
  has_postings: boolean;
}

export interface AccountBalances {
  as_at: string;
  items: AccountBalance[];
}

export interface PeriodStatistics {
  period_id: string;
  posted_count: number;
  /** Sum of debits of the period's POSTED and REVERSED journals. */
  posted_total: number;
  /** DRAFT and PENDING_APPROVAL journals dated in the period. */
  open_count: number;
}

export interface CustomFieldUsage {
  custom_field_id: string;
  /** Records of the field's entity holding a non-empty value. */
  record_count: number;
}
