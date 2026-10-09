import type { Account, AccountType, JournalEntry, JournalLine } from "@/models/accounting";
import { round2 } from "@/utils/format";
import { monthKey } from "@/utils/dates";

export const DEBIT_NORMAL: AccountType[] = ["ASSET", "EXPENSE"];

export const isDebitNormal = (type: AccountType) => DEBIT_NORMAL.includes(type);

export const ACCOUNT_TYPE_ORDER: AccountType[] = [
  "ASSET",
  "LIABILITY",
  "EQUITY",
  "REVENUE",
  "EXPENSE",
];

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  ASSET: "Assets",
  LIABILITY: "Liabilities",
  EQUITY: "Equity",
  REVENUE: "Revenue",
  EXPENSE: "Expenses",
};

export const lineTotals = (lines: Pick<JournalLine, "debit" | "credit">[]) => {
  const debit = round2(lines.reduce((s, l) => s + (Number(l.debit) || 0), 0));
  const credit = round2(lines.reduce((s, l) => s + (Number(l.credit) || 0), 0));
  return { debit, credit, difference: round2(debit - credit) };
};

export const isBalanced = (lines: Pick<JournalLine, "debit" | "credit">[]) => {
  const t = lineTotals(lines);
  return t.debit > 0 && Math.abs(t.difference) < 0.005;
};

/** Only POSTED and REVERSED entries affect the ledger; a reversal is its own posted entry. */
export const affectsLedger = (j: JournalEntry) => j.status === "POSTED" || j.status === "REVERSED";

export interface Movement {
  debit: number;
  credit: number;
}

export const accountMovements = (
  journals: JournalEntry[],
  opts: { from?: string; to?: string } = {},
) => {
  const map = new Map<string, Movement>();
  for (const j of journals) {
    if (!affectsLedger(j)) continue;
    if (opts.from && j.date < opts.from) continue;
    if (opts.to && j.date > opts.to) continue;
    for (const l of j.lines) {
      const m = map.get(l.account_id) ?? { debit: 0, credit: 0 };
      m.debit += l.debit;
      m.credit += l.credit;
      map.set(l.account_id, m);
    }
  }
  return map;
};

/** Balance expressed in the account's normal direction (positive = normal). */
export const signedBalance = (type: AccountType, m: Movement | undefined) => {
  if (!m) return 0;
  return round2(isDebitNormal(type) ? m.debit - m.credit : m.credit - m.debit);
};

export const balancesByAccount = (
  accounts: Account[],
  journals: JournalEntry[],
  opts: { from?: string; to?: string } = {},
) => {
  const movements = accountMovements(journals, opts);
  const out = new Map<string, number>();
  for (const a of accounts) {
    if (a.is_group) continue;
    out.set(a.id, signedBalance(a.type, movements.get(a.id)));
  }
  // Roll leaf balances up into their group accounts.
  const byId = new Map(accounts.map((a) => [a.id, a]));
  for (const a of accounts) {
    if (a.is_group) continue;
    let parentId = a.parent_id;
    const bal = out.get(a.id) ?? 0;
    while (parentId) {
      const parent = byId.get(parentId);
      if (!parent) break;
      out.set(parent.id, round2((out.get(parent.id) ?? 0) + bal));
      parentId = parent.parent_id;
    }
  }
  return out;
};

export interface TrialBalanceRow {
  account: Account;
  debit: number;
  credit: number;
}

export const trialBalance = (accounts: Account[], journals: JournalEntry[], asAt: string) => {
  const movements = accountMovements(journals, { to: asAt });
  const rows: TrialBalanceRow[] = [];
  for (const a of accounts) {
    if (a.is_group) continue;
    const m = movements.get(a.id);
    if (!m) continue;
    const net = round2(m.debit - m.credit);
    if (net === 0) continue;
    rows.push({ account: a, debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0 });
  }
  rows.sort((x, y) => x.account.code.localeCompare(y.account.code));
  const totals = lineTotals(rows);
  return { rows, totals };
};

export interface StatementLine {
  account: Account;
  amount: number;
}

const sumLines = (lines: StatementLine[]) => round2(lines.reduce((s, l) => s + l.amount, 0));

/** Year-end closing entries (and their reversals) that move profit into retained earnings. */
export const isYearEndClose = (j: JournalEntry) => j.source.type === "YEAR_END";

/**
 * Profit and loss for a range. Year-end closing entries are left out so a closed
 * year still reports its profit; pass `includeClosing` for the ledger's raw P&L
 * balances (what the balance sheet needs).
 */
export const incomeStatement = (
  accounts: Account[],
  journals: JournalEntry[],
  from: string,
  to: string,
  { includeClosing = false }: { includeClosing?: boolean } = {},
) => {
  const balances = balancesByAccount(accounts, includeClosing ? journals : journals.filter((j) => !isYearEndClose(j)), { from, to });
  const pick = (pred: (a: Account) => boolean): StatementLine[] =>
    accounts
      .filter((a) => !a.is_group && pred(a))
      .map((a) => ({ account: a, amount: balances.get(a.id) ?? 0 }))
      .filter((l) => l.amount !== 0);

  const revenue = pick((a) => a.type === "REVENUE");
  const costOfSales = pick((a) => a.type === "EXPENSE" && a.subtype === "COST_OF_SALES");
  const operating = pick((a) => a.type === "EXPENSE" && a.subtype !== "COST_OF_SALES");
  const totalRevenue = sumLines(revenue);
  const totalCostOfSales = sumLines(costOfSales);
  const grossProfit = round2(totalRevenue - totalCostOfSales);
  const totalOperating = sumLines(operating);
  const netIncome = round2(grossProfit - totalOperating);
  return {
    revenue,
    costOfSales,
    operating,
    totalRevenue,
    totalCostOfSales,
    grossProfit,
    totalOperating,
    netIncome,
  };
};

export const balanceSheet = (accounts: Account[], journals: JournalEntry[], asAt: string) => {
  const balances = balancesByAccount(accounts, journals, { to: asAt });
  const pick = (type: AccountType): StatementLine[] =>
    accounts
      .filter((a) => !a.is_group && a.type === type)
      .map((a) => ({ account: a, amount: balances.get(a.id) ?? 0 }))
      .filter((l) => l.amount !== 0);

  const currentAssets = pick("ASSET").filter((l) => l.account.subtype !== "FIXED_ASSET");
  const fixedAssets = pick("ASSET").filter((l) => l.account.subtype === "FIXED_ASSET");
  const currentLiabilities = pick("LIABILITY").filter((l) => l.account.subtype !== "LONG_TERM");
  const longTermLiabilities = pick("LIABILITY").filter((l) => l.account.subtype === "LONG_TERM");
  const equity = pick("EQUITY");

  // Unclosed profit for the year sits in equity until year-end close.
  const yearStart = `${asAt.slice(0, 4)}-01-01`;
  const raw = { includeClosing: true };
  const currentEarnings = incomeStatement(accounts, journals, yearStart, asAt, raw).netIncome;
  // Prior years' P&L that has not been closed into retained earnings.
  const priorEarnings = incomeStatement(accounts, journals, "0000-01-01", addDayBefore(yearStart), raw).netIncome;

  const totalCurrentAssets = sumLines(currentAssets);
  const totalFixedAssets = sumLines(fixedAssets);
  const totalCurrentLiabilities = sumLines(currentLiabilities);
  const totalLongTermLiabilities = sumLines(longTermLiabilities);
  const totalAssets = round2(totalCurrentAssets + totalFixedAssets);
  const totalLiabilities = round2(totalCurrentLiabilities + totalLongTermLiabilities);
  const totalEquity = round2(sumLines(equity) + currentEarnings + priorEarnings);
  return {
    currentAssets,
    fixedAssets,
    currentLiabilities,
    longTermLiabilities,
    equity,
    currentEarnings: round2(currentEarnings + priorEarnings),
    totalCurrentAssets,
    totalFixedAssets,
    totalCurrentLiabilities,
    totalLongTermLiabilities,
    totalAssets,
    totalLiabilities,
    totalEquity,
    totalLiabilitiesAndEquity: round2(totalLiabilities + totalEquity),
    difference: round2(totalAssets - totalLiabilities - totalEquity),
  };
};

const addDayBefore = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

export type CashFlowCategory = "OPERATING" | "INVESTING" | "FINANCING";

/** Balances migrated at go-live are opening cash, not a cash movement of the period. */
const isOpeningBalanceEntry = (j: JournalEntry) => j.source.type === "IMPORT" && /opening balance/i.test(j.memo);

const classifyCounterAccount = (a: Account | undefined): CashFlowCategory => {
  if (!a) return "OPERATING";
  if (a.subtype === "FIXED_ASSET") return "INVESTING";
  if (a.type === "EQUITY" || a.subtype === "LONG_TERM") return "FINANCING";
  return "OPERATING";
};

/**
 * Direct-method cash flow: every posted entry touching a bank/cash account is
 * classified by the largest non-cash line in that entry.
 */
export const cashFlow = (
  accounts: Account[],
  journals: JournalEntry[],
  from: string,
  to: string,
) => {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const isCash = (id: string) => byId.get(id)?.is_bank ?? false;
  const groups: Record<CashFlowCategory, Map<string, number>> = {
    OPERATING: new Map(),
    INVESTING: new Map(),
    FINANCING: new Map(),
  };

  let migratedOpening = 0;
  for (const j of journals) {
    if (!affectsLedger(j) || j.date < from || j.date > to) continue;
    const cashLines = j.lines.filter((l) => isCash(l.account_id));
    if (cashLines.length === 0) continue;
    const netCash = round2(cashLines.reduce((s, l) => s + l.debit - l.credit, 0));
    if (netCash === 0) continue; // transfers between bank accounts
    if (isOpeningBalanceEntry(j)) {
      migratedOpening += netCash;
      continue;
    }
    const counter = j.lines
      .filter((l) => !isCash(l.account_id))
      .sort((a, b) => b.debit + b.credit - (a.debit + a.credit))[0];
    const counterAccount = counter ? byId.get(counter.account_id) : undefined;
    const category = classifyCounterAccount(counterAccount);
    const label = cashFlowLabel(j, counterAccount);
    const bucket = groups[category];
    bucket.set(label, round2((bucket.get(label) ?? 0) + netCash));
  }

  const toLines = (m: Map<string, number>) =>
    [...m.entries()]
      .map(([label, amount]) => ({ label, amount }))
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));

  const operating = toLines(groups.OPERATING);
  const investing = toLines(groups.INVESTING);
  const financing = toLines(groups.FINANCING);
  const sum = (ls: { amount: number }[]) => round2(ls.reduce((s, l) => s + l.amount, 0));

  const cashAccounts = accounts.filter((a) => a.is_bank);
  const opening = round2(
    migratedOpening +
      cashAccounts.reduce(
        (s, a) => s + (balancesByAccount([a], journals, { to: addDayBefore(from) }).get(a.id) ?? 0),
        0,
      ),
  );
  const netChange = round2(sum(operating) + sum(investing) + sum(financing));
  return {
    operating,
    investing,
    financing,
    totalOperating: sum(operating),
    totalInvesting: sum(investing),
    totalFinancing: sum(financing),
    opening,
    netChange,
    closing: round2(opening + netChange),
  };
};

const cashFlowLabel = (j: JournalEntry, counter: Account | undefined) => {
  switch (j.source.type) {
    case "SALES":
      return "Receipts from customers";
    case "PURCHASES":
      return "Payments to suppliers";
    case "STORE_MANAGEMENT":
      return "Store sales collected";
    case "LOANS":
      return counter?.subtype === "LOAN_BOOK" && j.lines.some((l) => l.account_id === counter.id && l.debit > 0)
        ? "Loans disbursed to clients"
        : "Loan repayments received";
    case "HR":
      return "Salaries and statutory deductions";
    default:
      return counter ? counter.name : "Other";
  }
};

export const monthlyProfitAndLoss = (
  accounts: Account[],
  journals: JournalEntry[],
  months: string[],
) => {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const rows = months.map((m) => ({ month: m, revenue: 0, expenses: 0, profit: 0 }));
  const index = new Map(months.map((m, i) => [m, i]));
  for (const j of journals) {
    if (!affectsLedger(j) || isYearEndClose(j)) continue;
    const i = index.get(monthKey(j.date));
    if (i === undefined) continue;
    for (const l of j.lines) {
      const a = byId.get(l.account_id);
      if (!a) continue;
      if (a.type === "REVENUE") rows[i].revenue += l.credit - l.debit;
      if (a.type === "EXPENSE") rows[i].expenses += l.debit - l.credit;
    }
  }
  return rows.map((r) => ({
    ...r,
    revenue: round2(r.revenue),
    expenses: round2(r.expenses),
    profit: round2(r.revenue - r.expenses),
  }));
};

export const cashBalanceSeries = (accounts: Account[], journals: JournalEntry[], months: string[]) => {
  const cashIds = new Set(accounts.filter((a) => a.is_bank).map((a) => a.id));
  const posted = journals.filter(affectsLedger).sort((a, b) => a.date.localeCompare(b.date));
  return months.map((m) => {
    let bal = 0;
    for (const j of posted) {
      if (monthKey(j.date) > m) break;
      for (const l of j.lines) if (cashIds.has(l.account_id)) bal += l.debit - l.credit;
    }
    return { month: m, balance: round2(bal) };
  });
};

export interface LedgerRow {
  journal: JournalEntry;
  line: JournalLine;
  balance: number;
}

export const generalLedger = (
  account: Account,
  journals: JournalEntry[],
  from: string,
  to: string,
) => {
  const posted = journals
    .filter((j) => affectsLedger(j) && j.lines.some((l) => l.account_id === account.id))
    .sort((a, b) => (a.date === b.date ? a.number.localeCompare(b.number) : a.date.localeCompare(b.date)));
  const debitNormal = isDebitNormal(account.type);
  let opening = 0;
  const rows: LedgerRow[] = [];
  let running = 0;
  for (const j of posted) {
    for (const l of j.lines) {
      if (l.account_id !== account.id) continue;
      const delta = debitNormal ? l.debit - l.credit : l.credit - l.debit;
      if (j.date < from) {
        opening += delta;
        continue;
      }
      if (j.date > to) continue;
      if (rows.length === 0) running = opening;
      running += delta;
      rows.push({ journal: j, line: l, balance: round2(running) });
    }
  }
  const totals = lineTotals(rows.map((r) => r.line));
  return {
    opening: round2(opening),
    rows,
    totals,
    closing: rows.length ? rows[rows.length - 1].balance : round2(opening),
  };
};
