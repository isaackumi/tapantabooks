import { describe, expect, it } from "vitest";
import {
  detectColumns,
  detectDateFormat,
  parseAmount,
  parseStatementDate,
  parseStatementRows,
  partitionNewLines,
} from "@/lib/bankStatementCsv";

describe("detectColumns", () => {
  it("finds a signed amount column", () => {
    expect(detectColumns(["Txn Date", "Narration", "Amount", "Ref No"])).toEqual({
      date: 0,
      description: 1,
      amount: 2,
      money_in: -1,
      money_out: -1,
      reference: 3,
    });
  });

  it("prefers split debit and credit columns over an amount column", () => {
    const cols = detectColumns(["Value Date", "Details", "Debit", "Credit", "Amount"]);
    expect(cols).toMatchObject({ money_out: 2, money_in: 3, amount: -1 });
  });
});

describe("parseStatementDate", () => {
  it.each([
    ["05/10/2026", "DD/MM/YYYY", "2026-10-05"],
    ["10/05/2026", "MM/DD/YYYY", "2026-10-05"],
    ["2026-10-05", "YYYY-MM-DD", "2026-10-05"],
    ["5-Oct-2026", "DD-MMM-YYYY", "2026-10-05"],
    ["05 October 26", "DD-MMM-YYYY", "2026-10-05"],
    ["31/02/2026", "DD/MM/YYYY", null],
    ["2026/13/01", "YYYY-MM-DD", null],
    ["yesterday", "DD/MM/YYYY", null],
  ] as const)("%s as %s → %s", (value, format, expected) => {
    expect(parseStatementDate(value, format)).toBe(expected);
  });
});

describe("detectDateFormat", () => {
  it("picks day-first when every sample fits both day- and month-first", () => {
    expect(detectDateFormat(["01/02/2026", "03/04/2026"])).toBe("DD/MM/YYYY");
  });

  it("picks month-first when a day above 12 rules day-first out", () => {
    expect(detectDateFormat(["09/30/2026", "10/01/2026"])).toBe("MM/DD/YYYY");
  });

  it("recognises ISO dates", () => {
    expect(detectDateFormat(["2026-09-30"])).toBe("YYYY-MM-DD");
  });
});

describe("parseAmount", () => {
  it.each([
    ["1,234.50", 1234.5],
    ["GH₵ 1,234.50", 1234.5],
    ["(250.00)", -250],
    ["-250", -250],
    ["250.00 DR", -250],
    ["250.00 CR", 250],
    ["", 0],
    ["n/a", null],
  ])("%s → %s", (value, expected) => {
    expect(parseAmount(value)).toBe(expected);
  });
});

describe("parseStatementRows", () => {
  it("reads split columns as money in minus money out and reports skipped rows", () => {
    const cols = detectColumns(["Date", "Description", "Money out", "Money in"]);
    const { lines, skipped } = parseStatementRows(
      [
        ["01/10/2026", "  POS   PURCHASE ", "120.00", ""],
        ["02/10/2026", "Transfer from client", "", "1,000.00"],
        ["03/10/2026", "Balance brought forward", "", ""],
        ["32/10/2026", "Bad date", "1", ""],
        ["04/10/2026", "", "5", ""],
      ],
      cols,
      "DD/MM/YYYY",
    );
    expect(lines).toEqual([
      { date: "2026-10-01", description: "POS PURCHASE", amount: -120 },
      { date: "2026-10-02", description: "Transfer from client", amount: 1000 },
    ]);
    expect(skipped.map((s) => s.row)).toEqual([3, 4, 5]);
  });
});

describe("partitionNewLines", () => {
  it("treats lines as duplicates only as many times as they are already held", () => {
    const held = [{ date: "2026-10-01", amount: -36, description: "SMS ALERT CHARGES" }];
    const incoming = [
      { date: "2026-10-01", amount: -36, description: "sms  alert charges" },
      { date: "2026-10-01", amount: -36, description: "SMS ALERT CHARGES" },
      { date: "2026-10-02", amount: -36, description: "SMS ALERT CHARGES" },
    ];
    const { fresh, duplicates } = partitionNewLines(held, incoming);
    expect(duplicates).toHaveLength(1);
    expect(fresh).toEqual(incoming.slice(1));
  });
});
