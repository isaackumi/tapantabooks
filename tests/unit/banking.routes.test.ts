import { describe, expect, it } from "vitest";
import { resolveHandler } from "@/mock/api/routes";
import type { Pagination } from "@/core/apiClient";
import type {
  BankAccountBalances,
  BankActivityItem,
  BankReconciliation,
  RevaluationListItem,
  StatementImportPreview,
} from "@/models/banking";
import { affectsLedger, balancesByAccount } from "@/lib/ledger";
import { isForeign } from "@/lib/fx";
import { DEMO_TODAY } from "@/utils/dates";
import { demoBooks, expectOk } from "./helpers";

const books = demoBooks();
const call = <T>(method: "GET" | "POST", path: string, query: Record<string, string> = {}, body: unknown = null) => {
  const handler = resolveHandler(method, path);
  if (!handler) throw new Error(`No handler for ${method} ${path}`);
  const res = handler({ state: books.state, engine: books.engine, q: new URLSearchParams(query), body, userId: books.state.currentUserId });
  return { data: res.data as T, pagination: res.pagination as Pagination };
};
const get = <T>(path: string, query: Record<string, string> = {}) => call<T>("GET", path, query);

const feedBank = () => books.state.bankAccounts.find((b) => books.state.statementLines.some((l) => l.bank_account_id === b.id))!;

describe("GET /bank-accounts/balances", () => {
  it("matches the general ledger and counts unmatched statement lines", () => {
    const s = get<BankAccountBalances>("/bank-accounts/balances", { as_at: DEMO_TODAY }).data;
    const gl = balancesByAccount(books.state.accounts, books.state.journals, { to: DEMO_TODAY });
    expect(s.items).toHaveLength(books.state.bankAccounts.length);
    for (const b of books.state.bankAccounts) {
      const item = s.items.find((i) => i.bank_account_id === b.id)!;
      expect(item.ledger_balance_base).toBeCloseTo(gl.get(b.gl_account_id) ?? 0, 2);
      if (!isForeign(b.currency)) expect(item.ledger_balance).toBeCloseTo(item.ledger_balance_base, 2);
      expect(item.statement_difference).toBeCloseTo(b.statement_balance - item.ledger_balance, 2);
    }
    expect(s.total_base).toBeCloseTo(s.items.reduce((t, i) => t + i.ledger_balance_base, 0), 2);
    expect(s.unmatched_lines).toBe(books.state.statementLines.filter((l) => l.status !== "MATCHED").length);
    expect(s.out_of_agreement).toBe(s.items.filter((i) => i.statement_difference !== 0).length);
  });
});

describe("GET /bank-accounts/activity", () => {
  it("lists ledger journals touching a bank account, newest first", () => {
    const res = get<{ items: BankActivityItem[] }>("/bank-accounts/activity", { size: "100" });
    const bankGl = new Set(books.state.bankAccounts.map((b) => b.gl_account_id));
    const expected = books.state.journals.filter((j) => affectsLedger(j) && j.lines.some((l) => bankGl.has(l.account_id)));
    expect(res.pagination.total).toBe(expected.length);
    const dates = res.data.items.map((i) => i.date);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it("scopes amounts to one account when filtered", () => {
    const bank = feedBank();
    const { items } = get<{ items: BankActivityItem[] }>("/bank-accounts/activity", { bank_account_id: bank.id, size: "100" }).data;
    expect(items.length).toBeGreaterThan(0);
    for (const a of items) {
      expect(a.bank_account_id).toBe(bank.id);
      const j = books.state.journals.find((x) => x.id === a.journal_id)!;
      const net = j.lines.filter((l) => l.account_id === bank.gl_account_id).reduce((t, l) => t + l.debit - l.credit, 0);
      expect(a.amount_base).toBeCloseTo(net, 2);
    }
  });
});

describe("GET /reconciliation/get", () => {
  it("explains the statement balance from the ledger, candidates and unmatched lines", () => {
    const bank = feedBank();
    const r = get<BankReconciliation>("/reconciliation/get", { bank_account_id: bank.id }).data;
    const lines = books.state.statementLines.filter((l) => l.bank_account_id === bank.id);
    expect(r.lines).toHaveLength(lines.length);
    expect(r.counts.MATCHED + r.counts.SUGGESTED + r.counts.UNMATCHED).toBe(lines.length);
    expect(r.adjusted_balance).toBeCloseTo(r.ledger_balance - r.ledger_only_total + r.statement_only, 2);
    expect(r.difference).toBeCloseTo(r.statement_balance - r.adjusted_balance, 2);
    const matched = new Set(lines.map((l) => l.matched_journal_id).filter(Boolean));
    for (const c of r.candidates) expect(matched.has(c.journal_id)).toBe(false);
    for (const l of r.lines.filter((x) => x.matched_journal_id)) {
      expect(l.matched_journal_number).toBe(books.state.journals.find((j) => j.id === l.matched_journal_id)?.number);
    }
  });

  it("requires bank_account_id and 404s an unknown account", () => {
    expect(() => get("/reconciliation/get")).toThrow(/bank_account_id/);
    expect(() => get("/reconciliation/get", { bank_account_id: "ba_nope" })).toThrow(/not found/);
  });
});

describe("POST /bank-statement-lines/preview", () => {
  it("flags lines already held with the import's rule and does not change state", () => {
    const bank = feedBank();
    const held = books.state.statementLines.find((l) => l.bank_account_id === bank.id)!;
    const before = books.state.statementLines.length;
    const fresh = { date: DEMO_TODAY, description: "COT  CHARGES ", amount: -15 };
    const p = call<StatementImportPreview>("POST", "/bank-statement-lines/preview", {}, {
      bank_account_id: bank.id,
      lines: [{ date: held.date, description: ` ${held.description} `, amount: held.amount }, fresh],
    }).data;
    expect(p.held).toEqual([true, false]);
    expect(p.new_count).toBe(1);
    expect(p.duplicate_count).toBe(1);
    expect(p.brought_forward).toBe(bank.statement_balance);
    expect(p.expected_closing).toBeCloseTo(bank.statement_balance + (DEMO_TODAY > bank.statement_date ? fresh.amount : 0), 2);
    expect(books.state.statementLines.length).toBe(before);
  });
});

describe("GET /revaluations/list", () => {
  it("adds the period name and both journal numbers", () => {
    const period = books.state.periods.filter((p) => p.end_date < DEMO_TODAY && p.status === "OPEN").at(-1);
    if (period && !books.state.fxRevaluations.some((r) => r.period_id === period.id)) {
      const res = books.engine.runRevaluation(period.id);
      if (res.ok) expectOk(res);
    }
    const { items } = get<{ items: RevaluationListItem[] }>("/revaluations/list").data;
    for (const r of items) {
      expect(r.period_name).toBe(books.state.periods.find((p) => p.id === r.period_id)?.name);
      expect(r.journal_number).toBe(books.state.journals.find((j) => j.id === r.journal_id)?.number);
      expect(r.reversal_journal_number).toBe(books.state.journals.find((j) => j.id === r.reversal_journal_id)?.number);
    }
  });
});
