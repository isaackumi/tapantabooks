import type { CreditNote, CustomFieldEntity, PeriodStatus } from "@/models/accounting";
import { ENDPOINTS, endpointKey } from "@/services/catalogue";
import { balanceSheet, cashFlow, generalLedger, incomeStatement, trialBalance } from "@/lib/ledger";
import { AGEING_BUCKETS, ageingBucket, emptyAgeing } from "@/lib/documents";
import { bankBaseBalances, billRows, invoiceRows, type DocumentRow } from "@/store/selectors";
import { round2 } from "@/utils/format";
import { todayIso } from "@/utils/dates";
import { openingBalancesView, revaluationPreview, type LedgerEngine, type LedgerState } from "./engine";
import { ApiFault, found, fromResult, listResult, need, type HandlerResult } from "./http";

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

const creditList = (rows: CreditNote[], q: URLSearchParams) =>
  listResult(rows, q, {
    search: ["number", "reason", "supplier_reference"],
    filters: { party_id: "party_id", document_id: "document_id", state: "state" },
    dateField: "date",
    defaultSort: { field: "date", order: "desc" },
  });

const monthStart = (date: string) => `${date.slice(0, 7)}-01`;
const yearStart = (date: string) => `${date.slice(0, 4)}-01-01`;

const ageing = <T>(rows: DocumentRow<T>[], partyOf: (doc: T) => string, asAt: string) => {
  const byParty = new Map<string, { party_id: string; party_name: string; buckets: Record<string, number>; total: number }>();
  const totals = emptyAgeing() as Record<string, number>;
  for (const r of rows) {
    if (r.outstanding <= 0) continue;
    const id = partyOf(r.doc);
    const due = (r.doc as { due_date: string }).due_date;
    const bucket = ageingBucket(due, asAt);
    const entry = byParty.get(id) ?? {
      party_id: id,
      party_name: r.party?.name ?? "Unknown",
      buckets: emptyAgeing() as Record<string, number>,
      total: 0,
    };
    entry.buckets[bucket] = round2(entry.buckets[bucket] + r.outstanding);
    entry.total = round2(entry.total + r.outstanding);
    totals[bucket] = round2(totals[bucket] + r.outstanding);
    byParty.set(id, entry);
  }
  return {
    buckets: AGEING_BUCKETS,
    rows: [...byParty.values()].sort((a, b) => b.total - a.total),
    totals: { ...totals, total: round2(Object.values(totals).reduce((t, v) => t + v, 0)) },
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
  "GET /accounts/get": ({ state, q }) => ({
    data: found(state.accounts.find((a) => a.id === need(q.get("account_id"), "account_id")), "Account"),
  }),
  "POST /accounts/add": ({ engine, body }) => fromResult(engine.createAccount(body), 201),
  "PUT /accounts/update": ({ engine, q, body }) => fromResult(engine.updateAccount(need(q.get("account_id"), "account_id"), body)),

  // ---- Journals ----------------------------------------------------------------------
  "GET /journals/list": ({ state, q }) =>
    listResult(state.journals, q, {
      search: ["number", "memo", "reference"],
      filters: { status: "status", source_type: "source.type", branch_id: "branch_id" },
      dateField: "date",
      defaultSort: { field: "date", order: "desc" },
    }),
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
  "PUT /fiscal-periods/update-status": ({ engine, q, body }) =>
    fromResult(engine.setPeriodStatus(need(q.get("period_id"), "period_id"), body.status as PeriodStatus)),

  // ---- FX revaluation -------------------------------------------------------------------------
  "GET /revaluations/list": ({ state, q }) => listResult(state.fxRevaluations, q, { defaultSort: { field: "as_at", order: "desc" } }),
  "GET /revaluations/preview": ({ state, q }) => ({ data: revaluationPreview(state, need(q.get("as_at"), "as_at")) }),
  "POST /revaluations/run": ({ engine, q }) => fromResult(engine.runRevaluation(need(q.get("period_id"), "period_id")), 201),

  // ---- Opening balances -----------------------------------------------------------------------
  "GET /opening-balances/get": ({ state }) => ({ data: openingBalancesView(state) }),
  "PUT /opening-balances/update": ({ engine, body }) => fromResult(engine.saveOpeningBalances(body)),

  // ---- Customers & suppliers ------------------------------------------------------------------------
  "GET /customers/list": ({ state, q }) =>
    listResult(state.customers, q, { search: ["code", "name", "email", "phone", "city"], filters: { status: "status" } }),
  "GET /customers/get": ({ state, q }) => ({
    data: found(state.customers.find((c) => c.id === need(q.get("customer_id"), "customer_id")), "Customer"),
  }),
  "POST /customers/add": ({ engine, body }) => fromResult(engine.saveParty("customer", body), 201),
  "PUT /customers/update": ({ engine, q, body }) => fromResult(engine.saveParty("customer", body, need(q.get("customer_id"), "customer_id"))),
  "GET /suppliers/list": ({ state, q }) =>
    listResult(state.suppliers, q, { search: ["code", "name", "email", "phone", "city"], filters: { status: "status" } }),
  "GET /suppliers/get": ({ state, q }) => ({
    data: found(state.suppliers.find((c) => c.id === need(q.get("supplier_id"), "supplier_id")), "Supplier"),
  }),
  "POST /suppliers/add": ({ engine, body }) => fromResult(engine.saveParty("supplier", body), 201),
  "PUT /suppliers/update": ({ engine, q, body }) => fromResult(engine.saveParty("supplier", body, need(q.get("supplier_id"), "supplier_id"))),

  // ---- Invoices & receipts ------------------------------------------------------------------------------
  "GET /invoices/list": ({ state, q }) =>
    listResult(state.invoices, q, {
      search: ["number", "notes"],
      filters: { state: "state", customer_id: "customer_id", currency: "currency" },
      dateField: "issue_date",
      defaultSort: { field: "issue_date", order: "desc" },
    }),
  "GET /invoices/get": ({ state, q }) => ({
    data: found(state.invoices.find((d) => d.id === need(q.get("invoice_id"), "invoice_id")), "Invoice"),
  }),
  "POST /invoices/add": ({ engine, body }) => {
    const { approve, ...input } = body;
    return fromResult(engine.createInvoice(input, flag(approve)), 201);
  },
  "POST /invoices/approve": ({ engine, q }) => fromResult(engine.approveInvoice(need(q.get("invoice_id"), "invoice_id"))),
  "POST /invoices/void": ({ engine, q, body }) =>
    fromResult(engine.voidDocument("invoice", need(q.get("invoice_id"), "invoice_id"), String(body.reason ?? ""))),
  "GET /receipts/list": ({ state, q }) =>
    listResult(state.receipts, q, {
      search: ["number", "reference"],
      filters: { party_id: "party_id", document_id: "document_id", method: "method" },
      dateField: "date",
      defaultSort: { field: "date", order: "desc" },
    }),
  "POST /receipts/add": ({ engine, body }) => fromResult(engine.recordPayment("receipt", body), 201),
  "GET /credit-notes/list": ({ state, q }) => creditList(state.creditNotes, q),
  "GET /credit-notes/get": ({ state, q }) => ({
    data: found(state.creditNotes.find((c) => c.id === need(q.get("credit_note_id"), "credit_note_id")), "Credit note"),
  }),
  "POST /credit-notes/add": ({ engine, body }) => fromResult(engine.createCreditNote("customer", body), 201),
  "POST /credit-notes/void": ({ engine, q, body }) =>
    fromResult(engine.voidCreditNote("customer", need(q.get("credit_note_id"), "credit_note_id"), String(body?.reason ?? ""))),

  // ---- Bills & supplier payments -----------------------------------------------------------------------------
  "GET /bills/list": ({ state, q }) =>
    listResult(state.bills, q, {
      search: ["number", "supplier_reference", "notes"],
      filters: { state: "state", supplier_id: "supplier_id", currency: "currency" },
      dateField: "issue_date",
      defaultSort: { field: "issue_date", order: "desc" },
    }),
  "GET /bills/get": ({ state, q }) => ({
    data: found(state.bills.find((d) => d.id === need(q.get("bill_id"), "bill_id")), "Bill"),
  }),
  "POST /bills/add": ({ engine, body }) => {
    const { approve, ...input } = body;
    return fromResult(engine.createBill(input, flag(approve)), 201);
  },
  "POST /bills/approve": ({ engine, q }) => fromResult(engine.approveBill(need(q.get("bill_id"), "bill_id"))),
  "POST /bills/void": ({ engine, q, body }) =>
    fromResult(engine.voidDocument("bill", need(q.get("bill_id"), "bill_id"), String(body.reason ?? ""))),
  "GET /supplier-payments/list": ({ state, q }) =>
    listResult(state.supplierPayments, q, {
      search: ["number", "reference"],
      filters: { party_id: "party_id", document_id: "document_id", method: "method" },
      dateField: "date",
      defaultSort: { field: "date", order: "desc" },
    }),
  "POST /supplier-payments/add": ({ engine, body }) => fromResult(engine.recordPayment("payment", body), 201),
  "GET /supplier-credits/list": ({ state, q }) => creditList(state.supplierCredits, q),
  "GET /supplier-credits/get": ({ state, q }) => ({
    data: found(state.supplierCredits.find((c) => c.id === need(q.get("supplier_credit_id"), "supplier_credit_id")), "Supplier credit"),
  }),
  "POST /supplier-credits/add": ({ engine, body }) => fromResult(engine.createCreditNote("supplier", body), 201),
  "POST /supplier-credits/void": ({ engine, q, body }) =>
    fromResult(engine.voidCreditNote("supplier", need(q.get("supplier_credit_id"), "supplier_credit_id"), String(body?.reason ?? ""))),

  // ---- Banking -----------------------------------------------------------------------------------------------------
  "GET /bank-accounts/list": ({ state, q }) => listResult(state.bankAccounts, q, { search: ["name", "bank", "account_number"] }),
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

  // ---- Tax ------------------------------------------------------------------------------------------------------------
  "GET /tax-codes/list": ({ state, q }) => listResult(state.taxCodes, q, { search: ["code", "name"], filters: { kind: "kind" } }),

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
  "GET /imports/list": ({ state, q }) =>
    listResult(state.importBatches, q, {
      search: ["number", "file_name", "entity"],
      filters: { source_id: "source_id", status: "status" },
      defaultSort: { field: "created_at", order: "desc" },
    }),
  "POST /imports/add": ({ engine, body }) => fromResult(engine.createImport(body), 201),
  "POST /imports/post": ({ engine, q }) => fromResult(engine.postImportBatch(need(q.get("import_batch_id"), "import_batch_id"))),
  "POST /imports/reprocess": ({ engine, q }) =>
    fromResult(engine.reprocessRecord(need(q.get("import_batch_id"), "import_batch_id"), Number(need(q.get("row"), "row")))),

  // ---- Audit ------------------------------------------------------------------------------------------------------------------
  "GET /audit-logs/list": ({ state, q }) => {
    const res = listResult(state.auditEvents, q, {
      search: ["summary", "entity_label", "actor_name", "action"],
      filters: { entity_type: "entity_type", actor_id: "actor_id", actor_type: "actor_type" },
      defaultSort: { field: "occurred_at", order: "desc" },
    });
    const from = q.get("from_date");
    const to = q.get("to_date");
    if (!from && !to) return res;
    const items = (res.data as { items: { occurred_at: string }[] }).items.filter(
      (e) => (!from || e.occurred_at.slice(0, 10) >= from) && (!to || e.occurred_at.slice(0, 10) <= to),
    );
    return { ...res, data: { items } };
  },

  // ---- Reports --------------------------------------------------------------------------------------------------------------------
  "GET /dashboard/statistics": ({ state, q }) => {
    const asAt = q.get("as_at") || todayIso();
    const month = incomeStatement(state.accounts, state.journals, monthStart(asAt), asAt);
    const year = incomeStatement(state.accounts, state.journals, yearStart(asAt), asAt);
    const ar = invoiceRows(state);
    const ap = billRows(state);
    const sum = (xs: number[]) => round2(xs.reduce((t, v) => t + v, 0));
    return {
      data: {
        as_at: asAt,
        revenue_mtd: month.totalRevenue,
        expenses_mtd: round2(month.totalCostOfSales + month.totalOperating),
        net_income_mtd: month.netIncome,
        net_income_ytd: year.netIncome,
        cash_balance: sum([...bankBaseBalances(state).values()]),
        receivables: sum(ar.map((r) => r.outstanding)),
        overdue_receivables: sum(ar.filter((r) => r.status === "OVERDUE").map((r) => r.outstanding)),
        payables: sum(ap.map((r) => r.outstanding)),
        overdue_payables: sum(ap.filter((r) => r.status === "OVERDUE").map((r) => r.outstanding)),
        journals_pending_approval: state.journals.filter((j) => j.status === "PENDING_APPROVAL").length,
        unmatched_statement_lines: state.statementLines.filter((l) => l.status !== "MATCHED").length,
      },
    };
  },
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
