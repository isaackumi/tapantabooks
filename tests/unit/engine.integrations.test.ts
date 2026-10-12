import { describe, expect, it } from "vitest";
import { ACC } from "@/mock/seed";
import { demoBooks, expectFail, expectOk } from "./helpers";

const feeRule = {
  name: "Loan fee charged",
  event: "loans.fee.charged",
  source_id: "ds_loans",
  lines: [
    { side: "DEBIT" as const, account_id: ACC.ar, basis: "FEES" as const, label: "Fee receivable" },
    { side: "CREDIT" as const, account_id: ACC.sales, basis: "FEES" as const, label: "Fee income" },
  ],
  sample: { FEES: 50 },
};

describe("posting rules", () => {
  it("are saved only when the sample balances", () => {
    const books = demoBooks();
    expectFail(books.engine.saveRule({ ...feeRule, event: "Loans Fee" }), /dotted lower case/);
    expectFail(
      books.engine.saveRule({ ...feeRule, lines: [feeRule.lines[0], { ...feeRule.lines[1], basis: "TOTAL" }], sample: { FEES: 50, TOTAL: 60 } }),
      /debits of .* and credits of/,
    );
    const rule = expectOk(books.engine.saveRule(feeRule));
    expect(rule).toMatchObject({ is_active: true, postings_count: 0, sample: { FEES: 50 } });
    expectFail(books.engine.saveRule(feeRule), /already handles loans\.fee\.charged/);
  });

  it("keep event and source once they have posted, and cannot then be deleted", () => {
    const books = demoBooks();
    const used = books.state.rules.find((r) => r.postings_count > 0)!;
    const base = { name: used.name, event: used.event, source_id: used.source_id, lines: used.lines, sample: used.sample };
    expectFail(books.engine.saveRule({ ...base, event: "store.sale.closed" }, used.id), /event and source are fixed/);
    expectOk(books.engine.saveRule({ ...base, name: "Store sale (renamed)" }, used.id));
    expectFail(books.engine.deleteRule(used.id), /Deactivate it instead/);

    const unused = expectOk(books.engine.saveRule(feeRule));
    expectOk(books.engine.deleteRule(unused.id));
    expect(books.state.rules.some((r) => r.id === unused.id)).toBe(false);
  });
});

describe("data sources", () => {
  it("can be added, and removed only while unused and disconnected", () => {
    const books = demoBooks();
    const src = expectOk(books.engine.addSource({ name: "Hubtel POS", provider: "Hubtel", kind: "API", entities: ["Sales", " "] }));
    expect(src).toMatchObject({ status: "NOT_CONNECTED", entities: ["Sales"] });
    expectFail(books.engine.addSource({ name: "hubtel pos", provider: "Hubtel", kind: "API", entities: ["Sales"] }), /already exists/);

    expectOk(books.engine.connectSource(src.id, { entities: ["Sales"], schedule: "Hourly", connection: { Endpoint: "https://x" } }));
    expectFail(books.engine.removeSource(src.id), /Disconnect Hubtel POS/);
    expectOk(books.engine.disconnectSource(src.id));
    expectOk(books.engine.saveRule({ ...feeRule, source_id: src.id }));
    expectFail(books.engine.removeSource(src.id), /posting rule\(s\) use/);

    const store = books.state.dataSources.find((d) => d.kind === "TROVESUITE")!;
    expectFail(books.engine.removeSource(store.id), /part of Trovesuite/);
  });
});
