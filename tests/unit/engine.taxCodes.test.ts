import { describe, expect, it } from "vitest";
import { ACC, TAX } from "@/mock/seed";
import { demoBooks, expectFail, expectOk } from "./helpers";

const tourism = { code: "gh-tour", name: "Tourism levy", rate: 0.01, kind: "OUTPUT_INPUT" as const, output_account_id: ACC.vatOut };

describe("tax codes", () => {
  it("are added with an upper-case unique code and a liability output account", () => {
    const books = demoBooks();
    const tax = expectOk(books.engine.createTaxCode(tourism));
    expect(tax).toMatchObject({ code: "GH-TOUR", rate: 0.01, is_active: true, input_account_id: null });
    expectFail(books.engine.createTaxCode(tourism), /already used/);
    expectFail(books.engine.createTaxCode({ ...tourism, code: "X-1", output_account_id: ACC.sales }), /not a liability account/);
    expectFail(books.engine.createTaxCode({ ...tourism, code: "X-2", rate: 1.5 }), /between 0%/);
    const exempt = expectOk(books.engine.createTaxCode({ ...tourism, code: "X-3", kind: "EXEMPT", rate: 0.2 }));
    expect(exempt).toMatchObject({ rate: 0, output_account_id: null });
  });

  it("keep their rate once a document uses them", () => {
    const books = demoBooks();
    const tax = expectOk(books.engine.createTaxCode(tourism));
    expectOk(books.engine.updateTaxCode(tax.id, { rate: 0.02, name: "Tourism levy (new)" }));
    expectFail(books.engine.updateTaxCode(TAX.std, { rate: 0.21 }), /fixed\. Add a new code/);
    expectOk(books.engine.updateTaxCode(TAX.std, { description: "VAT 15% + NHIL + GETFund" }));
  });

  it("cannot deactivate the default, and inactive codes are refused on documents", () => {
    const books = demoBooks();
    const defaultId = books.state.org.default_sales_tax_code_id;
    if (defaultId) expectFail(books.engine.updateTaxCode(defaultId, { is_active: false }), /default sales tax code/);

    const tax = expectOk(books.engine.createTaxCode(tourism));
    expectOk(books.engine.updateTaxCode(tax.id, { is_active: false }));
    const customer = books.state.customers.find((c) => c.status === "ACTIVE" && c.currency === "GHS")!;
    expectFail(
      books.engine.createInvoice(
        {
          party_id: customer.id,
          issue_date: "2026-10-01",
          due_date: "2026-10-31",
          branch_id: null,
          currency: "GHS",
          exchange_rate: 1,
          lines: [{ description: "Room night", quantity: 1, unit_price: 100, tax_code_id: tax.id, account_id: ACC.sales }],
        },
        false,
      ),
      /GH-TOUR is inactive/,
    );
  });
});
