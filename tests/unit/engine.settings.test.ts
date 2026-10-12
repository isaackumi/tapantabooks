import { describe, expect, it } from "vitest";
import { ACC } from "@/mock/seed";
import { demoBooks, expectFail, expectOk } from "./helpers";

describe("dimensions", () => {
  it("can be renamed and described but keep their code", () => {
    const books = demoBooks();
    const dim = books.state.dimensions[0];
    expectFail(books.engine.updateDimension(dim.id, { name: " " }), /Name is required/);
    const saved = expectOk(books.engine.updateDimension(dim.id, { name: "Renamed", description: "Head office" }));
    expect(saved).toMatchObject({ code: dim.code, name: "Renamed", description: "Head office" });
    expect(books.state.auditEvents[0]).toMatchObject({ action: "DIMENSION.UPDATED", entity_id: dim.id });

    expectOk(books.engine.toggleDimension(dim.id));
    expect(books.state.auditEvents[0].action).toBe("DIMENSION.DEACTIVATED");
  });
});

describe("currencies", () => {
  it("can be renamed and given a new symbol", () => {
    const books = demoBooks();
    expectFail(books.engine.updateCurrency("USD", { symbol: "USDOLLAR" }), /four characters/);
    const usd = expectOk(books.engine.updateCurrency("USD", { name: "US dollar (cash)", symbol: "" }));
    expect(usd).toMatchObject({ code: "USD", name: "US dollar (cash)", symbol: "USD" });
    expect(books.state.auditEvents[0].action).toBe("CURRENCY.UPDATED");
  });
});

describe("account deactivation", () => {
  it("is refused while the account is in use", () => {
    const books = demoBooks();
    expectFail(books.engine.updateAccount(ACC.gcb, { is_active: false }), /ledger account for .*Deactivate the bank account/);
    expectFail(books.engine.updateAccount(ACC.rent, { is_active: false }), /has a balance of/);
    const group = books.state.accounts.find((a) => a.id === books.state.accounts.find((x) => x.id === ACC.rent)!.parent_id)!;
    expectFail(books.engine.updateAccount(group.id, { is_active: false }), /still has active accounts under it/);
  });

  it("is allowed for an unused account, and reactivation needs an active group", () => {
    const books = demoBooks();
    const parent = books.state.accounts.find((a) => a.id === ACC.rent)!.parent_id!;
    const spare = expectOk(books.engine.createAccount({ code: "6990", name: "Spare expense", parent_id: parent, subtype: "OPERATING_EXPENSE" }));
    expectOk(books.engine.updateAccount(spare.id, { is_active: false }));
    expectOk(books.engine.updateAccount(spare.id, { is_active: true }));

    expectOk(books.engine.updateOrg({ default_purchase_account_id: spare.id }));
    expectFail(books.engine.updateAccount(spare.id, { is_active: false }), /default purchase account/);
  });
});
