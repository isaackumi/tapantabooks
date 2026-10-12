import type { CustomFieldEntity, JournalStatus, Payment, PeriodStatus } from "@/models/accounting";
import { isLivePayment, isOpenLine } from "@/models/accounting";
import type {
  DocumentListItem,
  DocumentStatistics,
  JournalListItem,
  JournalStatistics,
  PaymentListItem,
  PaymentStatistics,
} from "@/models/lists";
import { ENDPOINTS, endpointKey } from "@/services/catalogue";
import type {
  AccountBalances,
  AgeingReport,
  CustomFieldUsage,
  DashboardStatistics,
  MonthlyTrendReport,
  PeriodStatistics,
  ReportsSummary,
  TaxAccountBalance,
  TaxReturnStatus,
  TaxSummaryMonth,
  TaxSummaryReport,
} from "@/models/reports";
import {
  affectsLedger,
  balanceSheet,
  balancesByAccount,
  cashBalanceSeries,
  cashFlow,
  generalLedger,
  incomeStatement,
  lineTotals,
  monthlyProfitAndLoss,
  trialBalance,
} from "@/lib/ledger";
import { AGEING_BUCKETS, ageingBucket, emptyAgeing } from "@/lib/documents";
import { partyStatement } from "@/lib/statements";
import { fiscalYearFor, fiscalYearsView, yearEndPreview } from "@/lib/fiscalYears";
import { customFieldUsage } from "@/lib/customFields";
import { round2 } from "@/utils/format";
import { addDays, addMonths, daysBetween, endOfMonth, todayIso } from "@/utils/dates";
import { openingBalancesView, revaluationPreview, type LedgerEngine, type LedgerState } from "./engine";
import { bankActivity, bankBalances, bankBaseBalances, reconciliationView, revaluationItems, statementImportPreview } from "./banking";
import {
  billRows,
  creditItems,
  creditStatistics,
  currencyExposure,
  documentDetail,
  documentItems,
  invoiceRows,
  partyBalances,
  paymentDetail,
  paymentItems,
  type DocumentRow,
} from "./documents";
import { auditStatistics, checkImportReferences, importItems, importStatistics, needsAttention } from "./records";
import { ApiFault, found, fromResult, listResult, need, type HandlerResult, type ListOptions } from "./http";

/* eslint-disable @typescript-eslint/no-explicit-any -- request bodies are untyped JSON */

export interface RouteContext {
  q: URLSearchParams;
  body: any;
  state: LedgerState;
  engine: LedgerEngine;
  userId: string;
}

type Handler = (ctx: RouteContext) => HandlerResult;

const flag = (v: unknown) => v === true || v === "true";

const snake = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
/** Report helpers return camelCase; the wire format is snake_case. */
const snakeKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(snakeKeys);
  if (value instanceof Map) return Object.fromEntries([...value].map(([k, v]) => [k, snakeKeys(v)]));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [snake(k), snakeKeys(v)]));
  }
  return value;
};
const report = (data: unknown): HandlerResult => ({ data: snakeKeys(data) });

const creditList = (state: LedgerState, kind: "customer" | "supplier", q: URLSearchParams) =>
  listResult(creditItems(state, kind), q, {
    search: ["number", "reason", "supplier_reference", "party_name", "document_number"],
    filters: { party_id: "party_id", document_id: "document_id", state: "state" },
    dateField: "date",
    defaultSort: { field: "date", order: "desc" },
  });

const monthStart = (date: string) => `${date.slice(0, 7)}-01`;
const yearStart = (date: string) => `${date.slice(0, 4)}-01-01`;

const statement = (state: LedgerState, q: URLSearchParams, kind: "CUSTOMER" | "SUPPLIER"): HandlerResult => {
  const idParam = kind === "CUSTOMER" ? "customer_id" : "supplier_id";
  const to = q.get("to_date") || todayIso();
  const from = q.get("from_date") || yearStart(to);
  if (from > to) throw new ApiFault(400, "from_date must be on or before to_date.", { from_date: "Must be on or before to_date" });
  const data = partyStatement(state, kind, need(q.get(idParam), idParam), from, to, q.get("currency") || undefined);
  return { data: found(data ?? undefined, kind === "CUSTOMER" ? "Customer" : "Supplier") };
};

type AgeingDoc = { id: string; number: string; issue_date: string; due_date: string };

const ageing = <T extends AgeingDoc>(rows: DocumentRow<T>[], partyOf: (doc: T) => string, asAt: string) => {
  const byParty = new Map<string, AgeingReport["rows"][number]>();
  const totals = emptyAgeing() as Record<string, number>;
  for (const r of rows) {
    if (r.outstanding <= 0 || r.doc.issue_date > asAt) continue;
    const id = partyOf(r.doc);
    const bucket = ageingBucket(r.doc.due_date, asAt);
    const entry = byParty.get(id) ?? {
      party_id: id,
      party_code: r.party?.code ?? "",
      party_name: r.party?.name ?? "Unknown",
      buckets: emptyAgeing() as Record<string, number>,
      total: 0,
      documents: [],
    };
    entry.buckets[bucket] = round2(entry.buckets[bucket] + r.outstanding);
    entry.total = round2(entry.total + r.outstanding);
    entry.documents.push({
      document_id: r.doc.id,
      number: r.doc.number,
      issue_date: r.doc.issue_date,
      due_date: r.doc.due_date,
      days_overdue: Math.max(0, daysBetween(r.doc.due_date, asAt)),
      bucket,
      outstanding: r.outstanding,
    });
    totals[bucket] = round2(totals[bucket] + r.outstanding);
    byParty.set(id, entry);
  }
  for (const entry of byParty.values()) entry.documents.sort((a, b) => a.due_date.localeCompare(b.due_date) || a.number.localeCompare(b.number));
  const data: AgeingReport = {
    as_at: asAt,
    buckets: [...AGEING_BUCKETS],
    rows: [...byParty.values()].sort((a, b) => b.total - a.total),
    totals: { ...totals, total: round2(Object.values(totals).reduce((t, v) => t + v, 0)) },
  };
  return data;
};

const MAX_REPORT_MONTHS = 24;

/** Calendar months from `from` to `to` inclusive; rejects reversed or over-long ranges. */
const monthRange = (from: string, to: string, report: string) => {
  if (from > to) throw new ApiFault(400, "from_date must be on or before to_date.", { from_date: "Must be on or before to_date" });
  const months: string[] = [];
  for (let m = from.slice(0, 7); m <= to.slice(0, 7); m = addMonths(m, 1)) months.push(m);
  if (months.length > MAX_REPORT_MONTHS) {
    throw new ApiFault(400, `The ${report} covers at most ${MAX_REPORT_MONTHS} months.`, {
      from_date: `At most ${MAX_REPORT_MONTHS} months before to_date`,
    });
  }
  return months;
};

const monthlyTrend = (state: LedgerState, q: URLSearchParams): MonthlyTrendReport => {
  const to = q.get("to_date") || todayIso();
  const from = q.get("from_date") || `${addMonths(to.slice(0, 7), -11)}-01`;
  const months = monthRange(from, to, "trend");
  const upToTo = state.journals.filter((j) => j.date <= to);
  const pnl = monthlyProfitAndLoss(state.accounts, upToTo, months);
  const cash = cashBalanceSeries(state.accounts, upToTo, months);
  return {
    from_date: from,
    to_date: to,
    months: pnl.map((p, i) => ({
      month: p.month,
      revenue: p.revenue,
      expenses: p.expenses,
      net_income: p.profit,
      closing_cash: cash[i].balance,
    })),
  };
};

const VAT_RETURN_DUE_DAY = 15;
/** Journals that settle a tax return with the authority; they move tax balances but are not tax charged. */
const TAX_SETTLEMENT_REF = /^(VAT|WHT)-\d{4}-\d{2}$/;

const taxSummary = (state: LedgerState, q: URLSearchParams): TaxSummaryReport => {
  const to = q.get("to_date") || todayIso();
  const from = q.get("from_date") || fiscalYearFor(state.org, to).start_date;
  const months = monthRange(from, to, "tax summary");
  const today = todayIso();

  const ids = (values: (string | null)[]) => new Set(values.filter((v): v is string => !!v));
  const vatCodes = state.taxCodes.filter((t) => t.kind !== "WITHHOLDING");
  const outputIds = ids(vatCodes.map((t) => t.output_account_id));
  const inputIds = ids(vatCodes.map((t) => t.input_account_id));
  const whtIds = ids(state.taxCodes.filter((t) => t.kind === "WITHHOLDING").flatMap((t) => [t.output_account_id, t.input_account_id]));

  const settlementIds = new Set(state.journals.filter((j) => TAX_SETTLEMENT_REF.test(j.source.reference ?? "")).map((j) => j.id));
  const isSettlement = (j: LedgerState["journals"][number]) =>
    settlementIds.has(j.id) || (!!j.reversal_of_id && settlementIds.has(j.reversal_of_id));

  const sums = new Map(months.map((m) => [m, { output: 0, input: 0, wht: 0 }]));
  for (const j of state.journals) {
    if (!affectsLedger(j) || j.date < from || j.date > to || j.source.type === "OPENING_BALANCE" || isSettlement(j)) continue;
    const s = sums.get(j.date.slice(0, 7));
    if (!s) continue;
    for (const l of j.lines) {
      const isOutput = outputIds.has(l.account_id);
      const isInput = inputIds.has(l.account_id);
      // One account used for both sides: credits are output tax, debits are input tax.
      if (isOutput && isInput) {
        s.output += l.credit;
        s.input += l.debit;
      } else if (isOutput) s.output += l.credit - l.debit;
      else if (isInput) s.input += l.debit - l.credit;
      if (whtIds.has(l.account_id)) s.wht += l.credit - l.debit;
    }
  }

  const rows: TaxSummaryMonth[] = months.map((month) => {
    const s = sums.get(month)!;
    const output_tax = round2(s.output);
    const input_tax = round2(s.input);
    const net_payable = round2(output_tax - input_tax);
    const due_date = `${addMonths(month, 1)}-${String(VAT_RETURN_DUE_DAY).padStart(2, "0")}`;
    const journal = state.journals.find((j) => j.status === "POSTED" && !j.reversal_of_id && j.source.reference === `VAT-${month}`);
    const filing = journal
      ? {
          journal_id: journal.id,
          number: journal.number,
          date: journal.date,
          amount: round2(
            journal.lines.reduce(
              (t, l) => t + (outputIds.has(l.account_id) ? l.debit - l.credit : 0) - (inputIds.has(l.account_id) ? l.credit - l.debit : 0),
              0,
            ),
          ),
        }
      : null;
    const status: TaxReturnStatus = filing
      ? "FILED"
      : endOfMonth(month) >= today
        ? "IN_PROGRESS"
        : net_payable <= 0
          ? "NOTHING_DUE"
          : due_date < today
            ? "OVERDUE"
            : "DUE";
    return { month, output_tax, input_tax, net_payable, withholding_tax: round2(s.wht), due_date, status, filing };
  });

  const balances = balancesByAccount(state.accounts, state.journals, { to });
  const balanceRows = (set: Set<string>): TaxAccountBalance[] =>
    state.accounts
      .filter((a) => set.has(a.id))
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((a) => ({ account_id: a.id, code: a.code, name: a.name, balance: balances.get(a.id) ?? 0 }));
  const total = (k: "output_tax" | "input_tax" | "net_payable" | "withholding_tax") => round2(rows.reduce((t, r) => t + r[k], 0));

  return {
    from_date: from,
    to_date: to,
    return_due_day: VAT_RETURN_DUE_DAY,
    months: rows,
    totals: { output_tax: total("output_tax"), input_tax: total("input_tax"), net_payable: total("net_payable"), withholding_tax: total("withholding_tax") },
    next_return: rows.find((r) => r.status === "OVERDUE" || r.status === "DUE") ?? null,
    accounts: { output: balanceRows(outputIds), input: balanceRows(inputIds), withholding: balanceRows(whtIds) },
  };
};

// ---- List rows and list statistics ---------------------------------------------------------------------------

const journalItems = (state: LedgerState): JournalListItem[] => state.journals.map((j) => ({ ...j, total: lineTotals(j.lines).debit }));

/** `open=true` keeps documents with something still owed. */
const openOnly = <T extends { outstanding_base: number }>(items: T[], q: URLSearchParams) =>
  flag(q.get("open")) ? items.filter((d) => d.outstanding_base > 0) : items;

const DOCUMENT_LIST: ListOptions<DocumentListItem> = {
  search: ["number", "party_name", "party_code", "supplier_reference", "source.reference", "currency", "notes", "custom_fields"],
  dateField: "issue_date",
  defaultSort: { field: "issue_date", order: "desc", then: "number" },
};

const PAYMENT_LIST: ListOptions<PaymentListItem> = {
  search: ["number", "reference", "party_name", "document_number"],
  filters: { party_id: "party_id", document_id: "document_id", method: "method", bank_account_id: "bank_account_id", state: "state" },
  dateField: "date",
  defaultSort: { field: "date", order: "desc", then: "number" },
  summarise: (rows) => {
    const live = rows.filter(isLivePayment);
    return { totals: { count: live.length, base_amount: round2(live.reduce((t, p) => t + p.base_amount, 0)) } };
  },
};

/** Entries the ledger creates itself; everything else came from an integration or import. */
const OWN_SOURCES = new Set(["MANUAL", "SALES", "PURCHASES", "BANKING", "FX_REVALUATION", "OPENING_BALANCE", "YEAR_END"]);

const journalStatistics = (state: LedgerState): JournalStatistics => {
  const today = todayIso();
  const items = journalItems(state);
  const sum = (rows: JournalListItem[]) => round2(rows.reduce((t, j) => t + j.total, 0));
  const count = (s: JournalStatus) => items.filter((j) => j.status === s).length;
  const postedThisMonth = items.filter((j) => j.status === "POSTED" && j.date.slice(0, 7) === today.slice(0, 7) && j.date <= today);
  const pending = items.filter((j) => j.status === "PENDING_APPROVAL");
  return {
    as_at: today,
    status_counts: { ALL: items.length, DRAFT: count("DRAFT"), PENDING_APPROVAL: pending.length, POSTED: count("POSTED"), REVERSED: count("REVERSED") },
    posted_this_month_count: postedThisMonth.length,
    posted_this_month_total: sum(postedThisMonth),
    pending_approval_count: pending.length,
    pending_approval_total: sum(pending),
    integration_share_pct: items.length ? Math.round((items.filter((j) => !OWN_SOURCES.has(j.source.type)).length / items.length) * 100) : 0,
  };
};

const documentStatistics = (items: DocumentListItem[], payments: { date: string; base_amount: number }[]): DocumentStatistics => {
  const today = todayIso();
  const open = items.filter((d) => d.outstanding_base > 0);
  const overdue = items.filter((d) => d.status === "OVERDUE");
  const settled = payments.filter((p) => p.date.slice(0, 7) === today.slice(0, 7) && p.date <= today);
  const sum = (xs: number[]) => round2(xs.reduce((t, v) => t + v, 0));
  const count = (s: DocumentListItem["status"]) => items.filter((d) => d.status === s).length;
  return {
    as_at: today,
    status_counts: {
      ALL: items.length,
      DRAFT: count("DRAFT"),
      OPEN: count("OPEN"),
      PARTIALLY_PAID: count("PARTIALLY_PAID"),
      OVERDUE: overdue.length,
      PAID: count("PAID"),
      VOID: count("VOID"),
    },
    outstanding: sum(open.map((d) => d.outstanding_base)),
    open_count: open.length,
    overdue: sum(overdue.map((d) => d.outstanding_base)),
    overdue_count: overdue.length,
    due_7_days: sum(open.filter((d) => d.due_date >= today && d.due_date <= addDays(today, 7)).map((d) => d.outstanding_base)),
    settled_this_month: sum(settled.map((p) => p.base_amount)),
    settled_this_month_count: settled.length,
    currencies: [...new Set(items.map((d) => d.currency))].sort(),
  };
};

const paymentStatistics = (state: LedgerState, payments: Payment[]): PaymentStatistics => {
  const today = todayIso();
  const thisMonth = today.slice(0, 7);
  const lastMonth = addMonths(thisMonth, -1);
  const fyStart = fiscalYearFor(state.org, today).start_date;
  const upToToday = payments.filter((p) => p.date <= today);
  const window = (rows: Payment[]) => ({ total: round2(rows.reduce((t, p) => t + p.base_amount, 0)), count: rows.length });
  return {
    as_at: today,
    this_month: { month: thisMonth, ...window(upToToday.filter((p) => p.date.startsWith(thisMonth))) },
    last_month: { month: lastMonth, ...window(upToToday.filter((p) => p.date.startsWith(lastMonth))) },
    year_to_date: { from_date: fyStart, ...window(upToToday.filter((p) => p.date >= fyStart)) },
    mobile_money_share_pct: payments.length ? Math.round((payments.filter((p) => p.method === "MOBILE_MONEY").length / payments.length) * 100) : 0,
    months: [...new Set(payments.map((p) => p.date.slice(0, 7)))].sort().reverse(),
  };
};

const HANDLERS: Record<string, Handler> = {
  // ---- Platform -----------------------------------------------------------
  "GET /navigation": () => ({
    data: { items: ENDPOINTS.map(({ method, path, module, summary }) => ({ method, path, module, summary })) },
  }),
  "GET /users/list": ({ state, q }) => listResult(state.users, q, { search: ["name", "email", "role"] }),
  "GET /users/me": ({ state, userId }) => ({ data: found(state.users.find((u) => u.id === userId), "User") }),

  // ---- Organisation ---------------------------------------------------------
  "GET /organisation/get": ({ state }) => ({ data: state.org }),
  "POST /organisation/setup": ({ engine, body }) => fromResult(engine.setupOrganisation(body)),
  "PUT /organisation/update": ({ engine, body }) => fromResult(engine.updateOrg(body)),

  "GET /dimensions/list": ({ state, q }) =>
    listResult(state.dimensions, q, { search: ["code", "name"], filters: { kind: "kind", is_active: "is_active" } }),
  "POST /dimensions/add": ({ engine, body }) => fromResult(engine.saveDimension(body), 201),
  "PUT /dimensions/update": ({ engine, state, q, body }) => {
    const dim = found(state.dimensions.find((d) => d.id === need(q.get("dimension_id"), "dimension_id")), "Dimension");
    if (body.is_active === undefined || flag(body.is_active) === dim.is_active) return { data: dim };
    return fromResult(engine.toggleDimension(dim.id));
  },

  // ---- Currencies -------------------------------------------------------------
  "GET /currencies/list": ({ state, q }) => listResult(state.currencies, q, { search: ["code", "name"] }),
  "GET /currencies/exposure": ({ state }) => ({ data: currencyExposure(state) }),
  "POST /currencies/add": ({ engine, body }) => fromResult(engine.addCurrency(body), 201),
  "PUT /currencies/update": ({ engine, state, q, body }) => {
    const code = need(q.get("currency_code"), "currency_code");
    const c = found(state.currencies.find((x) => x.code === code), "Currency");
    if (body.is_active === undefined || flag(body.is_active) === c.is_active) return { data: c };
    return fromResult(engine.toggleCurrency(code));
  },
  "GET /exchange-rates/list": ({ state, q }) =>
    listResult(state.exchangeRates, q, {
      filters: { currency: "currency", source: "source" },
      dateField: "date",
      defaultSort: { field: "date", order: "desc" },
    }),
  "POST /exchange-rates/add": ({ engine, body }) =>
    fromResult(engine.addExchangeRate({ currency: body.currency, date: body.date, rate: Number(body.rate) }), 201),
  "DELETE /exchange-rates/delete": ({ engine, q }) =>
    fromResult(engine.deleteExchangeRate(need(q.get("exchange_rate_id"), "exchange_rate_id"))),
  "POST /exchange-rates/fetch-reference": ({ engine }) => fromResult(engine.fetchReferenceRates()),

  // ---- Custom fields ------------------------------------------------------------
  "GET /custom-fields/list": ({ state, q }) =>
    listResult(state.customFields, q, {
      search: ["label", "key"],
      filters: { entity: "entity", is_active: "is_active" },
      defaultSort: { field: "position", order: "asc" },
    }),
  "GET /custom-fields/usage": ({ state }) => ({
    data: {
      items: state.customFields.map((f): CustomFieldUsage => ({ custom_field_id: f.id, record_count: customFieldUsage(state, f) })),
    },
  }),
  "POST /custom-fields/add": ({ engine, body }) => fromResult(engine.addCustomField(body), 201),
  "PUT /custom-fields/update": ({ engine, q, body }) =>
    fromResult(engine.updateCustomField(need(q.get("custom_field_id"), "custom_field_id"), body)),
  "DELETE /custom-fields/delete": ({ engine, q }) =>
    fromResult(engine.deleteCustomField(need(q.get("custom_field_id"), "custom_field_id"))),
  "POST /custom-fields/move": ({ engine, q, body }) =>
    fromResult(engine.moveCustomField(need(q.get("custom_field_id"), "custom_field_id"), Number(body.direction) < 0 ? -1 : 1)),
  "PUT /custom-fields/values": ({ engine, q, body }) =>
    fromResult(
      engine.setCustomFieldValues(
        need(q.get("entity"), "entity") as CustomFieldEntity,
        need(q.get("record_id"), "record_id"),
        body.values ?? {},
      ),
    ),

  // ---- Chart of accounts ------------------------------------------------------------
  "GET /accounts/list": ({ state, q }) =>
    listResult(state.accounts, q, {
      search: ["code", "name"],
      filters: { type: "type", is_active: "is_active", parent_id: "parent_id" },
      defaultSort: { field: "code", order: "asc" },
    }),
  "GET /accounts/balances": ({ state, q }) => {
    const asAt = q.get("as_at") || todayIso();
    const balances = balancesByAccount(state.accounts, state.journals, { to: asAt });
    const posted = new Set(state.journals.filter((j) => affectsLedger(j) && j.date <= asAt).flatMap((j) => j.lines.map((l) => l.account_id)));
    const data: AccountBalances = {
      as_at: asAt,
      items: state.accounts.map((a) => ({ account_id: a.id, balance: balances.get(a.id) ?? 0, has_postings: posted.has(a.id) })),
    };
    return { data };
  },
  "GET /accounts/get": ({ state, q }) => ({
    data: found(state.accounts.find((a) => a.id === need(q.get("account_id"), "account_id")), "Account"),
  }),
  "POST /accounts/add": ({ engine, body }) => fromResult(engine.createAccount(body), 201),
  "PUT /accounts/update": ({ engine, q, body }) => fromResult(engine.updateAccount(need(q.get("account_id"), "account_id"), body)),

  // ---- Journals ----------------------------------------------------------------------
  "GET /journals/list": ({ state, q }) => {
    const accountId = q.get("account_id");
    const items = journalItems(state);
    return listResult(accountId ? items.filter((j) => j.lines.some((l) => l.account_id === accountId)) : items, q, {
      search: ["number", "memo", "reference", "created_by", "source.type", "source.reference", "custom_fields"],
      filters: { status: "status", source_type: "source.type", branch_id: "branch_id" },
      dateField: "date",
      defaultSort: { field: "date", order: "desc", then: "number" },
    });
  },
  "GET /journals/statistics": ({ state }) => ({ data: journalStatistics(state) }),
  "GET /journals/get": ({ state, q }) => ({
    data: found(state.journals.find((j) => j.id === need(q.get("journal_id"), "journal_id")), "Journal"),
  }),
  "POST /journals/add": ({ engine, body }) => {
    const { intent, ...input } = body;
    return fromResult(engine.createJournal(input, intent === "POST" ? "POST" : "DRAFT"), 201);
  },
  "PUT /journals/update": ({ engine, q, body }) => fromResult(engine.updateDraftJournal(need(q.get("journal_id"), "journal_id"), body)),
  "POST /journals/submit": ({ engine, q }) => fromResult(engine.submitJournal(need(q.get("journal_id"), "journal_id"))),
  "POST /journals/approve": ({ engine, q }) => fromResult(engine.approveJournal(need(q.get("journal_id"), "journal_id"))),
  "POST /journals/reject": ({ engine, q, body }) =>
    fromResult(engine.rejectJournal(need(q.get("journal_id"), "journal_id"), String(body.reason ?? ""))),
  "POST /journals/reverse": ({ engine, q, body }) =>
    fromResult(engine.reverseJournal(need(q.get("journal_id"), "journal_id"), String(body.date ?? ""), String(body.reason ?? ""))),
  "DELETE /journals/delete": ({ engine, q }) => fromResult(engine.deleteDraftJournal(need(q.get("journal_id"), "journal_id"))),

  // ---- Fiscal periods -----------------------------------------------------------------------
  "GET /fiscal-periods/list": ({ state, q }) =>
    listResult(state.periods, q, { filters: { status: "status" }, defaultSort: { field: "start_date", order: "asc" } }),
  "GET /fiscal-periods/statistics": ({ state }) => {
    const items: PeriodStatistics[] = state.periods.map((p) => {
      const inPeriod = state.journals.filter((j) => j.date >= p.start_date && j.date <= p.end_date);
      const posted = inPeriod.filter(affectsLedger);
      return {
        period_id: p.id,
        posted_count: posted.length,
        posted_total: round2(posted.reduce((t, j) => t + lineTotals(j.lines).debit, 0)),
        open_count: inPeriod.filter((j) => j.status === "DRAFT" || j.status === "PENDING_APPROVAL").length,
      };
    });
    return { data: { items } };
  },
  "PUT /fiscal-periods/update-status": ({ engine, q, body }) =>
    fromResult(engine.setPeriodStatus(need(q.get("period_id"), "period_id"), body.status as PeriodStatus)),
  "GET /fiscal-years/list": ({ state }) => ({ data: { items: fiscalYearsView(state) } }),
  "GET /fiscal-years/close-preview": ({ state, q }) => ({
    data: found(yearEndPreview(state, need(q.get("fiscal_year_id"), "fiscal_year_id")) ?? undefined, "Fiscal year"),
  }),
  "POST /fiscal-years/close": ({ engine, q }) => fromResult(engine.closeFiscalYear(need(q.get("fiscal_year_id"), "fiscal_year_id"))),
  "POST /fiscal-years/reopen": ({ engine, q, body }) =>
    fromResult(engine.reopenFiscalYear(need(q.get("fiscal_year_id"), "fiscal_year_id"), String(body?.reason ?? ""))),
  "POST /fiscal-years/add": ({ engine }) => fromResult(engine.addFiscalYear(), 201),

  // ---- FX revaluation -------------------------------------------------------------------------
  "GET /revaluations/list": ({ state, q }) => listResult(revaluationItems(state), q, { defaultSort: { field: "as_at", order: "desc" } }),
  "GET /revaluations/preview": ({ state, q }) => ({ data: revaluationPreview(state, need(q.get("as_at"), "as_at")) }),
  "POST /revaluations/run": ({ engine, q }) => fromResult(engine.runRevaluation(need(q.get("period_id"), "period_id")), 201),

  // ---- Opening balances -----------------------------------------------------------------------
  "GET /opening-balances/get": ({ state }) => ({ data: openingBalancesView(state) }),
  "PUT /opening-balances/update": ({ engine, body }) => fromResult(engine.saveOpeningBalances(body)),

  // ---- Customers & suppliers ------------------------------------------------------------------------
  "GET /customers/list": ({ state, q }) =>
    listResult(state.customers, q, { search: ["code", "name", "email", "phone", "city"], filters: { status: "status" } }),
  "GET /customers/balances": ({ state }) => ({ data: partyBalances(state, "customer") }),
  "GET /customers/get": ({ state, q }) => ({
    data: found(state.customers.find((c) => c.id === need(q.get("customer_id"), "customer_id")), "Customer"),
  }),
  "POST /customers/add": ({ engine, body }) => fromResult(engine.saveParty("customer", body), 201),
  "PUT /customers/update": ({ engine, q, body }) => fromResult(engine.saveParty("customer", body, need(q.get("customer_id"), "customer_id"))),
  "GET /suppliers/list": ({ state, q }) =>
    listResult(state.suppliers, q, { search: ["code", "name", "email", "phone", "city"], filters: { status: "status" } }),
  "GET /suppliers/balances": ({ state }) => ({ data: partyBalances(state, "supplier") }),
  "GET /suppliers/get": ({ state, q }) => ({
    data: found(state.suppliers.find((c) => c.id === need(q.get("supplier_id"), "supplier_id")), "Supplier"),
  }),
  "POST /suppliers/add": ({ engine, body }) => fromResult(engine.saveParty("supplier", body), 201),
  "PUT /suppliers/update": ({ engine, q, body }) => fromResult(engine.saveParty("supplier", body, need(q.get("supplier_id"), "supplier_id"))),

  // ---- Invoices & receipts ------------------------------------------------------------------------------
  "GET /invoices/list": ({ state, q }) =>
    listResult(openOnly(documentItems(invoiceRows(state)), q), q, {
      ...DOCUMENT_LIST,
      filters: { state: "state", status: "status", customer_id: "customer_id", currency: "currency" },
    }),
  "GET /invoices/statistics": ({ state }) => ({ data: documentStatistics(documentItems(invoiceRows(state)), state.receipts.filter(isLivePayment)) }),
  "GET /invoices/get": ({ state, q }) => ({ data: documentDetail(state, "invoice", need(q.get("invoice_id"), "invoice_id")) }),
  "POST /invoices/add": ({ engine, body }) => {
    const { approve, ...input } = body;
    return fromResult(engine.createInvoice(input, flag(approve)), 201);
  },
  "POST /invoices/approve": ({ engine, q }) => fromResult(engine.approveInvoice(need(q.get("invoice_id"), "invoice_id"))),
  "POST /invoices/void": ({ engine, q, body }) =>
    fromResult(engine.voidDocument("invoice", need(q.get("invoice_id"), "invoice_id"), String(body.reason ?? ""))),
  "PUT /invoices/update": ({ engine, q, body }) => fromResult(engine.updateDraftDocument("invoice", need(q.get("invoice_id"), "invoice_id"), body)),
  "DELETE /invoices/delete": ({ engine, q }) => fromResult(engine.deleteDraftDocument("invoice", need(q.get("invoice_id"), "invoice_id"))),
  "GET /receipts/list": ({ state, q }) => listResult(paymentItems(state, "receipt"), q, PAYMENT_LIST),
  "GET /receipts/statistics": ({ state }) => ({ data: paymentStatistics(state, state.receipts.filter(isLivePayment)) }),
  "GET /receipts/get": ({ state, q }) => ({ data: paymentDetail(state, "receipt", need(q.get("receipt_id"), "receipt_id")) }),
  "POST /receipts/add": ({ engine, body }) => fromResult(engine.recordPayment("receipt", body), 201),
  "POST /receipts/void": ({ engine, q, body }) =>
    fromResult(engine.voidPayment("receipt", need(q.get("receipt_id"), "receipt_id"), String(body?.reason ?? ""))),
  "GET /credit-notes/list": ({ state, q }) => creditList(state, "customer", q),
  "GET /credit-notes/statistics": ({ state }) => ({ data: creditStatistics(state, "customer") }),
  "GET /credit-notes/get": ({ state, q }) => {
    const id = need(q.get("credit_note_id"), "credit_note_id");
    return { data: found(creditItems(state, "customer").find((c) => c.id === id), "Credit note") };
  },
  "POST /credit-notes/add": ({ engine, body }) => fromResult(engine.createCreditNote("customer", body), 201),
  "POST /credit-notes/void": ({ engine, q, body }) =>
    fromResult(engine.voidCreditNote("customer", need(q.get("credit_note_id"), "credit_note_id"), String(body?.reason ?? ""))),

  // ---- Bills & supplier payments -----------------------------------------------------------------------------
  "GET /bills/list": ({ state, q }) =>
    listResult(openOnly(documentItems(billRows(state)), q), q, {
      ...DOCUMENT_LIST,
      filters: { state: "state", status: "status", supplier_id: "supplier_id", currency: "currency" },
    }),
  "GET /bills/statistics": ({ state }) => ({ data: documentStatistics(documentItems(billRows(state)), state.supplierPayments.filter(isLivePayment)) }),
  "GET /bills/get": ({ state, q }) => ({ data: documentDetail(state, "bill", need(q.get("bill_id"), "bill_id")) }),
  "POST /bills/add": ({ engine, body }) => {
    const { approve, ...input } = body;
    return fromResult(engine.createBill(input, flag(approve)), 201);
  },
  "POST /bills/approve": ({ engine, q }) => fromResult(engine.approveBill(need(q.get("bill_id"), "bill_id"))),
  "POST /bills/void": ({ engine, q, body }) =>
    fromResult(engine.voidDocument("bill", need(q.get("bill_id"), "bill_id"), String(body.reason ?? ""))),
  "PUT /bills/update": ({ engine, q, body }) => fromResult(engine.updateDraftDocument("bill", need(q.get("bill_id"), "bill_id"), body)),
  "DELETE /bills/delete": ({ engine, q }) => fromResult(engine.deleteDraftDocument("bill", need(q.get("bill_id"), "bill_id"))),
  "GET /supplier-payments/list": ({ state, q }) => listResult(paymentItems(state, "payment"), q, PAYMENT_LIST),
  "GET /supplier-payments/statistics": ({ state }) => ({ data: paymentStatistics(state, state.supplierPayments.filter(isLivePayment)) }),
  "GET /supplier-payments/get": ({ state, q }) => ({
    data: paymentDetail(state, "payment", need(q.get("supplier_payment_id"), "supplier_payment_id")),
  }),
  "POST /supplier-payments/add": ({ engine, body }) => fromResult(engine.recordPayment("payment", body), 201),
  "POST /supplier-payments/void": ({ engine, q, body }) =>
    fromResult(
      engine.voidPayment("payment", need(q.get("supplier_payment_id"), "supplier_payment_id"), String(body?.reason ?? "")),
    ),
  "GET /supplier-credits/list": ({ state, q }) => creditList(state, "supplier", q),
  "GET /supplier-credits/statistics": ({ state }) => ({ data: creditStatistics(state, "supplier") }),
  "GET /supplier-credits/get": ({ state, q }) => {
    const id = need(q.get("supplier_credit_id"), "supplier_credit_id");
    return { data: found(creditItems(state, "supplier").find((c) => c.id === id), "Supplier credit") };
  },
  "POST /supplier-credits/add": ({ engine, body }) => fromResult(engine.createCreditNote("supplier", body), 201),
  "POST /supplier-credits/void": ({ engine, q, body }) =>
    fromResult(engine.voidCreditNote("supplier", need(q.get("supplier_credit_id"), "supplier_credit_id"), String(body?.reason ?? ""))),

  // ---- Banking -----------------------------------------------------------------------------------------------------
  "GET /bank-accounts/list": ({ state, q }) =>
    listResult(state.bankAccounts, q, { search: ["name", "bank", "account_number"], filters: { currency: "currency", is_active: "is_active" } }),
  "GET /bank-accounts/get": ({ state, q }) => {
    const id = need(q.get("bank_account_id"), "bank_account_id");
    return { data: found(state.bankAccounts.find((b) => b.id === id), "Bank account") };
  },
  "POST /bank-accounts/add": ({ engine, body }) =>
    fromResult(
      engine.createBankAccount({
        name: String(body?.name ?? ""),
        bank: String(body?.bank ?? ""),
        account_number: String(body?.account_number ?? ""),
        currency: String(body?.currency ?? ""),
        gl_account_id: body?.gl_account_id || null,
      }),
      201,
    ),
  "PUT /bank-accounts/update": ({ engine, q, body }) =>
    fromResult(
      engine.updateBankAccount(need(q.get("bank_account_id"), "bank_account_id"), {
        ...(body?.name !== undefined && { name: String(body.name) }),
        ...(body?.bank !== undefined && { bank: String(body.bank) }),
        ...(body?.account_number !== undefined && { account_number: String(body.account_number) }),
        ...(body?.currency !== undefined && { currency: String(body.currency) }),
        ...(body?.is_active !== undefined && { is_active: flag(body.is_active) }),
      }),
    ),
  "GET /bank-accounts/balances": ({ state, q }) => ({ data: bankBalances(state, q.get("as_at") || undefined) }),
  "GET /bank-accounts/activity": ({ state, q }) =>
    listResult(bankActivity(state, q.get("bank_account_id") || null), q, {
      search: ["memo", "number"],
      filters: { statement_status: "statement_status" },
      dateField: "date",
    }),
  "POST /bank-accounts/transfer": ({ engine, body }) =>
    fromResult(
      engine.transferFunds({
        from: body.from,
        to: body.to,
        amount: Number(body.amount),
        date: body.date,
        memo: body.memo ?? "",
        rate: body.rate === undefined || body.rate === null ? undefined : Number(body.rate),
      }),
      201,
    ),
  "GET /bank-statement-lines/list": ({ state, q }) =>
    listResult(state.statementLines, q, {
      search: ["description"],
      filters: { bank_account_id: "bank_account_id", status: "status" },
      dateField: "date",
      defaultSort: { field: "date", order: "desc" },
    }),
  "POST /bank-statement-lines/import": ({ engine, body }) =>
    fromResult(
      engine.importStatementLines({
        bank_account_id: need(body?.bank_account_id, "bank_account_id"),
        file_name: body.file_name,
        statement_date: body.statement_date,
        closing_balance: Number(body.closing_balance),
        lines: Array.isArray(body.lines)
          ? body.lines.map((l: any) => ({ date: l?.date, description: String(l?.description ?? ""), amount: Number(l?.amount), reference: l?.reference }))
          : [],
      }),
      201,
    ),
  "POST /bank-statement-lines/preview": ({ state, body }) => ({ data: statementImportPreview(state, body ?? {}) }),
  "GET /reconciliation/get": ({ state, q }) => ({ data: reconciliationView(state, need(q.get("bank_account_id"), "bank_account_id")) }),
  "POST /reconciliation/match": ({ engine, body }) =>
    fromResult(engine.matchStatementLine(need(body.statement_line_id, "statement_line_id"), need(body.journal_id, "journal_id"))),
  "POST /reconciliation/unmatch": ({ engine, q }) =>
    fromResult(engine.unmatchStatementLine(need(q.get("statement_line_id"), "statement_line_id"))),
  "POST /reconciliation/create-entry": ({ engine, body }) =>
    fromResult(
      engine.createEntryFromStatementLine(
        need(body.statement_line_id, "statement_line_id"),
        need(body.account_id, "account_id"),
        String(body.memo ?? ""),
      ),
      201,
    ),
  "POST /reconciliation/complete": ({ engine, q }) =>
    fromResult(engine.completeReconciliation(need(q.get("bank_account_id"), "bank_account_id"))),
  "POST /reconciliation/reopen": ({ engine, q, body }) =>
    fromResult(engine.reopenReconciliation(need(q.get("bank_account_id"), "bank_account_id"), String(body?.reason ?? ""))),
  "POST /bank-statement-lines/exclude": ({ engine, q, body }) =>
    fromResult(engine.excludeStatementLine(need(q.get("statement_line_id"), "statement_line_id"), String(body?.reason ?? ""))),
  "POST /bank-statement-lines/restore": ({ engine, q }) =>
    fromResult(engine.restoreStatementLine(need(q.get("statement_line_id"), "statement_line_id"))),
  "DELETE /bank-statement-lines/delete": ({ engine, q }) =>
    fromResult(engine.deleteStatementLine(need(q.get("statement_line_id"), "statement_line_id"))),
  "POST /bank-statement-lines/undo-import": ({ engine, q }) =>
    fromResult(engine.undoStatementImport(need(q.get("bank_account_id"), "bank_account_id"))),

  // ---- Tax ------------------------------------------------------------------------------------------------------------
  "GET /tax-codes/list": ({ state, q }) =>
    listResult(state.taxCodes, q, { search: ["code", "name"], filters: { kind: "kind", is_active: "is_active" } }),
  "GET /tax-codes/get": ({ state, q }) => {
    const id = need(q.get("tax_code_id"), "tax_code_id");
    return { data: found(state.taxCodes.find((t) => t.id === id), "Tax code") };
  },
  "POST /tax-codes/add": ({ engine, body }) => fromResult(engine.createTaxCode({ ...body, rate: Number(body?.rate) }), 201),
  "PUT /tax-codes/update": ({ engine, q, body }) =>
    fromResult(
      engine.updateTaxCode(need(q.get("tax_code_id"), "tax_code_id"), {
        ...body,
        ...(body?.rate !== undefined && { rate: Number(body.rate) }),
        ...(body?.is_active !== undefined && { is_active: flag(body.is_active) }),
      }),
    ),

  // ---- Integrations ------------------------------------------------------------------------------------------------------
  "GET /data-sources/list": ({ state, q }) =>
    listResult(state.dataSources, q, { search: ["name", "provider"], filters: { status: "status", kind: "kind" } }),
  "POST /data-sources/connect": ({ engine, q, body }) =>
    fromResult(engine.connectSource(need(q.get("data_source_id"), "data_source_id"), body)),
  "POST /data-sources/disconnect": ({ engine, q }) =>
    fromResult(engine.disconnectSource(need(q.get("data_source_id"), "data_source_id"))),
  "POST /data-sources/sync": ({ engine, q }) => fromResult(engine.syncSource(need(q.get("data_source_id"), "data_source_id"))),
  "GET /field-mappings/list": ({ state, q }) =>
    listResult(state.fieldMappings, q, {
      search: ["source_field", "target_field"],
      filters: { source_id: "source_id", entity: "entity" },
    }),
  "POST /field-mappings/add": ({ engine, body }) => fromResult(engine.saveMapping(body), 201),
  "PUT /field-mappings/update": ({ engine, q, body }) =>
    fromResult(engine.saveMapping(body, need(q.get("field_mapping_id"), "field_mapping_id"))),
  "DELETE /field-mappings/delete": ({ engine, q }) =>
    fromResult(engine.removeMapping(need(q.get("field_mapping_id"), "field_mapping_id"))),
  "GET /accounting-rules/list": ({ state, q }) =>
    listResult(state.rules, q, { search: ["name", "event"], filters: { source_id: "source_id", is_active: "is_active" } }),
  "PUT /accounting-rules/update": ({ engine, state, q, body }) => {
    const rule = found(state.rules.find((r) => r.id === need(q.get("rule_id"), "rule_id")), "Rule");
    if (body.is_active === undefined || flag(body.is_active) === rule.is_active) return { data: rule };
    return fromResult(engine.toggleRule(rule.id));
  },
  "GET /imports/list": ({ state, q }) => {
    const items = importItems(state);
    return listResult(flag(q.get("attention")) ? items.filter((b) => needsAttention(b.status)) : items, q, {
      search: ["number", "file_name", "entity", "source_name"],
      filters: { source_id: "source_id", status: "status" },
      defaultSort: { field: "created_at", order: "desc" },
    });
  },
  "GET /imports/statistics": ({ state }) => ({ data: importStatistics(state) }),
  "GET /imports/get": ({ state, q }) => {
    const id = need(q.get("import_batch_id"), "import_batch_id");
    return { data: found(importItems(state).find((b) => b.id === id), "Import batch") };
  },
  "POST /imports/check-references": ({ state, body }) => ({ data: checkImportReferences(state, body?.references) }),
  "POST /imports/add": ({ engine, body }) => fromResult(engine.createImport(body), 201),
  "POST /imports/post": ({ engine, q }) => fromResult(engine.postImportBatch(need(q.get("import_batch_id"), "import_batch_id"))),
  "POST /imports/reprocess": ({ engine, q }) =>
    fromResult(engine.reprocessRecord(need(q.get("import_batch_id"), "import_batch_id"), Number(need(q.get("row"), "row")))),

  // ---- Audit ------------------------------------------------------------------------------------------------------------------
  "GET /audit-logs/list": ({ state, q }) =>
    listResult(state.auditEvents, q, {
      search: ["summary", "entity_label", "actor_name", "action"],
      filters: { entity_type: "entity_type", actor_id: "actor_id", actor_type: "actor_type", actor_name: "actor_name" },
      dateField: "occurred_at",
      defaultSort: { field: "occurred_at", order: "desc" },
    }),
  "GET /audit-logs/statistics": ({ state }) => ({ data: auditStatistics(state) }),

  // ---- Reports --------------------------------------------------------------------------------------------------------------------
  "GET /dashboard/statistics": ({ state, q }) => {
    const asAt = q.get("as_at") || todayIso();
    const month = incomeStatement(state.accounts, state.journals, monthStart(asAt), asAt);
    const year = incomeStatement(state.accounts, state.journals, yearStart(asAt), asAt);
    const ar = invoiceRows(state);
    const ap = billRows(state);
    const sum = (xs: number[]) => round2(xs.reduce((t, v) => t + v, 0));
    const overdueAr = ar.filter((r) => r.status === "OVERDUE");
    const data: DashboardStatistics = {
      as_at: asAt,
      revenue_mtd: month.totalRevenue,
      expenses_mtd: round2(month.totalCostOfSales + month.totalOperating),
      net_income_mtd: month.netIncome,
      revenue_ytd: year.totalRevenue,
      net_income_ytd: year.netIncome,
      cash_balance: sum([...bankBaseBalances(state).values()]),
      receivables: sum(ar.map((r) => r.outstanding)),
      overdue_receivables: sum(overdueAr.map((r) => r.outstanding)),
      overdue_invoices: overdueAr.filter((r) => r.outstanding > 0).length,
      payables: sum(ap.map((r) => r.outstanding)),
      overdue_payables: sum(ap.filter((r) => r.status === "OVERDUE").map((r) => r.outstanding)),
      payables_due_7_days: sum(ap.filter((r) => r.outstanding > 0 && r.doc.due_date <= addDays(asAt, 7)).map((r) => r.outstanding)),
      journals_pending_approval: state.journals.filter((j) => j.status === "PENDING_APPROVAL").length,
      draft_journals: state.journals.filter((j) => j.status === "DRAFT").length,
      unmatched_statement_lines: state.statementLines.filter(isOpenLine).length,
      imports_needing_review: state.importBatches.filter((b) => b.status === "NEEDS_REVIEW" || b.status === "FAILED").length,
    };
    return { data };
  },
  "GET /reports/summary": ({ state, q }) => {
    const asAt = q.get("as_at") || todayIso();
    const from = fiscalYearFor(state.org, asAt).start_date;
    const sum = (rows: DocumentRow<{ issue_date: string }>[]) =>
      round2(rows.filter((r) => r.doc.issue_date <= asAt).reduce((t, r) => t + r.outstanding, 0));
    const data: ReportsSummary = {
      as_at: asAt,
      from_date: from,
      total_assets: balanceSheet(state.accounts, state.journals, asAt).totalAssets,
      net_income: incomeStatement(state.accounts, state.journals, from, asAt).netIncome,
      cash_net_change: cashFlow(state.accounts, state.journals, from, asAt).netChange,
      receivables: sum(invoiceRows(state)),
      payables: sum(billRows(state)),
      trial_balance_total: trialBalance(state.accounts, state.journals, asAt).totals.debit,
    };
    return { data };
  },
  "GET /reports/monthly-trend": ({ state, q }) => ({ data: monthlyTrend(state, q) }),
  "GET /reports/tax-summary": ({ state, q }) => ({ data: taxSummary(state, q) }),
  "GET /reports/trial-balance": ({ state, q }) => report(trialBalance(state.accounts, state.journals, q.get("as_at") || todayIso())),
  "GET /reports/general-ledger": ({ state, q }) => {
    const account = found(state.accounts.find((a) => a.id === need(q.get("account_id"), "account_id")), "Account");
    const to = q.get("to_date") || todayIso();
    return report(generalLedger(account, state.journals, q.get("from_date") || yearStart(to), to));
  },
  "GET /reports/income-statement": ({ state, q }) => {
    const to = q.get("to_date") || todayIso();
    return report(incomeStatement(state.accounts, state.journals, q.get("from_date") || yearStart(to), to));
  },
  "GET /reports/balance-sheet": ({ state, q }) => report(balanceSheet(state.accounts, state.journals, q.get("as_at") || todayIso())),
  "GET /reports/cash-flow": ({ state, q }) => {
    const to = q.get("to_date") || todayIso();
    return report(cashFlow(state.accounts, state.journals, q.get("from_date") || yearStart(to), to));
  },
  "GET /reports/ar-ageing": ({ state, q }) => ({
    data: ageing(invoiceRows(state), (d) => d.customer_id, q.get("as_at") || todayIso()),
  }),
  "GET /reports/ap-ageing": ({ state, q }) => ({
    data: ageing(billRows(state), (d) => d.supplier_id, q.get("as_at") || todayIso()),
  }),
  "GET /reports/customer-statement": ({ state, q }) => statement(state, q, "CUSTOMER"),
  "GET /reports/supplier-statement": ({ state, q }) => statement(state, q, "SUPPLIER"),
};

export const resolveHandler = (method: string, path: string): Handler | undefined => HANDLERS[endpointKey(method, path)];

/** Catalogue entries without a mock handler, and handlers missing from the catalogue. */
export const routeCoverage = () => {
  const declared = new Set(ENDPOINTS.map((e) => endpointKey(e.method, e.path)));
  const implemented = new Set(Object.keys(HANDLERS));
  return {
    missingHandlers: [...declared].filter((k) => !implemented.has(k)),
    undocumented: [...implemented].filter((k) => !declared.has(k)),
  };
};

export { ApiFault };
