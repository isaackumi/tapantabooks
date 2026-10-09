import type { BankAccount, JournalEntry, JournalLine, StatementLineStatus } from "@/models/accounting";
import type {
  BankAccountBalances,
  BankActivityItem,
  BankReconciliation,
  ReconciliationCandidate,
  RevaluationListItem,
  StatementImportPreview,
  StatementImportPreviewInput,
} from "@/models/banking";
import { affectsLedger, balancesByAccount } from "@/lib/ledger";
import { accountBalances, isForeign } from "@/lib/fx";
import { partitionNewLines } from "@/lib/bankStatementCsv";
import { round2 } from "@/utils/format";
import { todayIso } from "@/utils/dates";
import type { LedgerState } from "./engine";
import { ApiFault, found, need } from "./http";

/** Signed movement on the bank's ledger account, in the bank's currency; positive is money in. */
const netOnBank = (lines: JournalLine[], bank: BankAccount) =>
  round2(
    lines
      .filter((l) => l.account_id === bank.gl_account_id)
      .reduce((t, l) => t + (isForeign(bank.currency) ? (l.debit > 0 ? 1 : -1) * (l.amount_fc ?? 0) : l.debit - l.credit), 0),
  );

const ledgerBalance = (s: LedgerState, bank: BankAccount, asAt: string) => {
  const bal = accountBalances(s.journals, bank.gl_account_id, asAt);
  return { own: isForeign(bank.currency) ? bal.fc : bal.base, base: bal.base };
};

/** Ledger balance of each bank account in base currency. */
export const bankBaseBalances = (s: LedgerState) => {
  const balances = balancesByAccount(s.accounts, s.journals);
  return new Map(s.bankAccounts.map((b) => [b.id, balances.get(b.gl_account_id) ?? 0]));
};

const findBank = (s: LedgerState, id: string) => found(s.bankAccounts.find((b) => b.id === id), "Bank account");

export const bankBalances = (s: LedgerState, asAt = todayIso()): BankAccountBalances => {
  const items = s.bankAccounts.map((b) => {
    const ledger = ledgerBalance(s, b, asAt);
    const lines = s.statementLines.filter((l) => l.bank_account_id === b.id);
    return {
      bank_account_id: b.id,
      currency: b.currency,
      ledger_balance: ledger.own,
      ledger_balance_base: ledger.base,
      statement_balance: b.statement_balance,
      statement_date: b.statement_date,
      statement_difference: round2(b.statement_balance - ledger.own),
      statement_lines: lines.length,
      unmatched_lines: lines.filter((l) => l.status !== "MATCHED").length,
    };
  });
  return {
    as_at: asAt,
    total_base: round2(items.reduce((t, i) => t + i.ledger_balance_base, 0)),
    unmatched_lines: items.reduce((t, i) => t + i.unmatched_lines, 0),
    out_of_agreement: items.filter((i) => i.statement_difference !== 0).length,
    items,
  };
};

const statementStatusByJournal = (s: LedgerState) => {
  const map = new Map<string, StatementLineStatus>();
  for (const l of s.statementLines) {
    if (l.matched_journal_id) map.set(l.matched_journal_id, "MATCHED");
    else if (l.suggested_journal_id && !map.has(l.suggested_journal_id)) map.set(l.suggested_journal_id, "SUGGESTED");
  }
  return map;
};

/** Newest first; ties broken by journal number, newest first. */
export const bankActivity = (s: LedgerState, bankId: string | null): BankActivityItem[] => {
  const scope = bankId ? [findBank(s, bankId)] : s.bankAccounts;
  const byGl = new Map(s.bankAccounts.map((b) => [b.gl_account_id, b]));
  const inScope = new Set(scope.map((b) => b.gl_account_id));
  const status = statementStatusByJournal(s);
  return s.journals
    .filter((j) => affectsLedger(j) && j.lines.some((l) => inScope.has(l.account_id)))
    .sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number))
    .map((j) => {
      const bankLines = j.lines.filter((l) => byGl.has(l.account_id));
      const scoped = bankLines.filter((l) => inScope.has(l.account_id));
      const bank = byGl.get(scoped[0].account_id)!;
      const isTransfer = bankLines.some((l) => l.debit > 0) && bankLines.some((l) => l.credit > 0);
      const amountBase = round2(scoped.reduce((t, l) => t + l.debit - l.credit, 0));
      return {
        journal_id: j.id,
        number: j.number,
        date: j.date,
        memo: j.memo,
        source_type: j.source.type,
        bank_account_id: bank.id,
        is_transfer: isTransfer,
        amount: isForeign(bank.currency) && (bankId || !isTransfer) ? netOnBank(scoped, bank) : amountBase,
        currency: isForeign(bank.currency) && (bankId || !isTransfer) ? bank.currency : s.org.base_currency,
        amount_base: amountBase,
        statement_status: status.get(j.id) ?? null,
      };
    });
};

export const reconciliationView = (s: LedgerState, bankId: string): BankReconciliation => {
  const bank = findBank(s, bankId);
  const journals = new Map(s.journals.map((j) => [j.id, j]));
  const lines = s.statementLines.filter((l) => l.bank_account_id === bank.id).sort((a, b) => a.date.localeCompare(b.date));
  const windowStart = `${(lines[0]?.date ?? bank.statement_date).slice(0, 7)}-01`;
  const matched = new Set(lines.map((l) => l.matched_journal_id).filter(Boolean));
  const suggested = new Set(lines.map((l) => l.suggested_journal_id).filter(Boolean));
  const candidates: ReconciliationCandidate[] = s.journals
    .filter(
      (j: JournalEntry) =>
        affectsLedger(j) &&
        j.date >= windowStart &&
        j.date <= bank.statement_date &&
        !matched.has(j.id) &&
        j.lines.some((l) => l.account_id === bank.gl_account_id),
    )
    .map((j) => ({ journal_id: j.id, number: j.number, date: j.date, memo: j.memo, amount: netOnBank(j.lines, bank), in_transit: !suggested.has(j.id) }))
    .filter((c) => c.amount !== 0);
  const ledger = ledgerBalance(s, bank, bank.statement_date).own;
  const ledgerOnly = round2(candidates.reduce((t, c) => t + c.amount, 0));
  const statementOnly = round2(lines.filter((l) => l.status !== "MATCHED").reduce((t, l) => t + l.amount, 0));
  const adjusted = round2(ledger - ledgerOnly + statementOnly);
  const ref = (id: string | null) => (id ? journals.get(id) : undefined);
  return {
    bank_account_id: bank.id,
    currency: bank.currency,
    statement_date: bank.statement_date,
    statement_balance: bank.statement_balance,
    last_reconciled_at: bank.last_reconciled_at,
    ledger_balance: ledger,
    ledger_only_total: ledgerOnly,
    statement_only: statementOnly,
    adjusted_balance: adjusted,
    difference: round2(bank.statement_balance - adjusted),
    counts: {
      MATCHED: lines.filter((l) => l.status === "MATCHED").length,
      SUGGESTED: lines.filter((l) => l.status === "SUGGESTED").length,
      UNMATCHED: lines.filter((l) => l.status === "UNMATCHED").length,
    },
    lines: lines.map((l) => ({
      ...l,
      matched_journal_number: ref(l.matched_journal_id)?.number ?? null,
      matched_journal_memo: ref(l.matched_journal_id)?.memo ?? null,
      suggested_journal_number: ref(l.suggested_journal_id)?.number ?? null,
      suggested_journal_memo: ref(l.suggested_journal_id)?.memo ?? null,
    })),
    candidates,
  };
};

/** Same normalisation and duplicate rule as POST /bank-statement-lines/import. */
export const statementImportPreview = (s: LedgerState, input: StatementImportPreviewInput): StatementImportPreview => {
  const bank = findBank(s, need(input.bank_account_id || null, "bank_account_id"));
  if (!Array.isArray(input.lines)) throw new ApiFault(400, "lines must be an array.", { lines: "Required" });
  const incoming = input.lines.map((l, i) => ({
    i,
    date: String(l?.date ?? ""),
    amount: round2(Number(l?.amount) || 0),
    description: String(l?.description ?? "").trim().replace(/\s+/g, " "),
  }));
  const { fresh, duplicates } = partitionNewLines(
    s.statementLines.filter((l) => l.bank_account_id === bank.id),
    incoming,
  );
  const held = incoming.map(() => false);
  for (const d of duplicates) held[d.i] = true;
  return {
    held,
    new_count: fresh.length,
    duplicate_count: duplicates.length,
    brought_forward: bank.statement_balance,
    statement_date: bank.statement_date,
    expected_closing: round2(bank.statement_balance + fresh.filter((l) => l.date > bank.statement_date).reduce((t, l) => t + l.amount, 0)),
  };
};

export const revaluationItems = (s: LedgerState): RevaluationListItem[] => {
  const number = new Map(s.journals.map((j) => [j.id, j.number]));
  const period = new Map(s.periods.map((p) => [p.id, p.name]));
  return s.fxRevaluations.map((r) => ({
    ...r,
    period_name: period.get(r.period_id) ?? "",
    journal_number: number.get(r.journal_id) ?? "",
    reversal_journal_number: number.get(r.reversal_journal_id) ?? "",
  }));
};
