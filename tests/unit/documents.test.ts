import { describe, expect, it } from "vitest";
import { ageingBucket, displayStatus, documentTotals } from "@/lib/documents";
import { createInitialState } from "@/mock/api/engine";
import { ACC, TAX } from "@/mock/seed";

const taxCodes = createInitialState().taxCodes;
const line = (quantity: number, unit_price: number, tax_code_id: string) => ({
  id: "l",
  description: "x",
  quantity,
  unit_price,
  tax_code_id,
  account_id: ACC.sales,
});

describe("documentTotals", () => {
  it("adds standard-rated tax at 20% and groups it by tax code", () => {
    const t = documentTotals([line(2, 500, TAX.std), line(1, 250, TAX.std)], taxCodes);
    expect(t).toEqual({ subtotal: 1250, tax: 250, total: 1500, taxByCode: [{ tax_code_id: TAX.std, amount: 250 }] });
  });

  it("charges no tax on exempt lines", () => {
    const t = documentTotals([line(3, 100, TAX.exempt), line(1, 100, TAX.std)], taxCodes);
    expect(t.subtotal).toBe(400);
    expect(t.tax).toBe(20);
    expect(t.total).toBe(420);
  });

  it("rounds each line to the cent", () => {
    expect(documentTotals([line(3, 0.335, TAX.exempt)], taxCodes).subtotal).toBe(1.01);
  });
});

describe("displayStatus", () => {
  const doc = (state: "DRAFT" | "APPROVED" | "VOID", amount_paid: number, due_date = "2026-10-10") => ({ state, amount_paid, due_date });

  it("follows state, payment and due date in that order", () => {
    expect(displayStatus(doc("VOID", 0), 100, "2026-10-05")).toBe("VOID");
    expect(displayStatus(doc("DRAFT", 0), 100, "2026-10-05")).toBe("DRAFT");
    expect(displayStatus(doc("APPROVED", 100, "2026-01-01"), 100, "2026-10-05")).toBe("PAID");
    expect(displayStatus(doc("APPROVED", 40, "2026-10-01"), 100, "2026-10-05")).toBe("OVERDUE");
    expect(displayStatus(doc("APPROVED", 40), 100, "2026-10-05")).toBe("PARTIALLY_PAID");
    expect(displayStatus(doc("APPROVED", 0), 100, "2026-10-05")).toBe("OPEN");
  });
});

describe("ageingBucket", () => {
  it.each([
    ["2026-10-05", "Current"],
    ["2026-10-04", "1–30 days"],
    ["2026-09-05", "1–30 days"],
    ["2026-09-04", "31–60 days"],
    ["2026-08-06", "31–60 days"],
    ["2026-08-05", "61–90 days"],
    ["2026-07-07", "61–90 days"],
    ["2026-07-06", "90+ days"],
  ])("due %s is %s on 2026-10-05", (due, bucket) => {
    expect(ageingBucket(due, "2026-10-05")).toBe(bucket);
  });
});
