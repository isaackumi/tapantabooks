import { describe, expect, it } from "vitest";
import { trialBalance } from "@/lib/ledger";
import { ACC } from "@/mock/seed";
import { DEMO_TODAY } from "@/utils/dates";
import { demoBooks, expectFail, expectOk } from "./helpers";

const entry = (amount: number, date = DEMO_TODAY) => ({
  date,
  memo: "Office rent accrual",
  branch_id: null,
  lines: [
    { account_id: ACC.rent, debit: amount, credit: 0 },
    { account_id: ACC.accrued, debit: 0, credit: amount },
  ],
});

describe("manual journals", () => {
  it("post straight away below the approval threshold and write an audit event", () => {
    const books = demoBooks();
    const j = expectOk(books.engine.createJournal(entry(1000), "POST"));
    expect(j.status).toBe("POSTED");
    expect(j.number).toMatch(/^JE-2026-\d{4}$/);
    expect(books.state.auditEvents[0]).toMatchObject({ action: "JOURNAL.POSTED", entity_id: j.id });
  });

  it("go to approval at the threshold and cannot be approved by the preparer", () => {
    const books = demoBooks();
    const threshold = books.state.org.approval_threshold;
    const j = expectOk(books.engine.createJournal(entry(threshold), "POST"));
    expect(j.status).toBe("PENDING_APPROVAL");
    expectFail(books.engine.approveJournal(j.id), /maker-checker/);

    books.actAs("kofi");
    const approved = expectOk(books.engine.approveJournal(j.id));
    expect(approved).toMatchObject({ status: "POSTED", approved_by: "Kofi Boateng" });
  });

  it("can be rejected back to draft with a reason, then deleted", () => {
    const books = demoBooks();
    const j = expectOk(books.engine.createJournal(entry(books.state.org.approval_threshold + 1), "POST"));
    books.actAs("kofi");
    expectFail(books.engine.rejectJournal(j.id, "  "), /why/);
    expect(expectOk(books.engine.rejectJournal(j.id, "Wrong period")).status).toBe("DRAFT");
    expectOk(books.engine.deleteDraftJournal(j.id));
    expect(books.state.journals.some((x) => x.id === j.id)).toBe(false);
  });

  it("reject unbalanced lines, control accounts, locked periods and future dates", () => {
    const { engine } = demoBooks();
    const unbalanced = { ...entry(100), lines: [entry(100).lines[0], { account_id: ACC.accrued, debit: 0, credit: 90 }] };
    expectFail(engine.createJournal(unbalanced, "POST"), /differ by/);
    const control = { ...entry(100), lines: [entry(100).lines[0], { account_id: ACC.ar, debit: 0, credit: 100 }] };
    expectFail(engine.createJournal(control, "POST"), /control account/);
    expectFail(engine.createJournal(entry(100, "2026-07-15"), "POST"), /locked/);
    expectFail(engine.createJournal(entry(100, "2026-10-06"), "POST"), /future date/);
  });

  it("allow a draft in a locked period but not posting it", () => {
    const { engine } = demoBooks();
    const draft = expectOk(engine.createJournal(entry(100, "2026-07-15"), "DRAFT"));
    expect(draft.status).toBe("DRAFT");
    expectFail(engine.submitJournal(draft.id), /locked/);
  });

  it("are reversed, never deleted, once posted", () => {
    const books = demoBooks();
    const before = trialBalance(books.state.accounts, books.state.journals, DEMO_TODAY).rows;
    const j = expectOk(books.engine.createJournal(entry(1000), "POST"));
    expectFail(books.engine.deleteDraftJournal(j.id), /Only drafts/);
    expectFail(books.engine.reverseJournal(j.id, DEMO_TODAY, ""), /reason/);

    const reversal = expectOk(books.engine.reverseJournal(j.id, DEMO_TODAY, "Duplicate"));
    expect(reversal.reversal_of_id).toBe(j.id);
    expect(books.state.journals.find((x) => x.id === j.id)?.status).toBe("REVERSED");
    expectFail(books.engine.reverseJournal(reversal.id, DEMO_TODAY, "Again"), /itself a reversal|Only posted/);

    const after = trialBalance(books.state.accounts, books.state.journals, DEMO_TODAY).rows;
    const net = (rows: typeof before, id: string) => rows.find((r) => r.account.id === id)?.debit ?? 0;
    expect(net(after, ACC.rent)).toBe(net(before, ACC.rent));
  });
});

describe("fiscal periods", () => {
  it("close in order and refuse to close with drafts in them", () => {
    const books = demoBooks();
    const period = (start: string) => books.state.periods.find((p) => p.start_date === start)!;
    expectFail(books.engine.setPeriodStatus(period("2026-08-01").id, "CLOSED"), /Close July 2026 first/);

    const draft = expectOk(books.engine.createJournal(entry(100, "2026-07-15"), "DRAFT"));
    expectFail(books.engine.setPeriodStatus(period("2026-07-01").id, "CLOSED"), new RegExp(`${draft.number} is still a draft`));
    expectOk(books.engine.deleteDraftJournal(draft.id));
    expect(expectOk(books.engine.setPeriodStatus(period("2026-07-01").id, "CLOSED")).status).toBe("CLOSED");
    expectFail(books.engine.setPeriodStatus(period("2026-06-01").id, "OPEN"), /Reopen July 2026 first/);
  });
});
