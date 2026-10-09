import type { BankStatementLine, FxRevaluation, SourceType, StatementLineStatus } from "./accounting";

export interface BankAccountBalance {
  bank_account_id: string;
  currency: string;
  /** In the account's currency. */
  ledger_balance: number;
  /** Base currency at the rates the postings were booked at. */
  ledger_balance_base: number;
  statement_balance: number;
  statement_date: string;
  /** statement_balance − ledger_balance, in the account's currency. */
  statement_difference: number;
  statement_lines: number;
  unmatched_lines: number;
}

export interface BankAccountBalances {
  as_at: string;
  /** Sum of ledger_balance_base. */
  total_base: number;
  unmatched_lines: number;
  /** Accounts whose ledger balance differs from their latest statement. */
  out_of_agreement: number;
  items: BankAccountBalance[];
}

/** One posted journal touching a bank, MoMo or cash account. */
export interface BankActivityItem {
  journal_id: string;
  number: string;
  date: string;
  memo: string;
  source_type: SourceType;
  /** The first bank account the journal touches (within the bank_account_id filter, if any). */
  bank_account_id: string;
  /** Moves money between the organisation's own accounts. */
  is_transfer: boolean;
  /** Net movement on the bank accounts in scope, in the account's currency; positive is money in. */
  amount: number;
  currency: string;
  amount_base: number;
  /** The status of the statement line matched or suggested for it; null when no line refers to it. */
  statement_status: StatementLineStatus | null;
}

export type ReconciliationLine = BankStatementLine & {
  matched_journal_number: string | null;
  matched_journal_memo: string | null;
  suggested_journal_number: string | null;
  suggested_journal_memo: string | null;
};

/** A posted journal on the bank account that no statement line is matched to. */
export interface ReconciliationCandidate {
  journal_id: string;
  number: string;
  date: string;
  memo: string;
  /** Net on the bank account, in its currency. */
  amount: number;
  /** Not suggested for any statement line either: still waiting to clear. */
  in_transit: boolean;
}

export interface BankReconciliation {
  bank_account_id: string;
  currency: string;
  statement_date: string;
  statement_balance: number;
  last_reconciled_at: string | null;
  /** Ledger balance at the statement date, in the account's currency. */
  ledger_balance: number;
  /** Candidates' total: in the ledger, not yet on the statement. */
  ledger_only_total: number;
  /** Lines not yet matched: on the statement, not yet in the ledger. */
  statement_only: number;
  /** ledger_balance − ledger_only_total + statement_only. */
  adjusted_balance: number;
  /** statement_balance − adjusted_balance; zero when everything is explained. */
  difference: number;
  counts: Record<StatementLineStatus, number>;
  /** Oldest first. */
  lines: ReconciliationLine[];
  candidates: ReconciliationCandidate[];
}

export interface StatementImportPreviewInput {
  bank_account_id: string;
  lines: { date: string; description: string; amount: number }[];
}

export interface StatementImportPreview {
  /** One flag per incoming line, in order: true when the account already holds it. */
  held: boolean[];
  new_count: number;
  duplicate_count: number;
  /** The account's current statement balance and date. */
  brought_forward: number;
  statement_date: string;
  /** brought_forward plus the new lines dated after statement_date. */
  expected_closing: number;
}

export type RevaluationListItem = FxRevaluation & {
  period_name: string;
  journal_number: string;
  reversal_journal_number: string;
};
