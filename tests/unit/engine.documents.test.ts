import { describe, expect, it } from "vitest";
import { isBalanced } from "@/lib/ledger";
import { partyStatement } from "@/lib/statements";
import { ACC, TAX } from "@/mock/seed";
import { DEMO_TODAY } from "@/utils/dates";
import { demoBooks, expectFail, expectOk, outstanding } from "./helpers";

const setup = () => {
  const books = demoBooks();
  const customer = books.state.customers.find((c) => c.status === "ACTIVE" && c.currency === "GHS")!;
  const invoice = expectOk(
    books.engine.createInvoice(
      {
        party_id: customer.id,
        issue_date: "2026-10-01",
        due_date: "2026-10-31",
        branch_id: null,
        currency: "GHS",
        exchange_rate: 1,
        lines: [{ description: "Rice – 25kg bags", quantity: 2, unit_price: 500, tax_code_id: TAX.std, account_id: ACC.sales }],
      },
      true,
    ),
  );
  return { books, customer, invoice };
};

const receipt = (documentId: string, amount: number, date = DEMO_TODAY) => ({
  document_id: documentId,
  date,
  amount,
  exchange_rate: 1,
  method: "BANK_TRANSFER" as const,
  bank_account_id: "ba_gcb",
});

describe("sales invoices", () => {
  it("post Dr receivables, Cr sales and Cr VAT output on approval", () => {
    const { books, invoice } = setup();
    const j = books.state.journals.find((x) => x.id === invoice.journal_id)!;
    expect(isBalanced(j.lines)).toBe(true);
    const on = (account: string) => j.lines.find((l) => l.account_id === account);
    expect(on(ACC.ar)).toMatchObject({ debit: 1200, credit: 0 });
    expect(on(ACC.sales)).toMatchObject({ debit: 0, credit: 1000 });
    expect(on(ACC.vatOut)).toMatchObject({ debit: 0, credit: 200 });
    expect(j.source).toMatchObject({ type: "SALES", document_id: invoice.id });
  });

  it("take receipts up to the amount outstanding", () => {
    const { books, invoice } = setup();
    expectFail(books.engine.recordPayment("receipt", receipt(invoice.id, 1200.01)), /more than/);
    expectFail(books.engine.recordPayment("receipt", receipt(invoice.id, 100, "2026-09-30")), /before the document date/);
    const r = expectOk(books.engine.recordPayment("receipt", receipt(invoice.id, 700)));
    expect(r.number).toMatch(/^RCT-2026-\d{4}$/);
    const inv = books.state.invoices.find((i) => i.id === invoice.id)!;
    expect(outstanding(books.state, inv)).toBe(500);
  });

  it("cannot be voided once something has been paid or credited", () => {
    const { books, invoice } = setup();
    expectOk(books.engine.recordPayment("receipt", receipt(invoice.id, 100)));
    expectFail(books.engine.voidDocument("invoice", invoice.id, "Raised in error"), /Reverse those first/);
  });

  it("void by reversing their journal when unpaid", () => {
    const { books, invoice } = setup();
    expectOk(books.engine.voidDocument("invoice", invoice.id, "Raised in error"));
    expect(books.state.invoices.find((i) => i.id === invoice.id)?.state).toBe("VOID");
    expect(books.state.journals.find((j) => j.id === invoice.journal_id)?.status).toBe("REVERSED");
  });
});

describe("credit notes", () => {
  const credit = (documentId: string, unitPrice: number) => ({
    document_id: documentId,
    date: DEMO_TODAY,
    reason: "Two bags damaged",
    lines: [{ description: "Damaged bags", quantity: 1, unit_price: unitPrice, tax_code_id: TAX.std, account_id: ACC.sales }],
  });

  it("are capped at what is still owed and reduce it", () => {
    const { books, invoice } = setup();
    expectOk(books.engine.recordPayment("receipt", receipt(invoice.id, 700)));
    expectFail(books.engine.createCreditNote("customer", credit(invoice.id, 500)), /more than the .* still owed/);

    const note = expectOk(books.engine.createCreditNote("customer", credit(invoice.id, 250)));
    expect(note.number).toMatch(/^CN-2026-\d{4}$/);
    const inv = () => books.state.invoices.find((i) => i.id === invoice.id)!;
    expect(outstanding(books.state, inv())).toBe(200);

    const j = books.state.journals.find((x) => x.id === note.journal_id)!;
    expect(j.lines.find((l) => l.account_id === ACC.ar)).toMatchObject({ debit: 0, credit: 300 });

    expectOk(books.engine.voidCreditNote("customer", note.id, "Issued in error"));
    expect(outstanding(books.state, inv())).toBe(500);
    expect(books.state.journals.find((x) => x.id === note.journal_id)?.status).toBe("REVERSED");
  });
});

describe("customer statements", () => {
  it("close at what each customer owes, in every currency", () => {
    const { books } = setup();
    const s = books.state;
    for (const c of s.customers) {
      const currencies = new Set(s.invoices.filter((i) => i.customer_id === c.id && i.state === "APPROVED").map((i) => i.currency));
      for (const currency of currencies) {
        const st = partyStatement(s, "CUSTOMER", c.id, "2026-01-01", DEMO_TODAY, currency)!;
        const owed = s.invoices
          .filter((i) => i.customer_id === c.id && i.state === "APPROVED" && i.currency === currency && i.issue_date <= DEMO_TODAY)
          .reduce((t, i) => t + outstanding(s, i), 0);
        expect(st.closing_balance, `${c.name} ${currency}`).toBeCloseTo(owed, 2);
        expect(st.ageing.total, `${c.name} ${currency} ageing`).toBeCloseTo(owed, 2);
      }
    }
  });

  it("chain: the closing balance of one period is the opening of the next", () => {
    const { books, customer } = setup();
    const a = partyStatement(books.state, "CUSTOMER", customer.id, "2026-01-01", "2026-06-30", "GHS")!;
    const b = partyStatement(books.state, "CUSTOMER", customer.id, "2026-07-01", DEMO_TODAY, "GHS")!;
    expect(b.opening_balance).toBe(a.closing_balance);
  });
});
