import type {
  DocumentDisplayStatus,
  DocumentLine,
  DocumentState,
  TaxCode,
} from "@/models/accounting";
import { round2 } from "@/utils/format";
import { daysBetween } from "@/utils/dates";

export interface DocumentTotals {
  subtotal: number;
  tax: number;
  total: number;
  /** Tax grouped by tax code, used to post one line per tax account. */
  taxByCode: { tax_code_id: string; amount: number }[];
}

export const lineAmount = (l: Pick<DocumentLine, "quantity" | "unit_price">) =>
  round2((Number(l.quantity) || 0) * (Number(l.unit_price) || 0));

export const documentTotals = (lines: DocumentLine[], taxCodes: TaxCode[]): DocumentTotals => {
  const rates = new Map(taxCodes.map((t) => [t.id, t]));
  let subtotal = 0;
  const taxMap = new Map<string, number>();
  for (const l of lines) {
    const amount = lineAmount(l);
    subtotal += amount;
    const code = rates.get(l.tax_code_id);
    if (code && code.kind === "OUTPUT_INPUT" && code.rate > 0) {
      taxMap.set(code.id, (taxMap.get(code.id) ?? 0) + amount * code.rate);
    }
  }
  const taxByCode = [...taxMap.entries()].map(([tax_code_id, amount]) => ({
    tax_code_id,
    amount: round2(amount),
  }));
  const tax = round2(taxByCode.reduce((s, t) => s + t.amount, 0));
  return { subtotal: round2(subtotal), tax, total: round2(subtotal + tax), taxByCode };
};

export const displayStatus = (
  doc: { state: DocumentState; due_date: string; amount_paid: number },
  total: number,
  today: string,
): DocumentDisplayStatus => {
  if (doc.state === "VOID") return "VOID";
  if (doc.state === "DRAFT") return "DRAFT";
  if (doc.amount_paid >= total - 0.005) return "PAID";
  if (doc.due_date < today) return "OVERDUE";
  if (doc.amount_paid > 0) return "PARTIALLY_PAID";
  return "OPEN";
};

export const AGEING_BUCKETS = ["Current", "1–30 days", "31–60 days", "61–90 days", "90+ days"] as const;
export type AgeingBucket = (typeof AGEING_BUCKETS)[number];

export const ageingBucket = (dueDate: string, today: string): AgeingBucket => {
  const overdue = daysBetween(dueDate, today);
  if (overdue <= 0) return "Current";
  if (overdue <= 30) return "1–30 days";
  if (overdue <= 60) return "31–60 days";
  if (overdue <= 90) return "61–90 days";
  return "90+ days";
};

export const emptyAgeing = (): Record<AgeingBucket, number> => ({
  Current: 0,
  "1–30 days": 0,
  "31–60 days": 0,
  "61–90 days": 0,
  "90+ days": 0,
});
