import { describe, expect, it } from "vitest";
import { ACC } from "@/mock/seed";
import { DEMO_TODAY } from "@/utils/dates";
import { demoBooks, expectFail, expectOk } from "./helpers";

const BANK = "ba_gcb";

describe("bank statement import", () => {
  it("validates the statement before importing anything", () => {
    const books = demoBooks();
    const base = { bank_account_id: BANK, statement_date: DEMO_TODAY, closing_balance: 0, lines: [{ date: DEMO_TODAY, description: "Fee", amount: -5 }] };
    expectFail(books.engine.importStatementLines({ ...base, lines: [] }), /no lines/);
    expectFail(books.engine.importStatementLines({ ...base, statement_date: "2026-10-06" }), /future/);
    expectFail(books.engine.importStatementLines({ ...base, statement_date: "2026-01-31" }), /already has a statement/);
    expectFail(
      books.engine.importStatementLines({ ...base, lines: [{ date: "2026-10-31", description: "", amount: 0 }] }),
      /line 1: dated after.*line 1: description is empty.*line 1: amount must be/,
    );
    expect(books.state.auditEvents.some((e) => e.action === "BANK_STATEMENT.IMPORTED")).toBe(false);
  });

  it("imports new lines, skips ones already held and suggests ledger matches", () => {
    const books = demoBooks();
    const bank = books.state.bankAccounts.find((b) => b.id === BANK)!;
    const held = books.state.statementLines.find((l) => l.bank_account_id === BANK)!;

    const posted = expectOk(
      books.engine.createJournal(
        {
          date: "2026-10-02",
          memo: "Bank charges",
          branch_id: null,
          lines: [
            { account_id: ACC.bankCharges, debit: 45, credit: 0 },
            { account_id: ACC.gcb, debit: 0, credit: 45 },
          ],
        },
        "POST",
      ),
    );

    // New lines are dated after the previous statement (2026-10-04), so they count towards the expected closing balance.
    const lines = [
      { date: held.date, description: held.description.toLowerCase(), amount: held.amount },
      { date: DEMO_TODAY, description: "COMMISSION ON TURNOVER", amount: -45 },
      { date: DEMO_TODAY, description: "MOMO TRANSFER IN", amount: 1250 },
    ];
    const newLinesTotal = -45 + 1250;
    const result = expectOk(
      books.engine.importStatementLines({ bank_account_id: BANK, statement_date: DEMO_TODAY, closing_balance: bank.statement_balance + newLinesTotal, lines }),
    );
    expect(result).toMatchObject({ imported: 2, duplicates: 1, suggested: 1, balance_difference: 0 });
    expect(result.lines.find((l) => l.amount === -45)).toMatchObject({ status: "SUGGESTED", suggested_journal_id: posted.id });
    expect(result.lines.find((l) => l.amount === 1250)?.status).toBe("UNMATCHED");

    const after = books.state.bankAccounts.find((b) => b.id === BANK)!;
    expect(after).toMatchObject({ statement_date: DEMO_TODAY, statement_balance: bank.statement_balance + newLinesTotal });

    const again = expectOk(
      books.engine.importStatementLines({ bank_account_id: BANK, statement_date: DEMO_TODAY, closing_balance: after.statement_balance, lines }),
    );
    expect(again).toMatchObject({ imported: 0, duplicates: 3 });
  });
});
