import type {
  Account,
  BankStatementLine,
  FiscalPeriod,
  JournalEntry,
  JournalStatus,
  OrgSettings,
  PurchaseBill,
  SalesInvoice,
} from "@/models/accounting";
import { balancesByAccount, incomeStatement, isYearEndClose } from "@/lib/ledger";
import { addDays, todayIso } from "@/utils/dates";
import { fmtDate, round2 } from "@/utils/format";

/** You may open next year's periods once it is this close. */
export const NEXT_YEAR_LEAD_DAYS = 92;

export interface FiscalYear {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
}

export interface FiscalYearView extends FiscalYear {
  status: "OPEN" | "CLOSED";
  periods: { total: number; open: number; locked: number; closed: number };
  /** Profit for the year, excluding the closing entry. */
  net_income: number;
  closing_journal_id: string | null;
  closing_journal_number: string | null;
  closed_at: string | null;
  closed_by: string | null;
}

export interface YearEndLine {
  account_id: string;
  debit: number;
  credit: number;
}

export interface YearEndPreview {
  fiscal_year: FiscalYearView;
  retained_earnings_account_id: string | null;
  /** The closing entry: every P&L balance reversed, net to retained earnings. Empty when the year has no P&L. */
  lines: YearEndLine[];
  net_income: number;
  /** Any blocker stops the close; the first is the error message. */
  blockers: string[];
  warnings: string[];
}

interface FiscalSource {
  org: Pick<OrgSettings, "fiscal_year_start">;
  accounts: Account[];
  journals: JournalEntry[];
  periods: FiscalPeriod[];
  invoices: Pick<SalesInvoice, "state" | "issue_date">[];
  bills: Pick<PurchaseBill, "state" | "issue_date">[];
  statementLines: Pick<BankStatementLine, "date" | "status">[];
}

const startMonth = (org: Pick<OrgSettings, "fiscal_year_start">) => Number((org.fiscal_year_start || "01-01").slice(0, 2));

/** The financial year containing `date`. */
export const fiscalYearFor = (org: Pick<OrgSettings, "fiscal_year_start">, date: string): FiscalYear => {
  const m = startMonth(org);
  const [y, month] = date.split("-").map(Number);
  const year = month >= m ? y : y - 1;
  const mm = String(m).padStart(2, "0");
  const start = `${year}-${mm}-01`;
  const nextStart = `${year + 1}-${mm}-01`;
  return {
    id: `fy_${year}`,
    name: m === 1 ? `FY ${year}` : `FY ${year}/${String(year + 1).slice(2)}`,
    start_date: start,
    end_date: addDays(nextStart, -1),
  };
};

const closingJournalFor = (journals: JournalEntry[], fy: FiscalYear) =>
  journals.find((j) => j.status === "POSTED" && !j.reversal_of_id && isYearEndClose(j) && j.source.reference === fy.name) ?? null;

/** Financial years that have periods, oldest first. */
export const fiscalYearsView = (s: FiscalSource): FiscalYearView[] => {
  const byId = new Map<string, { fy: FiscalYear; periods: FiscalPeriod[] }>();
  for (const p of [...s.periods].sort((a, b) => a.start_date.localeCompare(b.start_date))) {
    const fy = fiscalYearFor(s.org, p.start_date);
    const entry = byId.get(fy.id) ?? { fy, periods: [] };
    entry.periods.push(p);
    byId.set(fy.id, entry);
  }
  return [...byId.values()].map(({ fy, periods }) => {
    const closing = closingJournalFor(s.journals, fy);
    const net = incomeStatement(s.accounts, s.journals, fy.start_date, fy.end_date).netIncome;
    // A year with no P&L needs no closing entry: closing all its periods closes it.
    const closedWithoutEntry = periods.every((p) => p.status === "CLOSED") && pnlBalances(s, fy).length === 0;
    return {
      ...fy,
      status: closing || closedWithoutEntry ? "CLOSED" : "OPEN",
      periods: {
        total: periods.length,
        open: periods.filter((p) => p.status === "OPEN").length,
        locked: periods.filter((p) => p.status === "LOCKED").length,
        closed: periods.filter((p) => p.status === "CLOSED").length,
      },
      net_income: net,
      closing_journal_id: closing?.id ?? null,
      closing_journal_number: closing?.number ?? null,
      closed_at: closing?.posted_at ?? null,
      closed_by: closing?.posted_by ?? null,
    };
  });
};

/** Non-zero P&L account balances for the year, including any closing entry. */
const pnlBalances = (s: Pick<FiscalSource, "accounts" | "journals">, fy: FiscalYear) => {
  const balances = balancesByAccount(s.accounts, s.journals, { from: fy.start_date, to: fy.end_date });
  return s.accounts
    .filter((a) => !a.is_group && (a.type === "REVENUE" || a.type === "EXPENSE"))
    .map((a) => ({ account: a, balance: balances.get(a.id) ?? 0 }))
    .filter((x) => x.balance !== 0);
};

const PENDING: JournalStatus[] = ["DRAFT", "PENDING_APPROVAL"];

export const yearEndPreview = (s: FiscalSource, fiscalYearId: string): YearEndPreview | null => {
  const years = fiscalYearsView(s);
  const index = years.findIndex((y) => y.id === fiscalYearId);
  if (index < 0) return null;
  const fy = years[index];
  const today = todayIso();
  const inYear = (d: string) => d >= fy.start_date && d <= fy.end_date;
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (fy.status === "CLOSED") blockers.push(`${fy.name} is already closed.`);
  if (fy.end_date >= today) {
    blockers.push(`${fy.name} ends on ${fmtDate(fy.end_date)}. It can be closed from ${fmtDate(addDays(fy.end_date, 1))}.`);
  }
  const earlierOpen = years.slice(0, index).find((y) => y.status === "OPEN");
  if (earlierOpen) blockers.push(`Close ${earlierOpen.name} first. Years close in order.`);
  const pending = s.journals.filter((j) => PENDING.includes(j.status) && inYear(j.date));
  if (pending.length) {
    blockers.push(
      `${pending.length} entr${pending.length === 1 ? "y is" : "ies are"} still draft or awaiting approval in ${fy.name}: ${pending
        .slice(0, 3)
        .map((j) => j.number)
        .join(", ")}${pending.length > 3 ? "…" : ""}. Post or delete them first.`,
    );
  }
  const retained = s.accounts.find((a) => a.subtype === "RETAINED_EARNINGS" && a.is_active && !a.is_group) ?? null;
  if (!retained) blockers.push("No active Retained Earnings account. Add an equity account with subtype Retained earnings.");

  const balances = pnlBalances(s, fy);
  const lines: YearEndLine[] = balances.map(({ account, balance }) => {
    // Revenue carries a credit balance and expenses a debit balance; the close takes each to zero.
    const debitSide = account.type === "REVENUE" ? balance > 0 : balance < 0;
    const amount = Math.abs(balance);
    return { account_id: account.id, debit: debitSide ? amount : 0, credit: debitSide ? 0 : amount };
  });
  const netIncome = round2(
    balances.reduce((t, { account, balance }) => t + (account.type === "REVENUE" ? balance : -balance), 0),
  );
  if (lines.length && retained) {
    lines.push({ account_id: retained.id, debit: netIncome < 0 ? -netIncome : 0, credit: netIncome > 0 ? netIncome : 0 });
  }

  const obe = s.accounts.find((a) => a.subtype === "OPENING_BALANCE" && !a.is_group);
  const obeBalance = obe ? (balancesByAccount(s.accounts, s.journals, { to: fy.end_date }).get(obe.id) ?? 0) : 0;
  if (obeBalance !== 0) warnings.push(`Opening Balance Equity is not zero at year end. Finish the opening balances so it can be cleared.`);
  const drafts = [...s.invoices, ...s.bills].filter((d) => d.state === "DRAFT" && inYear(d.issue_date)).length;
  if (drafts) warnings.push(`${drafts} draft invoice${drafts === 1 ? "" : "s"} or bill${drafts === 1 ? "" : "s"} dated in ${fy.name} will have to be dated in the next year.`);
  const unmatched = s.statementLines.filter((l) => l.status !== "MATCHED" && inYear(l.date)).length;
  if (unmatched) warnings.push(`${unmatched} bank statement line${unmatched === 1 ? "" : "s"} in ${fy.name} ${unmatched === 1 ? "is" : "are"} not reconciled.`);

  return {
    fiscal_year: fy,
    retained_earnings_account_id: retained?.id ?? null,
    lines,
    net_income: netIncome,
    blockers,
    warnings,
  };
};
