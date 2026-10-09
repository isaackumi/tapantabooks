import { isIsoDate } from "@/utils/dates";
import { round2 } from "@/utils/format";

export const DATE_FORMATS = ["DD/MM/YYYY", "YYYY-MM-DD", "MM/DD/YYYY", "DD-MMM-YYYY"] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

export interface StatementColumns {
  date: number;
  description: number;
  /** Signed amount column (negative = money out); -1 when the file uses split columns. */
  amount: number;
  money_in: number;
  money_out: number;
  reference: number;
}

export interface ParsedStatementLine {
  date: string;
  description: string;
  amount: number;
  reference?: string;
}

export interface StatementParseResult {
  lines: ParsedStatementLine[];
  /** 1-based data row numbers (the header is row 0) that will be skipped, with the reason. */
  skipped: { row: number; reason: string }[];
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z]/g, "");

const SYNONYMS: Record<keyof StatementColumns, string[]> = {
  date: ["date", "transactiondate", "txndate", "postingdate", "valuedate", "bookingdate"],
  description: ["description", "narrative", "narration", "details", "particulars", "memo", "transactiondetails"],
  amount: ["amount", "transactionamount", "value", "amountghs"],
  money_in: ["moneyin", "credit", "credits", "deposit", "deposits", "paidin", "cr", "creditamount"],
  money_out: ["moneyout", "debit", "debits", "withdrawal", "withdrawals", "paidout", "dr", "debitamount"],
  reference: ["reference", "ref", "transactionid", "txnid", "chequeno", "chequenumber", "refno"],
};

/** Guesses which column holds what from the header row. Unknown columns are -1. */
export const detectColumns = (headers: string[]): StatementColumns => {
  const names = headers.map(norm);
  const find = (key: keyof StatementColumns) => names.findIndex((n) => SYNONYMS[key].includes(n));
  const cols: StatementColumns = {
    date: find("date"),
    description: find("description"),
    amount: find("amount"),
    money_in: find("money_in"),
    money_out: find("money_out"),
    reference: find("reference"),
  };
  if (cols.money_in >= 0 && cols.money_out >= 0) cols.amount = -1;
  return cols;
};

/** Converts a statement date in the given format to YYYY-MM-DD, or null. */
export const parseStatementDate = (value: string, format: DateFormat): string | null => {
  const v = value.trim();
  let y: number, m: number, d: number;
  if (format === "DD-MMM-YYYY") {
    const match = /^(\d{1,2})[-\s/.]([A-Za-z]{3})[A-Za-z]*[-\s/.](\d{2}|\d{4})$/.exec(v);
    if (!match) return null;
    d = Number(match[1]);
    m = MONTHS.indexOf(match[2].toLowerCase()) + 1;
    y = Number(match[3]);
  } else {
    const parts = v.split(/[-/.]/).map((p) => p.trim());
    if (parts.length !== 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
    const [a, b, c] = parts.map(Number);
    if (format === "YYYY-MM-DD") [y, m, d] = [a, b, c];
    else if (format === "DD/MM/YYYY") [d, m, y] = [a, b, c];
    else [m, d, y] = [a, b, c];
  }
  if (y < 100) y += 2000;
  const iso = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return isIsoDate(iso) ? iso : null;
};

/** The first format that reads every sample; day-first wins when both day- and month-first fit. */
export const detectDateFormat = (samples: string[]): DateFormat => {
  const values = samples.map((s) => s.trim()).filter(Boolean);
  return DATE_FORMATS.find((f) => values.length > 0 && values.every((v) => parseStatementDate(v, f))) ?? "DD/MM/YYYY";
};

/** Reads "1,234.50", "GH₵ 1,234.50", "(250.00)", "-250", "250.00 DR". Empty → 0; unreadable → null. */
export const parseAmount = (value: string | undefined): number | null => {
  let v = (value ?? "").trim();
  if (!v) return 0;
  let sign = 1;
  if (/^\(.*\)$/.test(v)) {
    sign = -1;
    v = v.slice(1, -1);
  }
  if (/\bDR$/i.test(v)) {
    sign = -sign;
    v = v.replace(/\s*DR$/i, "");
  } else v = v.replace(/\s*CR$/i, "");
  v = v.replace(/[^\d.\-]/g, "");
  if (!/^-?\d*\.?\d+$/.test(v)) return null;
  return round2(sign * Number(v));
};

export const parseStatementRows = (rows: string[][], cols: StatementColumns, format: DateFormat): StatementParseResult => {
  const lines: ParsedStatementLine[] = [];
  const skipped: StatementParseResult["skipped"] = [];
  rows.forEach((r, i) => {
    const row = i + 1;
    const date = parseStatementDate(r[cols.date] ?? "", format);
    if (!date) return skipped.push({ row, reason: `"${r[cols.date] ?? ""}" is not a ${format} date` });
    const description = (r[cols.description] ?? "").trim().replace(/\s+/g, " ");
    if (!description) return skipped.push({ row, reason: "No description" });
    let amount: number | null;
    if (cols.amount >= 0) amount = parseAmount(r[cols.amount]);
    else {
      const inn = parseAmount(r[cols.money_in]);
      const out = parseAmount(r[cols.money_out]);
      amount = inn === null || out === null ? null : round2(Math.abs(inn) - Math.abs(out));
    }
    if (amount === null) return skipped.push({ row, reason: "Amount is not a number" });
    if (amount === 0) return skipped.push({ row, reason: "No amount (balance or heading row)" });
    const reference = cols.reference >= 0 ? (r[cols.reference] ?? "").trim() : "";
    lines.push({ date, description, amount, ...(reference ? { reference } : {}) });
  });
  return { lines, skipped };
};

/**
 * Two statement lines are the same transaction when date, amount and description
 * (case and spacing ignored) agree. Used by the import to skip lines already held.
 */
export const statementLineKey = (l: { date: string; amount: number; description: string }) =>
  `${l.date}|${round2(l.amount).toFixed(2)}|${l.description.trim().replace(/\s+/g, " ").toLowerCase()}`;

/** Splits incoming lines into new ones and ones already held, counting repeats. */
export const partitionNewLines = <T extends { date: string; amount: number; description: string }>(
  existing: { date: string; amount: number; description: string }[],
  incoming: T[],
) => {
  const held = new Map<string, number>();
  for (const l of existing) held.set(statementLineKey(l), (held.get(statementLineKey(l)) ?? 0) + 1);
  const fresh: T[] = [];
  const duplicates: T[] = [];
  for (const l of incoming) {
    const k = statementLineKey(l);
    const n = held.get(k) ?? 0;
    if (n > 0) {
      held.set(k, n - 1);
      duplicates.push(l);
    } else fresh.push(l);
  }
  return { fresh, duplicates };
};
