import { describe, expect, it } from "vitest";
import { ACC } from "@/mock/seed";
import { DEMO_TODAY } from "@/utils/dates";
import { demoBooks, expectFail, expectOk } from "./helpers";

const BANK = "ba_gcb";

const importTwo = (books: ReturnType<typeof demoBooks>) => {
  const bank = books.state.bankAccounts.find((b) => b.id === BANK)!;
  const before = { balance: bank.statement_balance, date: bank.statement_date };
  const result = expectOk(
    books.engine.importStatementLines({
      bank_account_id: BANK,
      statement_date: DEMO_TODAY,
      closing_balance: bank.statement_balance + 1180,
      file_name: "gcb-oct.csv",
      lines: [
        { date: DEMO_TODAY, description: "UNKNOWN DEPOSIT", amount: 1200 },
        { date: DEMO_TODAY, description: "SMS ALERT FEE", amount: -20 },
      ],
    }),
  );
  return { before, result };
};

describe("statement lines", () => {
  it("can be excluded with a reason and restored", () => {
    const books = demoBooks();
    const { result } = importTwo(books);
    const [deposit] = result.lines;
    expectFail(books.engine.excludeStatementLine(deposit.id, " "), /reason/);
    expect(expectOk(books.engine.excludeStatementLine(deposit.id, "Belongs to the sister company"))).toMatchObject({
      status: "EXCLUDED",
      exclude_reason: "Belongs to the sister company",
    });
    expectFail(books.engine.matchStatementLine(deposit.id, "anything"), /Restore it first/);
    expect(expectOk(books.engine.restoreStatementLine(deposit.id)).status).toBe("UNMATCHED");
  });

  it("from a file can be deleted, feed lines cannot", () => {
    const books = demoBooks();
    const feed = books.state.statementLines.find((l) => l.bank_account_id === BANK && !l.import_id && l.status !== "MATCHED")!;
    expectFail(books.engine.deleteStatementLine(feed.id), /Exclude it instead/);
    const { result } = importTwo(books);
    expectOk(books.engine.deleteStatementLine(result.lines[1].id));
    expect(books.state.statementLines.some((l) => l.id === result.lines[1].id)).toBe(false);
  });
});

describe("undoing a statement import", () => {
  it("removes its lines and restores the previous statement", () => {
    const books = demoBooks();
    const { before, result } = importTwo(books);
    expectOk(books.engine.undoStatementImport(BANK));
    const bank = books.state.bankAccounts.find((b) => b.id === BANK)!;
    expect(bank).toMatchObject({ statement_balance: before.balance, statement_date: before.date, last_import: null });
    expect(books.state.statementLines.some((l) => l.import_id === result.import_id)).toBe(false);
    expectFail(books.engine.undoStatementImport(BANK), /no statement import to undo/);
  });

  it("is refused while one of its lines is matched", () => {
    const books = demoBooks();
    const { result } = importTwo(books);
    const fee = result.lines[1];
    expectOk(books.engine.createEntryFromStatementLine(fee.id, ACC.bankCharges, "SMS alerts"));
    expectFail(books.engine.undoStatementImport(BANK), /1 line from this import is matched/);
  });
});

describe("completed reconciliations", () => {
  it("lock their lines until reopened with a reason", () => {
    const books = demoBooks();
    for (const l of books.state.statementLines.filter((x) => x.bank_account_id === BANK)) {
      if (l.status === "SUGGESTED" && l.suggested_journal_id) expectOk(books.engine.matchStatementLine(l.id, l.suggested_journal_id));
    }
    for (const l of books.state.statementLines.filter((x) => x.bank_account_id === BANK && (x.status === "UNMATCHED" || x.status === "SUGGESTED"))) {
      expectOk(books.engine.excludeStatementLine(l.id, "Test"));
    }
    expectOk(books.engine.completeReconciliation(BANK));
    const matched = books.state.statementLines.find((l) => l.bank_account_id === BANK && l.status === "MATCHED")!;
    expect(matched.reconciled_at).toBeTruthy();
    expectFail(books.engine.unmatchStatementLine(matched.id), /Reopen the reconciliation first/);

    expectFail(books.engine.reopenReconciliation(BANK, ""), /reason/);
    expectOk(books.engine.reopenReconciliation(BANK, "Wrong match"));
    expect(books.state.statementLines.find((l) => l.id === matched.id)?.reconciled_at).toBeNull();
    expectOk(books.engine.unmatchStatementLine(matched.id));
  });
});
