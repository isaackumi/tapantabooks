"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type {
  Account,
  AuditFields,
  CreditNote,
  Currency,
  CurrentUser,
  Customer,
  CustomField,
  CustomFieldEntity,
  Dimension,
  ExchangeRate,
  FieldMapping,
  FxRevaluation,
  ImportBatch,
  JournalEntry,
  OpeningBalancesInput,
  OpeningBalancesView,
  OrgSettings,
  Payment,
  PeriodStatus,
  PurchaseBill,
  SalesInvoice,
  Supplier,
  AccountingRule,
  BankAccount,
  BankStatementLine,
  DataSource,
  ImportRecord,
  FiscalPeriod,
} from "@/models/accounting";
import type {
  CreditNoteInput,
  DocumentInput,
  ImportInput,
  JournalDraftInput,
  JournalIntent,
  LedgerState,
  OrganisationSetupInput,
  PaymentInput,
  StatementImportInput,
  StatementImportResult,
} from "@/mock/api/engine";
import type { FiscalYearView } from "@/lib/fiscalYears";
import { api, ApiError, fetchAll, type HttpMethod, type Query } from "@/core/apiClient";
import { AppConstants } from "@/core/appConstants";
import { currentClaims, mintMockToken, setToken } from "@/core/session";
import { COLLECTIONS, endpointFor, type CacheKey, type CollectionKey } from "@/services/catalogue";
import { setBaseCurrency } from "@/utils/format";
import { addDays } from "@/utils/dates";

export type { JournalDraftInput };

/** What the client keeps: the organisation, its users and the reference collections. */
export type ClientState = Pick<LedgerState, CollectionKey | "org" | "users" | "currentUserId">;

export type Result<T = undefined> = { ok: true; data: T; message?: string } | { ok: false; error: string };

export type LedgerStatus = "loading" | "ready" | "needs-setup" | "error";

const COLLECTION_KEYS = Object.keys(COLLECTIONS) as CollectionKey[];

const applyCurrency = (org: OrgSettings, currencies?: Currency[]) =>
  setBaseCurrency(org.base_currency, currencies?.find((c) => c.code === org.base_currency)?.symbol);

const loadCollection = (key: CollectionKey) => fetchAll<unknown>(COLLECTIONS[key]);

/** Loads the cached collections an endpoint invalidates and returns them as a state patch. */
const reload = async (keys: readonly CacheKey[]): Promise<Partial<ClientState>> => {
  const unique = [...new Set(keys)];
  const entries = await Promise.all(
    unique.map(async (key) =>
      key === "org"
        ? (["org", (await api.get<OrgSettings>("/organisation/get")).data] as const)
        : ([key, await loadCollection(key)] as const),
    ),
  );
  return Object.fromEntries(entries) as Partial<ClientState>;
};

const createActions = (
  stateRef: { current: ClientState | null },
  apply: (patch: Partial<ClientState>) => void,
  reloadAll: () => Promise<void>,
  bumpRevision: () => void,
) => {
  /** Writes in flight, keyed by request. A repeated click joins the pending request instead of sending it twice. */
  const inFlight = new Map<string, Promise<Result<unknown>>>();

  const call = <T,>(method: HttpMethod, path: string, opts: { query?: Query; body?: unknown } = {}): Promise<Result<T>> => {
    if (method === "GET") return send<T>(method, path, opts);
    const key = `${method} ${path} ${JSON.stringify(opts.query ?? {})} ${JSON.stringify(opts.body ?? null)}`;
    const pending = inFlight.get(key);
    if (pending) return pending as Promise<Result<T>>;
    const request = send<T>(method, path, opts).finally(() => inFlight.delete(key));
    inFlight.set(key, request);
    return request;
  };

  const send = async <T,>(method: HttpMethod, path: string, opts: { query?: Query; body?: unknown }): Promise<Result<T>> => {
    try {
      const res =
        method === "GET"
          ? await api.get<T>(path, opts.query)
          : method === "DELETE"
            ? await api.delete<T>(path, opts.query)
            : method === "PUT"
              ? await api.put<T>(path, opts.body, opts.query)
              : await api.post<T>(path, opts.body, opts.query);
      const invalidates = endpointFor(method, path)?.invalidates ?? [];
      if (invalidates.length) apply(await reload(invalidates));
      if (method !== "GET") bumpRevision();
      const detail = res.detail && res.detail !== "Success" ? res.detail : undefined;
      return { ok: true, data: res.data as T, message: detail };
    } catch (e) {
      return { ok: false, error: e instanceof ApiError || e instanceof Error ? e.message : "Request failed." };
    }
  };

  const current = () => stateRef.current!;

  return {
    // ---- Session (mock-only helpers for the demo) -------------------------
    switchUser: async (userId: string): Promise<Result> => {
      const user = current().users.find((u) => u.id === userId);
      const claims = currentClaims();
      if (!user || !claims) return { ok: false, error: "User not found." };
      setToken(mintMockToken(user, claims.tenant_id));
      await reloadAll();
      return { ok: true, data: undefined };
    },
    resetDemo: async (): Promise<Result> => {
      const claims = currentClaims();
      if (!AppConstants.useMockApi || !claims) return { ok: false, error: "Only the demo data can be reset." };
      const { resetTenant } = await import("@/mock/api/db");
      resetTenant(claims.tenant_id);
      await reloadAll();
      return { ok: true, data: undefined };
    },

    // ---- Organisation -------------------------------------------------------
    setupOrganisation: (input: OrganisationSetupInput) => call<OrgSettings>("POST", "/organisation/setup", { body: input }),
    updateOrg: (patch: Partial<OrgSettings>) => call<OrgSettings>("PUT", "/organisation/update", { body: patch }),
    saveDimension: (input: { kind: Dimension["kind"]; code: string; name: string; description?: string }) =>
      call<Dimension>("POST", "/dimensions/add", { body: input }),
    toggleDimension: (id: string) => {
      const dim = current().dimensions.find((d) => d.id === id);
      return call<Dimension>("PUT", "/dimensions/update", { query: { dimension_id: id }, body: { is_active: !dim?.is_active } });
    },

    // ---- Currencies -----------------------------------------------------------
    addCurrency: (input: { code: string; name: string; symbol: string }) => call<Currency>("POST", "/currencies/add", { body: input }),
    toggleCurrency: (code: string) => {
      const c = current().currencies.find((x) => x.code === code);
      return call<Currency>("PUT", "/currencies/update", { query: { currency_code: code }, body: { is_active: !c?.is_active } });
    },
    addExchangeRate: (input: { currency: string; date: string; rate: number }) =>
      call<ExchangeRate>("POST", "/exchange-rates/add", { body: input }),
    deleteExchangeRate: (id: string) => call<ExchangeRate>("DELETE", "/exchange-rates/delete", { query: { exchange_rate_id: id } }),
    fetchReferenceRates: () => call<ExchangeRate[]>("POST", "/exchange-rates/fetch-reference"),
    runRevaluation: (periodId: string) => call<FxRevaluation>("POST", "/revaluations/run", { query: { period_id: periodId } }),

    // ---- Opening balances ---------------------------------------------------------
    saveOpeningBalances: (input: OpeningBalancesInput) =>
      call<OpeningBalancesView>("PUT", "/opening-balances/update", { body: input }),

    // ---- Custom fields ------------------------------------------------------------
    addCustomField: (input: Omit<CustomField, "id" | "position" | "is_active" | keyof AuditFields>) =>
      call<CustomField>("POST", "/custom-fields/add", { body: input }),
    updateCustomField: (id: string, patch: Partial<CustomField>) =>
      call<CustomField>("PUT", "/custom-fields/update", { query: { custom_field_id: id }, body: patch }),
    deleteCustomField: (id: string) => call<CustomField>("DELETE", "/custom-fields/delete", { query: { custom_field_id: id } }),
    moveCustomField: (id: string, direction: -1 | 1) =>
      call<CustomField>("POST", "/custom-fields/move", { query: { custom_field_id: id }, body: { direction } }),
    setCustomFieldValues: (entity: CustomFieldEntity, id: string, values: Record<string, string>) =>
      call<unknown>("PUT", "/custom-fields/values", { query: { entity, record_id: id }, body: { values } }),

    // ---- Chart of accounts ------------------------------------------------------------
    createAccount: (input: {
      code: string;
      name: string;
      parent_id: string;
      subtype: string;
      description?: string;
      is_bank?: boolean;
      custom_fields?: Record<string, string>;
    }) => call<Account>("POST", "/accounts/add", { body: input }),
    updateAccount: (
      id: string,
      patch: { name?: string; description?: string; is_active?: boolean; custom_fields?: Record<string, string> },
    ) => call<Account>("PUT", "/accounts/update", { query: { account_id: id }, body: patch }),

    // ---- Journals ----------------------------------------------------------------------
    createJournal: (input: JournalDraftInput, intent: JournalIntent) =>
      call<JournalEntry>("POST", "/journals/add", { body: { ...input, intent } }),
    updateDraftJournal: (id: string, input: JournalDraftInput) =>
      call<JournalEntry>("PUT", "/journals/update", { query: { journal_id: id }, body: input }),
    submitJournal: (id: string) => call<JournalEntry>("POST", "/journals/submit", { query: { journal_id: id } }),
    approveJournal: (id: string) => call<JournalEntry>("POST", "/journals/approve", { query: { journal_id: id } }),
    rejectJournal: (id: string, reason: string) =>
      call<JournalEntry>("POST", "/journals/reject", { query: { journal_id: id }, body: { reason } }),
    reverseJournal: (id: string, date: string, reason: string) =>
      call<JournalEntry>("POST", "/journals/reverse", { query: { journal_id: id }, body: { date, reason } }),
    deleteDraftJournal: (id: string) => call<JournalEntry>("DELETE", "/journals/delete", { query: { journal_id: id } }),
    setPeriodStatus: (id: string, status: PeriodStatus) =>
      call<FiscalPeriod>("PUT", "/fiscal-periods/update-status", { query: { period_id: id }, body: { status } }),
    closeFiscalYear: (id: string) =>
      call<{ fiscal_year: FiscalYearView; journal: JournalEntry | null }>("POST", "/fiscal-years/close", { query: { fiscal_year_id: id } }),
    reopenFiscalYear: (id: string, reason: string) =>
      call<FiscalYearView>("POST", "/fiscal-years/reopen", { query: { fiscal_year_id: id }, body: { reason } }),
    addFiscalYear: () => call<FiscalYearView>("POST", "/fiscal-years/add"),

    // ---- Parties --------------------------------------------------------------------------
    saveParty: (kind: "customer" | "supplier", input: Partial<Customer> & { name: string }, id?: string) => {
      const base = kind === "customer" ? "/customers" : "/suppliers";
      return id
        ? call<Customer | Supplier>("PUT", `${base}/update`, { query: { [`${kind}_id`]: id }, body: input })
        : call<Customer | Supplier>("POST", `${base}/add`, { body: input });
    },

    // ---- Documents & payments ------------------------------------------------------------------
    createInvoice: (input: DocumentInput, approve: boolean) =>
      call<SalesInvoice>("POST", "/invoices/add", { body: { ...input, approve } }),
    approveInvoice: (id: string) => call<SalesInvoice>("POST", "/invoices/approve", { query: { invoice_id: id } }),
    createBill: (input: DocumentInput, approve: boolean) => call<PurchaseBill>("POST", "/bills/add", { body: { ...input, approve } }),
    approveBill: (id: string) => call<PurchaseBill>("POST", "/bills/approve", { query: { bill_id: id } }),
    voidDocument: (kind: "invoice" | "bill", id: string, reason: string) =>
      call<SalesInvoice | PurchaseBill>("POST", `/${kind}s/void`, { query: { [`${kind}_id`]: id }, body: { reason } }),
    recordPayment: (kind: "receipt" | "payment", input: PaymentInput) =>
      call<Payment>("POST", kind === "receipt" ? "/receipts/add" : "/supplier-payments/add", { body: input }),
    voidPayment: (kind: "receipt" | "payment", id: string, reason: string) =>
      kind === "receipt"
        ? call<Payment>("POST", "/receipts/void", { query: { receipt_id: id }, body: { reason } })
        : call<Payment>("POST", "/supplier-payments/void", { query: { supplier_payment_id: id }, body: { reason } }),
    createCreditNote: (kind: "customer" | "supplier", input: CreditNoteInput) =>
      call<CreditNote>("POST", kind === "customer" ? "/credit-notes/add" : "/supplier-credits/add", { body: input }),
    voidCreditNote: (kind: "customer" | "supplier", id: string, reason: string) =>
      kind === "customer"
        ? call<CreditNote>("POST", "/credit-notes/void", { query: { credit_note_id: id }, body: { reason } })
        : call<CreditNote>("POST", "/supplier-credits/void", { query: { supplier_credit_id: id }, body: { reason } }),

    // ---- Banking -------------------------------------------------------------------------------------
    transferFunds: (input: { from: string; to: string; amount: number; date: string; memo: string; rate?: number }) =>
      call<JournalEntry>("POST", "/bank-accounts/transfer", { body: input }),
    matchStatementLine: (lineId: string, journalId: string) =>
      call<BankStatementLine>("POST", "/reconciliation/match", { body: { statement_line_id: lineId, journal_id: journalId } }),
    unmatchStatementLine: (lineId: string) =>
      call<BankStatementLine>("POST", "/reconciliation/unmatch", { query: { statement_line_id: lineId } }),
    createEntryFromStatementLine: (lineId: string, accountId: string, memo: string) =>
      call<BankStatementLine>("POST", "/reconciliation/create-entry", {
        body: { statement_line_id: lineId, account_id: accountId, memo },
      }),
    importStatementLines: (input: StatementImportInput) =>
      call<StatementImportResult>("POST", "/bank-statement-lines/import", { body: input }),
    completeReconciliation: (bankId: string) =>
      call<BankAccount>("POST", "/reconciliation/complete", { query: { bank_account_id: bankId } }),

    // ---- Integrations -----------------------------------------------------------------------------------
    connectSource: (id: string, input: { entities: string[]; schedule: string; connection: Record<string, string> }) =>
      call<DataSource>("POST", "/data-sources/connect", { query: { data_source_id: id }, body: input }),
    disconnectSource: (id: string) => call<DataSource>("POST", "/data-sources/disconnect", { query: { data_source_id: id } }),
    syncSource: (id: string) => call<DataSource>("POST", "/data-sources/sync", { query: { data_source_id: id } }),
    saveMapping: (input: Omit<FieldMapping, "id">, id?: string) =>
      id
        ? call<FieldMapping>("PUT", "/field-mappings/update", { query: { field_mapping_id: id }, body: input })
        : call<FieldMapping>("POST", "/field-mappings/add", { body: input }),
    removeMapping: (id: string) => call<FieldMapping>("DELETE", "/field-mappings/delete", { query: { field_mapping_id: id } }),
    toggleRule: (id: string) => {
      const rule = current().rules.find((r) => r.id === id);
      return call<AccountingRule>("PUT", "/accounting-rules/update", { query: { rule_id: id }, body: { is_active: !rule?.is_active } });
    },
    createImport: (input: ImportInput) => call<ImportBatch>("POST", "/imports/add", { body: input }),
    postImportBatch: (id: string) => call<ImportBatch>("POST", "/imports/post", { query: { import_batch_id: id } }),
    reprocessRecord: (batchId: string, row: ImportRecord["row"]) =>
      call<ImportBatch>("POST", "/imports/reprocess", { query: { import_batch_id: batchId, row } }),
  };
};

export type LedgerActions = ReturnType<typeof createActions>;

interface LedgerContextValue {
  state: ClientState;
  actions: LedgerActions;
  /** Increments after every successful write or reload; report queries refetch when it changes. */
  revision: number;
}

interface LedgerShell {
  status: LedgerStatus;
  error: string | null;
  org: OrgSettings | null;
  value: LedgerContextValue | null;
  retry: () => void;
}

const LedgerContext = createContext<LedgerShell | undefined>(undefined);

/** Loads the tenant's books from the API once a session exists, and keeps them in step after every write. */
export const LedgerProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<ClientState | null>(null);
  const [status, setStatus] = useState<LedgerStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [org, setOrg] = useState<OrgSettings | null>(null);
  const [revision, setRevision] = useState(0);
  const stateRef = useRef<ClientState | null>(null);
  const bumpRevision = useCallback(() => setRevision((r) => r + 1), []);

  const apply = useCallback((patch: Partial<ClientState>) => {
    if (!stateRef.current) return;
    const next = { ...stateRef.current, ...patch };
    if (patch.org) {
      applyCurrency(patch.org, next.currencies);
      setOrg(patch.org);
    }
    stateRef.current = next;
    setState(next);
  }, []);

  const loadAll = useCallback(async () => {
    setError(null);
    try {
      const orgRes = await api.get<OrgSettings>("/organisation/get");
      const loadedOrg = orgRes.data!;
      setOrg(loadedOrg);
      applyCurrency(loadedOrg);
      if (!loadedOrg.setup_completed) {
        setStatus("needs-setup");
        return;
      }
      const [users, ...lists] = await Promise.all([fetchAll<CurrentUser>("/users/list"), ...COLLECTION_KEYS.map(loadCollection)]);
      const collections = Object.fromEntries(COLLECTION_KEYS.map((k, i) => [k, lists[i]]));
      const next = {
        ...collections,
        org: loadedOrg,
        users,
        currentUserId: currentClaims()?.user_id ?? users[0]?.id ?? "",
      } as ClientState;
      applyCurrency(loadedOrg, next.currencies);
      stateRef.current = next;
      setState(next);
      setRevision((r) => r + 1);
      setStatus("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the books.");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const actions = useMemo(() => createActions(stateRef, apply, loadAll, bumpRevision), [apply, loadAll, bumpRevision]);

  const shell = useMemo<LedgerShell>(
    () => ({
      status,
      error,
      org,
      value: state ? { state, actions, revision } : null,
      retry: () => {
        setStatus("loading");
        void loadAll();
      },
    }),
    [status, error, org, state, actions, revision, loadAll],
  );

  return <LedgerContext.Provider value={shell}>{children}</LedgerContext.Provider>;
};

/** Load status for the gate that wraps the app screens. */
export const useLedgerShell = () => {
  const ctx = useContext(LedgerContext);
  if (!ctx) throw new Error("useLedgerShell must be used within a LedgerProvider");
  return ctx;
};

export const useLedger = (): LedgerContextValue => {
  const ctx = useContext(LedgerContext);
  if (!ctx?.value) throw new Error("useLedger must be used inside a loaded LedgerProvider");
  return ctx.value;
};

export const useCurrentUser = (): CurrentUser => {
  const { state } = useLedger();
  return state.users.find((u) => u.id === state.currentUserId) ?? state.users[0];
};

export const periodForDate = (s: Pick<ClientState, "periods">, date: string) =>
  s.periods.find((p) => date >= p.start_date && date <= p.end_date);

export const defaultDueDate = (issue: string, terms: number) => addDays(issue, terms);
