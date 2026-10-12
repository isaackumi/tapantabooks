import { describe, expect, it } from "vitest";
import { DEMO_TODAY } from "@/utils/dates";
import { demoBooks, expectFail, expectOk } from "./helpers";

const fidelity = { name: "Fidelity Collections", bank: "Fidelity Bank Ghana", account_number: "••••5521", currency: "GHS" };

describe("bank accounts", () => {
  it("open their own ledger account on the next free cash code", () => {
    const books = demoBooks();
    const bank = expectOk(books.engine.createBankAccount(fidelity));
    const gl = books.state.accounts.find((a) => a.id === bank.gl_account_id)!;
    expect(gl).toMatchObject({ code: "1060", name: "Fidelity Collections", type: "ASSET", is_bank: true, is_active: true });
    expect(bank).toMatchObject({ is_active: true, statement_balance: 0, last_reconciled_at: null });
    expectFail(books.engine.createBankAccount({ ...fidelity, name: "fidelity collections" }), /already exists/);
  });

  it("link an existing bank ledger account only once", () => {
    const books = demoBooks();
    const cash = books.state.bankAccounts.find((b) => b.id === "ba_cash")!;
    expectFail(books.engine.createBankAccount({ ...fidelity, gl_account_id: cash.gl_account_id }), /already linked/);
    expectFail(books.engine.createBankAccount({ ...fidelity, gl_account_id: "acc_1100" }), /bank or cash ledger account/);
  });

  it("refuse a foreign currency that is switched off", () => {
    const books = demoBooks();
    const off = books.state.currencies.find((c) => !c.is_active);
    if (off) expectFail(books.engine.createBankAccount({ ...fidelity, currency: off.code }), /not switched on/);
  });

  it("deactivate only when empty and reconciled, and then refuse new money", () => {
    const books = demoBooks();
    expectFail(books.engine.updateBankAccount("ba_eco", { is_active: false }), /still holds/);

    const bank = expectOk(books.engine.createBankAccount(fidelity));
    expectOk(books.engine.transferFunds({ from: "ba_gcb", to: bank.id, amount: 100, date: DEMO_TODAY, memo: "Float" }));
    expectFail(books.engine.updateBankAccount(bank.id, { is_active: false }), /still holds GH₵\s?100\.00/);
    expectOk(books.engine.transferFunds({ from: bank.id, to: "ba_gcb", amount: 100, date: DEMO_TODAY, memo: "Back" }));

    expectOk(books.engine.updateBankAccount(bank.id, { is_active: false }));
    expect(books.state.accounts.find((a) => a.id === bank.gl_account_id)?.is_active).toBe(false);
    expectFail(books.engine.transferFunds({ from: "ba_gcb", to: bank.id, amount: 5, date: DEMO_TODAY, memo: "x" }), /inactive/);

    expectOk(books.engine.updateBankAccount(bank.id, { is_active: true }));
    expectOk(books.engine.transferFunds({ from: "ba_gcb", to: bank.id, amount: 5, date: DEMO_TODAY, memo: "x" }));
  });

  it("keep their currency once they have activity, and rename the ledger account with them", () => {
    const books = demoBooks();
    const bank = expectOk(books.engine.createBankAccount(fidelity));
    expectOk(books.engine.updateBankAccount(bank.id, { name: "Fidelity Main" }));
    expect(books.state.accounts.find((a) => a.id === bank.gl_account_id)?.name).toBe("Fidelity Main");
    expectOk(books.engine.transferFunds({ from: "ba_gcb", to: bank.id, amount: 10, date: DEMO_TODAY, memo: "Float" }));
    expectFail(books.engine.updateBankAccount(bank.id, { currency: "USD" }), /already has postings/);
  });
});
