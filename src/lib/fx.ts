import type {
  BankAccount,
  CreditNote,
  DocumentLine,
  ExchangeRate,
  FxRevaluationLine,
  JournalEntry,
  Payment,
  PurchaseBill,
  SalesInvoice,
  TaxCode,
} from "@/models/accounting";
import { isLivePayment } from "@/models/accounting";
import { documentTotals } from "@/lib/documents";
import { affectsLedger } from "@/lib/ledger";
import { BASE_CURRENCY, round2 } from "@/utils/format";

export interface FxLine {
  account_id: string;
  description?: string;
  debit: number;
  credit: number;
  cost_centre_id?: string | null;
  currency?: string | null;
  amount_fc?: number | null;
}

export const isForeign = (currency: string | null | undefined) => !!currency && currency !== BASE_CURRENCY;

export const toBase = (amountFc: number, rate: number) => round2(amountFc * rate);

/** Latest recorded rate on or before `date`. */
export const rateOn = (rates: ExchangeRate[], currency: string, date: string): ExchangeRate | null => {
  let best: ExchangeRate | null = null;
  for (const r of rates) {
    if (r.currency !== currency || r.date > date) continue;
    if (!best || r.date > best.date || (r.date === best.date && r.created_at > best.created_at)) best = r;
  }
  return best;
};

export const rateValueOn = (rates: ExchangeRate[], currency: string, date: string): number | null =>
  currency === BASE_CURRENCY ? 1 : (rateOn(rates, currency, date)?.rate ?? null);

/** Percentage difference between a typed rate and the reference rate. */
export const rateDeviationPct = (rate: number, reference: number | null) =>
  reference ? Math.abs(rate - reference) / reference * 100 : 0;

/**
 * Journal lines for an invoice or bill. Amounts are worked out in the document
 * currency and converted at the document rate; any rounding left over goes on the
 * largest revenue/expense line so the party line equals the document total exactly.
 */
export const documentJournalLines = (p: {
  lines: DocumentLine[];
  taxCodes: TaxCode[];
  currency: string;
  rate: number;
  partyAccount: string;
  partyName: string;
  kind: "SALE" | "PURCHASE";
  fallbackTaxAccount: string;
}): FxLine[] => {
  const totals = documentTotals(p.lines, p.taxCodes);
  const foreign = isForeign(p.currency);
  const byAccount = new Map<string, number>();
  for (const l of p.lines) {
    byAccount.set(l.account_id, round2((byAccount.get(l.account_id) ?? 0) + l.quantity * l.unit_price));
  }
  const partyBase = toBase(totals.total, p.rate);
  const side = (amount: number, isPartySide: boolean) =>
    (p.kind === "SALE") === isPartySide ? { debit: amount, credit: 0 } : { debit: 0, credit: amount };

  const others: FxLine[] = [
    ...[...byAccount.entries()].map(([account_id, amount]) => ({ account_id, ...side(toBase(amount, p.rate), false) })),
    ...totals.taxByCode.map((t) => {
      const code = p.taxCodes.find((c) => c.id === t.tax_code_id);
      const account = (p.kind === "SALE" ? code?.output_account_id : code?.input_account_id) ?? p.fallbackTaxAccount;
      return { account_id: account, description: code?.code, ...side(toBase(t.amount, p.rate), false) };
    }),
  ];
  const othersTotal = round2(others.reduce((s, l) => s + l.debit + l.credit, 0));
  const residue = round2(partyBase - othersTotal);
  if (residue !== 0 && others.length) {
    const largest = others.reduce((a, b) => (b.debit + b.credit > a.debit + a.credit ? b : a));
    if (largest.debit) largest.debit = round2(largest.debit + residue);
    else largest.credit = round2(largest.credit + residue);
  }
  const partyLine: FxLine = {
    account_id: p.partyAccount,
    description: p.partyName,
    ...side(partyBase, true),
    currency: foreign ? p.currency : null,
    amount_fc: foreign ? totals.total : null,
  };
  return p.kind === "SALE" ? [partyLine, ...others] : [...others, partyLine];
};

/** Base value of the receivable/payable released by paying `amountFc` of a document. */
export const carryingBaseFor = (
  doc: { exchange_rate: number; amount_paid: number; amount_paid_base: number },
  total: number,
  amountFc: number,
) => {
  const clears = amountFc >= round2(total - doc.amount_paid) - 0.005;
  return clears ? round2(toBase(total, doc.exchange_rate) - doc.amount_paid_base) : toBase(amountFc, doc.exchange_rate);
};

/**
 * Lines for a receipt or supplier payment. The bank side is valued at the payment
 * rate, the receivable/payable at its carrying value; the gap is the realised gain or loss.
 */
export const settlementLines = (p: {
  kind: "RECEIPT" | "PAYMENT";
  currency: string;
  amountFc: number;
  payRate: number;
  carryingBase: number;
  bankGl: string;
  bankCurrency: string;
  partyAccount: string;
  partyName: string;
  fxAccount: string;
}) => {
  const bankBase = toBase(p.amountFc, p.payRate);
  const foreignDoc = isForeign(p.currency);
  const bankFc = isForeign(p.bankCurrency) ? { currency: p.bankCurrency, amount_fc: p.amountFc } : {};
  const partyFc = foreignDoc ? { currency: p.currency, amount_fc: p.amountFc } : {};
  const fxGainLoss = round2(p.kind === "RECEIPT" ? bankBase - p.carryingBase : p.carryingBase - bankBase);
  const fxLine: FxLine[] =
    fxGainLoss === 0
      ? []
      : [
          {
            account_id: p.fxAccount,
            description: fxGainLoss > 0 ? "Realised exchange gain" : "Realised exchange loss",
            debit: fxGainLoss < 0 ? -fxGainLoss : 0,
            credit: fxGainLoss > 0 ? fxGainLoss : 0,
          },
        ];
  const lines: FxLine[] =
    p.kind === "RECEIPT"
      ? [
          { account_id: p.bankGl, debit: bankBase, credit: 0, ...bankFc },
          { account_id: p.partyAccount, debit: 0, credit: p.carryingBase, description: p.partyName, ...partyFc },
          ...fxLine,
        ]
      : [
          { account_id: p.partyAccount, debit: p.carryingBase, credit: 0, description: p.partyName, ...partyFc },
          { account_id: p.bankGl, debit: 0, credit: bankBase, ...bankFc },
          ...fxLine,
        ];
  return { lines, bankBase, fxGainLoss };
};

/** Carrying value released by a recorded payment (bank value less/plus the realised difference). */
export const paymentCarrying = (p: Payment, kind: "RECEIPT" | "PAYMENT") =>
  round2(kind === "RECEIPT" ? p.base_amount - p.fx_gain_loss : p.base_amount + p.fx_gain_loss);

export const accountBalances = (journals: JournalEntry[], accountId: string, asAt?: string) => {
  let base = 0;
  let fc = 0;
  for (const j of journals) {
    if (!affectsLedger(j) || (asAt && j.date > asAt)) continue;
    for (const l of j.lines) {
      if (l.account_id !== accountId) continue;
      base += l.debit - l.credit;
      if (l.amount_fc) fc += l.debit > 0 ? l.amount_fc : -l.amount_fc;
    }
  }
  return { base: round2(base), fc: round2(fc) };
};

interface RevaluationInput {
  invoices: SalesInvoice[];
  bills: PurchaseBill[];
  receipts: Payment[];
  supplierPayments: Payment[];
  creditNotes: CreditNote[];
  supplierCredits: CreditNote[];
  taxCodes: TaxCode[];
  bankAccounts: BankAccount[];
  journals: JournalEntry[];
  customers: { id: string; name: string }[];
  suppliers: { id: string; name: string }[];
}

/**
 * Open foreign-currency balances as at `asAt`, revalued at `rates`. Documents are
 * carried at their own rate because every earlier revaluation reverses on the
 * first day of the next month.
 */
export const revaluationLines = (
  s: RevaluationInput,
  asAt: string,
  rates: Record<string, number>,
  accounts: { ar: string; ap: string },
): FxRevaluationLine[] => {
  const out: FxRevaluationLine[] = [];
  const docLines = (kind: "RECEIVABLE" | "PAYABLE") => {
    const isAr = kind === "RECEIVABLE";
    const docs: (SalesInvoice | PurchaseBill)[] = isAr ? s.invoices : s.bills;
    const payments = isAr ? s.receipts : s.supplierPayments;
    const credits = isAr ? s.creditNotes : s.supplierCredits;
    const parties = new Map((isAr ? s.customers : s.suppliers).map((p) => [p.id, p.name]));
    for (const doc of docs) {
      if (!isForeign(doc.currency) || doc.state !== "APPROVED" || doc.issue_date > asAt) continue;
      const rate = rates[doc.currency];
      if (!rate) continue;
      const total = documentTotals(doc.lines, s.taxCodes).total;
      const paid = payments.filter((p) => p.document_id === doc.id && isLivePayment(p) && p.date <= asAt);
      const credited = credits.filter((c) => c.document_id === doc.id && c.state === "APPROVED" && c.date <= asAt);
      const paidFc = round2(
        paid.reduce((t, p) => t + p.amount, 0) + credited.reduce((t, c) => t + documentTotals(c.lines, s.taxCodes).total, 0),
      );
      const openFc = round2(total - paidFc);
      if (openFc <= 0.005) continue;
      const carrying = round2(
        toBase(total, doc.exchange_rate) -
          paid.reduce((t, p) => t + paymentCarrying(p, isAr ? "RECEIPT" : "PAYMENT"), 0) -
          credited.reduce((t, c) => t + c.base_amount, 0),
      );
      const revalued = toBase(openFc, rate);
      const partyId = isAr ? (doc as SalesInvoice).customer_id : (doc as PurchaseBill).supplier_id;
      out.push({
        kind,
        currency: doc.currency,
        label: `${doc.number} · ${parties.get(partyId) ?? ""}`,
        account_id: isAr ? accounts.ar : accounts.ap,
        amount_fc: openFc,
        carrying_base: carrying,
        rate,
        revalued_base: revalued,
        difference: round2(isAr ? revalued - carrying : carrying - revalued),
      });
    }
  };
  docLines("RECEIVABLE");
  docLines("PAYABLE");
  for (const b of s.bankAccounts) {
    if (!isForeign(b.currency)) continue;
    const rate = rates[b.currency];
    if (!rate) continue;
    const bal = accountBalances(s.journals, b.gl_account_id, asAt);
    if (bal.fc === 0 && bal.base === 0) continue;
    const revalued = toBase(bal.fc, rate);
    out.push({
      kind: "BANK",
      currency: b.currency,
      label: b.name,
      account_id: b.gl_account_id,
      amount_fc: bal.fc,
      carrying_base: bal.base,
      rate,
      revalued_base: revalued,
      difference: round2(revalued - bal.base),
    });
  }
  return out;
};

/** One adjustment per account plus the balancing unrealised gain/loss line. */
export const revaluationJournalLines = (lines: FxRevaluationLine[], unrealisedAccount: string): FxLine[] => {
  const byAccount = new Map<string, { amount: number; currencies: Set<string> }>();
  for (const l of lines) {
    if (l.difference === 0) continue;
    // A gain is a debit whichever side the balance sits on: receivables and bank grow, payables shrink.
    const e = byAccount.get(l.account_id) ?? { amount: 0, currencies: new Set<string>() };
    e.amount = round2(e.amount + l.difference);
    e.currencies.add(l.currency);
    byAccount.set(l.account_id, e);
  }
  const out: FxLine[] = [];
  for (const [account_id, e] of byAccount) {
    if (e.amount === 0) continue;
    out.push({
      account_id,
      description: `Revaluation – ${[...e.currencies].join(", ")}`,
      debit: e.amount > 0 ? e.amount : 0,
      credit: e.amount < 0 ? -e.amount : 0,
    });
  }
  const net = round2(lines.reduce((t, l) => t + l.difference, 0));
  if (net !== 0) {
    out.push({
      account_id: unrealisedAccount,
      description: net > 0 ? "Unrealised exchange gain" : "Unrealised exchange loss",
      debit: net < 0 ? -net : 0,
      credit: net > 0 ? net : 0,
    });
  }
  return out;
};
