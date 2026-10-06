// Mock accounting backend: the business rules tvs-accounting-bk will enforce,
// run in the browser behind the /api/v1 routes in ./routes.ts.

import type {
  Account,
  AccountType,
  AuditEvent,
  AuditFields,
  Customer,
  Currency,
  CurrentUser,
  CustomField,
  CustomFieldEntity,
  ExchangeRate,
  FiscalPeriod,
  FxRevaluation,
  Dimension,
  DocumentLine,
  FieldMapping,
  ImportBatch,
  ImportRecord,
  JournalEntry,
  JournalStatus,
  OpeningBalancesInput,
  OpeningBalancesView,
  OpeningItemInput,
  OrganisationSetupInput,
  OrgSettings,
  Payment,
  PaymentMethod,
  PeriodStatus,
  PurchaseBill,
  SalesInvoice,
  SourceRef,
  Supplier,
} from "@/models/accounting";
import { buildSeed, CURRENT_USER, USERS, ACC, TAX, openingEquityAccount, stamp, type SeedData } from "@/mock/seed";
import { affectsLedger, isBalanced, lineTotals } from "@/lib/ledger";
import { documentTotals } from "@/lib/documents";
import {
  carryingBaseFor,
  documentJournalLines,
  isForeign,
  rateOn,
  revaluationJournalLines,
  revaluationLines,
  settlementLines,
  toBase,
} from "@/lib/fx";
import { customFieldUsage, normaliseCustomValues, recordsForEntity, validateCustomValues } from "@/lib/customFields";
import { BASE_CURRENCY, CURRENCY_SYMBOLS, fmtCurrency, fmtDate, fmtMoney, fmtRate, round2 } from "@/utils/format";
import { addDays, nowIso, todayIso } from "@/utils/dates";

/** `users` stands in for the tenant's cp_users rows; `currentUserId` is the JWT `user_id` of the request being served. */
export type LedgerState = SeedData & { currentUserId: string; users: CurrentUser[] };

export type Result<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string };

const ok = <T,>(data: T, message?: string): Result<T> => ({ ok: true, data, message });
const fail = (error: string): Result<never> => ({ ok: false, error });

export const ALL_USERS = Object.values(USERS);

export interface JournalDraftLine {
  account_id: string;
  description?: string;
  debit: number;
  credit: number;
  cost_centre_id?: string | null;
  currency?: string | null;
  amount_fc?: number | null;
}

export interface JournalDraftInput {
  date: string;
  memo: string;
  reference?: string;
  branch_id: string | null;
  lines: JournalDraftLine[];
  custom_fields?: Record<string, string>;
}

export type JournalIntent = "DRAFT" | "POST";

export interface DocumentInput {
  party_id: string;
  issue_date: string;
  due_date: string;
  supplier_reference?: string;
  branch_id: string | null;
  notes?: string;
  currency: string;
  exchange_rate: number;
  lines: Omit<DocumentLine, "id">[];
  custom_fields?: Record<string, string>;
}

export interface PaymentInput {
  document_id: string;
  date: string;
  /** In the document currency. */
  amount: number;
  /** Rate on the payment date; ignored for base-currency documents. */
  exchange_rate: number;
  method: PaymentMethod;
  bank_account_id: string;
  reference?: string;
}

export interface ImportInput {
  source_id: string;
  entity: string;
  file_name: string | null;
  records: Omit<ImportRecord, "posted">[];
  post: boolean;
}

export type { OrganisationSetupInput };

let idCounter = 0;
const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${(idCounter++).toString(36)}`;

const nextNumber = (existing: string[], prefix: string) => {
  const max = existing.reduce((m, n) => {
    if (!n.startsWith(prefix)) return m;
    const v = Number(n.slice(prefix.length));
    return Number.isFinite(v) && v > m ? v : m;
  }, 0);
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
};

// ---------------------------------------------------------------------------
// Pure helpers operating on a mutable draft of the state
// ---------------------------------------------------------------------------

const actorOf = (s: LedgerState) => s.users.find((u) => u.id === s.currentUserId) ?? s.users[0] ?? CURRENT_USER;

const audit = (
  s: LedgerState,
  e: Pick<AuditEvent, "action" | "entity_type" | "entity_id" | "entity_label" | "summary"> & {
    changes?: AuditEvent["changes"];
  },
) => {
  const user = actorOf(s);
  s.auditEvents.unshift({
    id: newId("aud"),
    occurred_at: nowIso(),
    actor_id: user.id,
    actor_name: user.name,
    actor_type: "USER",
    ...e,
  });
};

export const periodForDate = (s: Pick<LedgerState, "periods">, date: string) =>
  s.periods.find((p) => date >= p.start_date && date <= p.end_date);

const checkPeriod = (s: LedgerState, date: string): string | null => {
  if (!date) return "Choose a date.";
  const period = periodForDate(s, date);
  if (!period) return `No fiscal period covers ${date}. Add the period in Fiscal periods first.`;
  if (period.status !== "OPEN" && s.org.block_posting_to_locked_periods) {
    return `${period.name} is ${period.status.toLowerCase()}. Reopen it in Fiscal periods before posting to it.`;
  }
  if (date > todayIso()) return "Entries cannot be posted with a future date.";
  return null;
};

const validateLines = (
  s: LedgerState,
  lines: JournalDraftLine[],
  { allowControl }: { allowControl: boolean },
): string | null => {
  const used = lines.filter((l) => l.account_id || l.debit || l.credit);
  if (used.length < 2) return "A journal needs at least two lines.";
  for (const [i, l] of used.entries()) {
    const n = i + 1;
    const account = s.accounts.find((a) => a.id === l.account_id);
    if (!account) return `Line ${n}: choose an account.`;
    if (account.is_group) return `Line ${n}: ${account.name} is a group account and cannot be posted to.`;
    if (!account.is_active) return `Line ${n}: ${account.name} is inactive.`;
    if (account.is_control && !allowControl) {
      return `Line ${n}: ${account.name} is a control account. Use an invoice, bill or payment so the sub-ledger stays in step.`;
    }
    const dr = Number(l.debit) || 0;
    const cr = Number(l.credit) || 0;
    if (dr < 0 || cr < 0) return `Line ${n}: amounts cannot be negative.`;
    if (dr > 0 && cr > 0) return `Line ${n}: enter a debit or a credit, not both.`;
    if (dr === 0 && cr === 0) return `Line ${n}: enter an amount.`;
    const bank = s.bankAccounts.find((b) => b.gl_account_id === account.id);
    if (bank && isForeign(bank.currency) && !(l.currency === bank.currency && (Number(l.amount_fc) || 0) > 0)) {
      return `Line ${n}: ${account.name} is held in ${bank.currency}. Enter the ${bank.currency} amount as well.`;
    }
  }
  if (!isBalanced(used)) {
    const t = lineTotals(used);
    return `Debits (${fmtCurrency(t.debit)}) and credits (${fmtCurrency(t.credit)}) differ by ${fmtCurrency(
      Math.abs(t.difference),
    )}.`;
  }
  return null;
};

const writeJournal = (
  s: LedgerState,
  input: JournalDraftInput,
  status: JournalStatus,
  source: SourceRef,
): JournalEntry => {
  const user = actorOf(s);
  const at = nowIso();
  const posted = status === "POSTED";
  const entry: JournalEntry = {
    id: newId("jn"),
    number: nextNumber(
      s.journals.map((j) => j.number),
      s.org.journal_prefix,
    ),
    date: input.date,
    memo: input.memo.trim(),
    reference: input.reference?.trim() || source.reference,
    status,
    source,
    branch_id: input.branch_id,
    lines: input.lines
      .filter((l) => (Number(l.debit) || 0) > 0 || (Number(l.credit) || 0) > 0)
      .map((l) => ({
        id: newId("jl"),
        account_id: l.account_id,
        description: l.description?.trim() || undefined,
        debit: round2(Number(l.debit) || 0),
        credit: round2(Number(l.credit) || 0),
        branch_id: input.branch_id,
        cost_centre_id: l.cost_centre_id ?? null,
        ...(l.currency ? { currency: l.currency, amount_fc: l.amount_fc ?? null } : {}),
      })),
    custom_fields: input.custom_fields && Object.keys(input.custom_fields).length ? input.custom_fields : undefined,
    posted_at: posted ? at : null,
    posted_by: posted ? user.name : null,
    approved_by: null,
    reversal_of_id: null,
    reversed_by_id: null,
    ...stamp(at, user),
  };
  s.journals.push(entry);
  return entry;
};

const touch = <T extends { updated_at: string; updated_by: string | null; updated_by_id: string | null }>(
  s: LedgerState,
  row: T,
) => {
  const user = actorOf(s);
  row.updated_at = nowIso();
  row.updated_by = user.name;
  row.updated_by_id = user.id;
};

const docJournalLines = (
  s: LedgerState,
  doc: { lines: DocumentLine[]; currency: string; exchange_rate: number },
  partyAccount: string,
  partyName: string,
  kind: "SALE" | "PURCHASE",
): JournalDraftLine[] =>
  documentJournalLines({
    lines: doc.lines,
    taxCodes: s.taxCodes,
    currency: doc.currency,
    rate: doc.exchange_rate,
    partyAccount,
    partyName,
    kind,
    fallbackTaxAccount: kind === "SALE" ? ACC.vatOut : ACC.vatIn,
  });

const checkCustom = (s: LedgerState, entity: CustomFieldEntity, values: Record<string, string> | undefined) =>
  validateCustomValues(s.customFields, entity, normaliseCustomValues(values));

const checkCurrency = (s: LedgerState, currency: string, rate: number): string | null => {
  if (currency === BASE_CURRENCY) return null;
  const c = s.currencies.find((x) => x.code === currency);
  if (!c) return `${currency} is not set up. Add it in Settings → Currencies.`;
  if (!c.is_active) return `${currency} is switched off. Turn it on in Settings → Currencies.`;
  if (!(rate > 0)) return `Enter the ${currency} exchange rate.`;
  return null;
};

/**
 * Makes `code` the base currency: adds and activates it, and moves bank accounts,
 * parties and drafts held in the previous base over to it. Callers guarantee
 * nothing has been posted yet.
 */
const adoptBaseCurrency = (s: LedgerState, code: string | undefined): string | null => {
  if (!code || !/^[A-Z]{3}$/.test(code)) return "Choose the base currency (three-letter ISO code, e.g. GHS).";
  const previous = s.org.base_currency;
  const existing = s.currencies.find((c) => c.code === code);
  if (existing) existing.is_active = true;
  else s.currencies.push({ code, name: code, symbol: CURRENCY_SYMBOLS[code] ?? code, is_active: true });
  if (previous === code) return null;
  const old = s.currencies.find((c) => c.code === previous);
  if (old) old.is_active = false;
  for (const row of [...s.bankAccounts, ...s.customers, ...s.suppliers]) {
    if (row.currency === previous) row.currency = code;
  }
  for (const doc of [...s.invoices, ...s.bills]) {
    if (doc.state === "DRAFT" && doc.currency === previous) {
      doc.currency = code;
      doc.exchange_rate = 1;
    }
  }
  return null;
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Twelve open monthly periods for the financial year containing `today`, starting in the `MM-01` month. */
export const fiscalYearPeriods = (start: string, today: string): FiscalPeriod[] => {
  const startMonth = Number(start.slice(0, 2));
  const [y, m] = today.split("-").map(Number);
  const firstYear = m >= startMonth ? y : y - 1;
  return Array.from({ length: 12 }, (_, i) => {
    const monthIndex = (startMonth - 1 + i) % 12;
    const year = firstYear + Math.floor((startMonth - 1 + i) / 12);
    const mm = String(monthIndex + 1).padStart(2, "0");
    const last = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
    return {
      id: `per_${year}_${mm}`,
      name: `${MONTHS[monthIndex]} ${year}`,
      start_date: `${year}-${mm}-01`,
      end_date: `${year}-${mm}-${String(last).padStart(2, "0")}`,
      status: "OPEN" as const,
      locked_by: null,
      locked_at: null,
    };
  });
};

const validateDocument = (s: LedgerState, input: DocumentInput, partyLabel: string): string | null => {
  if (!input.party_id) return `Choose a ${partyLabel}.`;
  if (!input.issue_date) return "Choose an issue date.";
  if (!input.due_date) return "Choose a due date.";
  const currencyError = checkCurrency(s, input.currency, input.exchange_rate);
  if (currencyError) return currencyError;
  if (input.due_date < input.issue_date) return "The due date cannot be before the issue date.";
  if (input.lines.length === 0) return "Add at least one line.";
  for (const [i, l] of input.lines.entries()) {
    const n = i + 1;
    if (!l.description.trim()) return `Line ${n}: add a description.`;
    if (!(l.quantity > 0)) return `Line ${n}: quantity must be greater than zero.`;
    if (!(l.unit_price > 0)) return `Line ${n}: unit price must be greater than zero.`;
    if (!l.account_id) return `Line ${n}: choose an account.`;
    if (!l.tax_code_id) return `Line ${n}: choose a tax code.`;
  }
  return checkCustom(s, partyLabel === "customer" ? "Invoice" : "Bill", input.custom_fields);
};

const reverseInto = (s: LedgerState, original: JournalEntry, date: string, reason: string) => {
  const reversal = writeJournal(
    s,
    {
      date,
      memo: `Reversal of ${original.number} – ${reason}`,
      reference: original.reference,
      branch_id: original.branch_id,
      lines: original.lines.map((l) => ({
        account_id: l.account_id,
        description: l.description,
        debit: l.credit,
        credit: l.debit,
        cost_centre_id: l.cost_centre_id,
        currency: l.currency,
        amount_fc: l.amount_fc,
      })),
    },
    "POSTED",
    { ...original.source },
  );
  reversal.reversal_of_id = original.id;
  original.status = "REVERSED";
  original.reversed_by_id = reversal.id;
  touch(s, original);
  return reversal;
};

// ---------------------------------------------------------------------------
// Opening balances
// ---------------------------------------------------------------------------

const OPENING_SOURCE = { type: "OPENING_BALANCE", reference: "OPENING" } as const;

/** Older tenants were provisioned before the account existed. */
const ensureOpeningEquity = (s: LedgerState) => {
  if (!s.accounts.some((a) => a.id === ACC.openingEquity)) s.accounts.push(openingEquityAccount());
};

const isOpeningEntry = (s: LedgerState, j: JournalEntry) => {
  if (j.source.type === "OPENING_BALANCE" || j.id === s.org.opening_balance_journal_id) return true;
  const reversal = j.reversed_by_id ? s.journals.find((r) => r.id === j.reversed_by_id) : null;
  return reversal?.source.type === "OPENING_BALANCE";
};

const openingItems = (s: LedgerState) => ({
  receivables: s.invoices.filter((i) => i.source.type === "OPENING_BALANCE" && i.state !== "VOID"),
  payables: s.bills.filter((b) => b.source.type === "OPENING_BALANCE" && b.state !== "VOID"),
});

export const openingBalancesView = (s: LedgerState): OpeningBalancesView => {
  const journal = s.journals.find((j) => j.id === s.org.opening_balance_journal_id && j.status === "POSTED") ?? null;
  const firstTransaction = s.journals
    .filter((j) => affectsLedger(j) && !isOpeningEntry(s, j))
    .reduce<string | null>((min, j) => (min === null || j.date < min ? j.date : min), null);
  const equity = s.journals
    .filter(affectsLedger)
    .flatMap((j) => j.lines)
    .filter((l) => l.account_id === ACC.openingEquity)
    .reduce((sum, l) => sum + l.debit - l.credit, 0);
  return {
    conversion_date: s.org.conversion_date ?? null,
    journal_id: journal?.id ?? null,
    journal_number: journal?.number ?? null,
    lines: (journal?.lines ?? [])
      .filter((l) => l.account_id !== ACC.openingEquity)
      .map((l) => ({ account_id: l.account_id, debit: l.debit, credit: l.credit })),
    ...openingItems(s),
    opening_equity_balance: round2(equity),
    first_transaction_date: firstTransaction,
    locked_reason: s.org.conversion_date ? checkPeriod(s, s.org.conversion_date) : null,
  };
};

const validateOpeningItem = (
  s: LedgerState,
  item: OpeningItemInput,
  kind: "receivable" | "payable",
  n: number,
  date: string,
  taken: Set<string>,
): string | null => {
  const label = `${kind === "receivable" ? "Receivable" : "Payable"} ${n}`;
  const party = (kind === "receivable" ? s.customers : s.suppliers).find((p) => p.id === item.party_id);
  if (!party) return `${label}: choose a ${kind === "receivable" ? "customer" : "supplier"}.`;
  const reference = item.reference?.trim();
  if (!reference) return `${label}: enter the invoice number from your old system.`;
  if (!item.issue_date) return `${label}: enter the invoice date.`;
  if (item.issue_date > date) return `${label}: the invoice date must be on or before the conversion date.`;
  if (!item.due_date || item.due_date < item.issue_date) return `${label}: the due date cannot be before the invoice date.`;
  if (!(round2(Number(item.amount) || 0) > 0)) return `${label}: enter the amount still outstanding.`;
  const key = kind === "receivable" ? reference.toLowerCase() : `${party.id}|${reference.toLowerCase()}`;
  const clash =
    kind === "receivable"
      ? s.invoices.some((i) => i.number.toLowerCase() === key)
      : s.bills.some((b) => b.state !== "VOID" && `${b.supplier_id}|${b.supplier_reference.toLowerCase()}` === key);
  if (clash || taken.has(key)) return `${label}: ${reference} is already recorded${kind === "payable" ? ` for ${party.name}` : ""}.`;
  taken.add(key);
  return null;
};

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export const createInitialState = (): LedgerState => ({ ...buildSeed(), currentUserId: CURRENT_USER.id, users: ALL_USERS });

/**
 * Books for a tenant that has just signed up: the standard chart of accounts,
 * tax codes, currencies and connectors, but no parties, documents or postings.
 * `setup_completed` stays false until POST /organisation/setup.
 */
export const createTenantState = (owner: CurrentUser, orgName: string): LedgerState => {
  const seed = buildSeed();
  const at = nowIso();
  return {
    ...seed,
    customers: [],
    suppliers: [],
    journals: [],
    invoices: [],
    bills: [],
    receipts: [],
    supplierPayments: [],
    statementLines: [],
    importBatches: [],
    exchangeRates: [],
    fxRevaluations: [],
    auditEvents: [],
    customFields: [],
    fieldMappings: [],
    bankAccounts: seed.bankAccounts
      .filter((b) => b.currency === seed.org.base_currency)
      .map((b) => ({ ...b, statement_balance: 0, statement_date: todayIso(), last_reconciled_at: null, ...stamp(at, owner) })),
    dataSources: seed.dataSources.map((d) => ({
      ...d,
      status: "NOT_CONNECTED" as const,
      connection: {},
      last_run_at: null,
      last_run_status: null,
      records_synced: 0,
      error_count: 0,
      status_message: undefined,
    })),
    rules: seed.rules.map((r) => ({ ...r, postings_count: 0 })),
    dimensions: [],
    periods: fiscalYearPeriods("01-01", todayIso()),
    currencies: seed.currencies.map((c) => ({ ...c, is_active: c.code === seed.org.base_currency })),
    org: {
      ...seed.org,
      name: orgName,
      legal_name: orgName,
      tin: "",
      address: "",
      email: owner.email,
      phone: "",
      setup_completed: false,
      conversion_date: null,
      opening_balance_journal_id: null,
    },
    currentUserId: owner.id,
    users: [owner],
  };
};

export interface StateRef {
  current: LedgerState;
}

export const createLedgerEngine = (stateRef: StateRef, onCommit: (s: LedgerState) => void) => {
  const commit = <T,>(fn: (draft: LedgerState) => Result<T>): Result<T> => {
    const draft = structuredClone(stateRef.current) as LedgerState;
    const res = fn(draft);
    if (res.ok) {
      stateRef.current = draft;
      onCommit(draft);
    }
    return res;
  };

  return {
      // ---- Chart of accounts ------------------------------------------------
      createAccount: (input: {
        code: string;
        name: string;
        parent_id: string;
        subtype: string;
        description?: string;
        is_bank?: boolean;
        custom_fields?: Record<string, string>;
      }) =>
        commit((s) => {
          const customError = checkCustom(s, "Account", input.custom_fields);
          if (customError) return fail(customError);
          const code = input.code.trim();
          if (!/^\d{4}$/.test(code)) return fail("Account code must be four digits.");
          if (s.accounts.some((a) => a.code === code)) return fail(`Code ${code} is already used.`);
          if (!input.name.trim()) return fail("Give the account a name.");
          const parent = s.accounts.find((a) => a.id === input.parent_id && a.is_group);
          if (!parent) return fail("Choose the group this account belongs to.");
          const user = actorOf(s);
          const account: Account = {
            id: `acc_${code}`,
            code,
            name: input.name.trim(),
            type: parent.type as AccountType,
            subtype: input.subtype,
            parent_id: parent.id,
            is_group: false,
            is_active: true,
            is_control: false,
            is_bank: !!input.is_bank,
            description: input.description?.trim() || undefined,
            custom_fields: normaliseCustomValues(input.custom_fields),
            ...stamp(nowIso(), user),
          };
          s.accounts.push(account);
          audit(s, {
            action: "ACCOUNT.CREATED",
            entity_type: "Account",
            entity_id: account.id,
            entity_label: `${account.code} ${account.name}`,
            summary: `Added ${account.name} under ${parent.name}.`,
          });
          return ok(account, `${account.code} ${account.name} added`);
        }),

      updateAccount: (
        id: string,
        patch: { name?: string; description?: string; is_active?: boolean; custom_fields?: Record<string, string> },
      ) =>
        commit((s) => {
          const account = s.accounts.find((a) => a.id === id);
          if (!account) return fail("Account not found.");
          if (patch.name !== undefined && !patch.name.trim()) return fail("Name cannot be empty.");
          if (patch.custom_fields) {
            const customError = checkCustom(s, "Account", patch.custom_fields);
            if (customError) return fail(customError);
            account.custom_fields = normaliseCustomValues(patch.custom_fields, account.custom_fields);
          }
          const changes: NonNullable<AuditEvent["changes"]> = [];
          if (patch.name !== undefined && patch.name.trim() !== account.name) {
            changes.push({ field: "name", from: account.name, to: patch.name.trim() });
            account.name = patch.name.trim();
          }
          if (patch.description !== undefined) account.description = patch.description.trim() || undefined;
          if (patch.is_active !== undefined && patch.is_active !== account.is_active) {
            changes.push({ field: "is_active", from: String(account.is_active), to: String(patch.is_active) });
            account.is_active = patch.is_active;
          }
          touch(s, account);
          audit(s, {
            action: "ACCOUNT.UPDATED",
            entity_type: "Account",
            entity_id: account.id,
            entity_label: `${account.code} ${account.name}`,
            summary: `Updated ${account.name}.`,
            changes,
          });
          return ok(account, "Account updated");
        }),

      // ---- Journals ---------------------------------------------------------
      createJournal: (input: JournalDraftInput, intent: JournalIntent) =>
        commit((s) => {
          if (!input.memo.trim()) return fail("Add a memo describing the entry.");
          if (!input.date) return fail("Choose a date.");
          const customError = checkCustom(s, "Journal", input.custom_fields);
          if (customError) return fail(customError);
          input = { ...input, custom_fields: normaliseCustomValues(input.custom_fields) };
          if (intent === "POST") {
            const periodError = checkPeriod(s, input.date);
            if (periodError) return fail(periodError);
            const lineError = validateLines(s, input.lines, { allowControl: false });
            if (lineError) return fail(lineError);
          }
          const total = lineTotals(input.lines).debit;
          const needsApproval =
            intent === "POST" && s.org.require_approval_for_manual_journals && total >= s.org.approval_threshold;
          const status: JournalStatus = intent === "DRAFT" ? "DRAFT" : needsApproval ? "PENDING_APPROVAL" : "POSTED";
          const entry = writeJournal(s, input, status, { type: "MANUAL", reference: input.reference });
          audit(s, {
            action: status === "DRAFT" ? "JOURNAL.DRAFTED" : status === "POSTED" ? "JOURNAL.POSTED" : "JOURNAL.SUBMITTED",
            entity_type: "Journal",
            entity_id: entry.id,
            entity_label: entry.number,
            summary: entry.memo,
          });
          const message =
            status === "DRAFT"
              ? `${entry.number} saved as draft`
              : status === "POSTED"
                ? `${entry.number} posted`
                : `${entry.number} is ${fmtCurrency(total)}, above the ${fmtCurrency(
                    s.org.approval_threshold,
                  )} threshold. Sent for approval.`;
          return ok(entry, message);
        }),

      updateDraftJournal: (id: string, input: JournalDraftInput) =>
        commit((s) => {
          const j = s.journals.find((x) => x.id === id);
          if (!j || j.status !== "DRAFT") return fail("Only drafts can be edited.");
          const customError = checkCustom(s, "Journal", input.custom_fields);
          if (customError) return fail(customError);
          j.custom_fields = normaliseCustomValues(input.custom_fields, j.custom_fields);
          j.date = input.date;
          j.memo = input.memo.trim();
          j.reference = input.reference?.trim() || undefined;
          j.branch_id = input.branch_id;
          j.lines = input.lines.map((l) => ({
            id: newId("jl"),
            account_id: l.account_id,
            description: l.description,
            debit: round2(Number(l.debit) || 0),
            credit: round2(Number(l.credit) || 0),
            branch_id: input.branch_id,
            cost_centre_id: l.cost_centre_id ?? null,
            ...(l.currency ? { currency: l.currency, amount_fc: l.amount_fc ?? null } : {}),
          }));
          touch(s, j);
          return ok(j, `${j.number} updated`);
        }),

      submitJournal: (id: string) =>
        commit((s) => {
          const j = s.journals.find((x) => x.id === id);
          if (!j || j.status !== "DRAFT") return fail("Only drafts can be posted.");
          const periodError = checkPeriod(s, j.date);
          if (periodError) return fail(periodError);
          const lineError = validateLines(s, j.lines, { allowControl: j.source.type !== "MANUAL" });
          if (lineError) return fail(lineError);
          const total = lineTotals(j.lines).debit;
          const needsApproval = s.org.require_approval_for_manual_journals && total >= s.org.approval_threshold;
          const user = actorOf(s);
          if (needsApproval) {
            j.status = "PENDING_APPROVAL";
          } else {
            j.status = "POSTED";
            j.posted_at = nowIso();
            j.posted_by = user.name;
          }
          touch(s, j);
          audit(s, {
            action: needsApproval ? "JOURNAL.SUBMITTED" : "JOURNAL.POSTED",
            entity_type: "Journal",
            entity_id: j.id,
            entity_label: j.number,
            summary: j.memo,
          });
          return ok(j, needsApproval ? `${j.number} sent for approval` : `${j.number} posted`);
        }),

      approveJournal: (id: string) =>
        commit((s) => {
          const j = s.journals.find((x) => x.id === id);
          if (!j || j.status !== "PENDING_APPROVAL") return fail("This entry is not awaiting approval.");
          const user = actorOf(s);
          if (j.created_by_id === user.id) {
            return fail("You prepared this entry, so someone else has to approve it (maker-checker).");
          }
          const periodError = checkPeriod(s, j.date);
          if (periodError) return fail(periodError);
          j.status = "POSTED";
          j.posted_at = nowIso();
          j.posted_by = user.name;
          j.approved_by = user.name;
          touch(s, j);
          audit(s, {
            action: "JOURNAL.APPROVED",
            entity_type: "Journal",
            entity_id: j.id,
            entity_label: j.number,
            summary: `Approved and posted: ${j.memo}`,
            changes: [{ field: "status", from: "PENDING_APPROVAL", to: "POSTED" }],
          });
          return ok(j, `${j.number} approved and posted`);
        }),

      rejectJournal: (id: string, reason: string) =>
        commit((s) => {
          const j = s.journals.find((x) => x.id === id);
          if (!j || j.status !== "PENDING_APPROVAL") return fail("This entry is not awaiting approval.");
          if (!reason.trim()) return fail("Say why the entry is being sent back.");
          j.status = "DRAFT";
          touch(s, j);
          audit(s, {
            action: "JOURNAL.REJECTED",
            entity_type: "Journal",
            entity_id: j.id,
            entity_label: j.number,
            summary: `Sent back to draft: ${reason.trim()}`,
            changes: [{ field: "status", from: "PENDING_APPROVAL", to: "DRAFT" }],
          });
          return ok(j, `${j.number} returned to the preparer`);
        }),

      deleteDraftJournal: (id: string) =>
        commit((s) => {
          const j = s.journals.find((x) => x.id === id);
          if (!j || j.status !== "DRAFT") return fail("Only drafts can be deleted. Posted entries are reversed.");
          s.journals = s.journals.filter((x) => x.id !== id);
          audit(s, {
            action: "JOURNAL.DELETED",
            entity_type: "Journal",
            entity_id: j.id,
            entity_label: j.number,
            summary: `Deleted draft: ${j.memo}`,
          });
          return ok(undefined, `Draft ${j.number} deleted`);
        }),

      reverseJournal: (id: string, date: string, reason: string) =>
        commit((s) => {
          const j = s.journals.find((x) => x.id === id);
          if (!j || j.status !== "POSTED") return fail("Only posted entries can be reversed.");
          if (j.reversal_of_id) return fail("This entry is itself a reversal.");
          if (j.source.document_id) {
            return fail("This entry belongs to a document. Void the invoice, bill or payment instead.");
          }
          if (j.source.type === "OPENING_BALANCE" || j.id === s.org.opening_balance_journal_id) {
            return fail("Opening balances are changed from Accounting → Opening balances, not reversed.");
          }
          if (!reason.trim()) return fail("Give a reason for the reversal. It is kept on the audit trail.");
          if (date < j.date) return fail("The reversal date cannot be before the original entry.");
          const periodError = checkPeriod(s, date);
          if (periodError) return fail(periodError);
          const reversal = reverseInto(s, j, date, reason.trim());
          audit(s, {
            action: "JOURNAL.REVERSED",
            entity_type: "Journal",
            entity_id: j.id,
            entity_label: j.number,
            summary: `Reversed by ${reversal.number}: ${reason.trim()}`,
            changes: [{ field: "status", from: "POSTED", to: "REVERSED" }],
          });
          return ok(reversal, `${j.number} reversed by ${reversal.number}`);
        }),

      // ---- Fiscal periods ---------------------------------------------------
      setPeriodStatus: (id: string, status: PeriodStatus) =>
        commit((s) => {
          const p = s.periods.find((x) => x.id === id);
          if (!p) return fail("Period not found.");
          const from = p.status;
          if (status === "OPEN") {
            const later = s.periods.find((x) => x.start_date > p.start_date && x.status === "CLOSED");
            if (later) return fail(`Reopen ${later.name} first. Periods close in order.`);
          }
          if (status === "CLOSED") {
            const earlierOpen = s.periods.find((x) => x.start_date < p.start_date && x.status !== "CLOSED");
            if (earlierOpen) return fail(`Close ${earlierOpen.name} first. Periods close in order.`);
            const pending = s.journals.find(
              (j) => j.date >= p.start_date && j.date <= p.end_date && (j.status === "DRAFT" || j.status === "PENDING_APPROVAL"),
            );
            if (pending) return fail(`${pending.number} is still ${pending.status === "DRAFT" ? "a draft" : "awaiting approval"} in this period.`);
          }
          const user = actorOf(s);
          p.status = status;
          p.locked_by = status === "OPEN" ? null : user.name;
          p.locked_at = status === "OPEN" ? null : nowIso();
          audit(s, {
            action: status === "OPEN" ? "PERIOD.REOPENED" : status === "LOCKED" ? "PERIOD.LOCKED" : "PERIOD.CLOSED",
            entity_type: "Fiscal period",
            entity_id: p.id,
            entity_label: p.name,
            summary: `${p.name}: ${from.toLowerCase()} → ${status.toLowerCase()}.`,
            changes: [{ field: "status", from, to: status }],
          });
          return ok(p, `${p.name} is now ${status.toLowerCase()}`);
        }),

      // ---- Parties ----------------------------------------------------------
      saveParty: (
        kind: "customer" | "supplier",
        input: Partial<Customer> & { name: string },
        id?: string,
      ) =>
        commit((s) => {
          const list: (Customer | Supplier)[] = kind === "customer" ? s.customers : s.suppliers;
          const name = input.name.trim();
          if (!name) return fail("Name is required.");
          if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) return fail("Enter a valid email address.");
          if (list.some((p) => p.name.toLowerCase() === name.toLowerCase() && p.id !== id)) {
            return fail(`A ${kind} called ${name} already exists.`);
          }
          if ((input.payment_terms_days ?? 0) < 0) return fail("Payment terms cannot be negative.");
          const currency = input.currency ?? BASE_CURRENCY;
          if (currency !== BASE_CURRENCY && !s.currencies.some((c) => c.code === currency && c.is_active)) {
            return fail(`${currency} is not an active currency.`);
          }
          const customError = checkCustom(s, kind === "customer" ? "Customer" : "Supplier", input.custom_fields);
          if (customError) return fail(customError);
          if ((input.credit_limit ?? 0) < 0) return fail("Credit limit cannot be negative.");
          const user = actorOf(s);
          if (id) {
            const existing = list.find((p) => p.id === id);
            if (!existing) return fail(`${kind} not found.`);
            Object.assign(existing, {
              ...input,
              name,
              custom_fields: normaliseCustomValues(input.custom_fields, existing.custom_fields),
            });
            touch(s, existing);
            audit(s, {
              action: `${kind.toUpperCase()}.UPDATED`,
              entity_type: kind === "customer" ? "Customer" : "Supplier",
              entity_id: existing.id,
              entity_label: existing.name,
              summary: `Updated ${existing.name}.`,
            });
            return ok(existing, `${existing.name} updated`);
          }
          const prefix = kind === "customer" ? "C-" : "S-";
          const created: Customer = {
            id: newId(kind === "customer" ? "cus" : "sup"),
            code: nextNumber(
              list.map((p) => p.code),
              prefix,
            ),
            name,
            email: input.email?.trim() ?? "",
            phone: input.phone?.trim() ?? "",
            city: input.city?.trim() ?? "",
            tin: input.tin?.trim() || undefined,
            payment_terms_days: input.payment_terms_days ?? 30,
            credit_limit: input.credit_limit ?? 0,
            status: "ACTIVE",
            external_reference: input.external_reference || null,
            source: "MANUAL",
            currency,
            custom_fields: normaliseCustomValues(input.custom_fields),
            ...stamp(nowIso(), user),
          };
          list.push(created);
          audit(s, {
            action: `${kind.toUpperCase()}.CREATED`,
            entity_type: kind === "customer" ? "Customer" : "Supplier",
            entity_id: created.id,
            entity_label: created.name,
            summary: `Added ${kind} ${created.name}.`,
          });
          return ok(created, `${created.name} added`);
        }),

      // ---- Sales invoices ---------------------------------------------------
      createInvoice: (input: DocumentInput, approve: boolean) =>
        commit((s) => {
          const err = validateDocument(s, input, "customer");
          if (err) return fail(err);
          const customer = s.customers.find((c) => c.id === input.party_id)!;
          if (customer.status !== "ACTIVE") return fail(`${customer.name} is inactive.`);
          if (approve) {
            const periodError = checkPeriod(s, input.issue_date);
            if (periodError) return fail(periodError);
          }
          const user = actorOf(s);
          const lines = input.lines.map((l) => ({ ...l, id: newId("il") }));
          const invoice: SalesInvoice = {
            id: newId("inv"),
            number: nextNumber(
              s.invoices.map((i) => i.number),
              s.org.invoice_prefix,
            ),
            customer_id: customer.id,
            issue_date: input.issue_date,
            due_date: input.due_date,
            state: approve ? "APPROVED" : "DRAFT",
            lines,
            currency: input.currency,
            exchange_rate: input.currency === BASE_CURRENCY ? 1 : input.exchange_rate,
            amount_paid: 0,
            amount_paid_base: 0,
            journal_id: null,
            branch_id: input.branch_id,
            notes: input.notes,
            source: { type: "MANUAL" },
            custom_fields: normaliseCustomValues(input.custom_fields),
            ...stamp(nowIso(), user),
          };
          if (approve) {
            const j = writeJournal(
              s,
              {
                date: invoice.issue_date,
                memo: `Sales invoice ${invoice.number} – ${customer.name}`,
                branch_id: invoice.branch_id,
                lines: docJournalLines(s, invoice, ACC.ar, customer.name, "SALE"),
              },
              "POSTED",
              { type: "SALES", reference: invoice.number, document_id: invoice.id },
            );
            invoice.journal_id = j.id;
          }
          s.invoices.push(invoice);
          audit(s, {
            action: approve ? "INVOICE.APPROVED" : "INVOICE.DRAFTED",
            entity_type: "Invoice",
            entity_id: invoice.id,
            entity_label: invoice.number,
            summary: `${invoice.number} for ${customer.name} · ${fmtMoney(documentTotals(lines, s.taxCodes).total, invoice.currency)}`,
          });
          return ok(invoice, approve ? `${invoice.number} approved and posted` : `${invoice.number} saved as draft`);
        }),

      approveInvoice: (id: string) =>
        commit((s) => {
          const invoice = s.invoices.find((i) => i.id === id);
          if (!invoice || invoice.state !== "DRAFT") return fail("Only draft invoices can be approved.");
          const invCurrencyError = checkCurrency(s, invoice.currency, invoice.exchange_rate);
          if (invCurrencyError) return fail(invCurrencyError);
          const periodError = checkPeriod(s, invoice.issue_date);
          if (periodError) return fail(periodError);
          const customer = s.customers.find((c) => c.id === invoice.customer_id)!;
          const j = writeJournal(
            s,
            {
              date: invoice.issue_date,
              memo: `Sales invoice ${invoice.number} – ${customer.name}`,
              branch_id: invoice.branch_id,
              lines: docJournalLines(s, invoice, ACC.ar, customer.name, "SALE"),
            },
            "POSTED",
            { type: "SALES", reference: invoice.number, document_id: invoice.id },
          );
          invoice.state = "APPROVED";
          invoice.journal_id = j.id;
          touch(s, invoice);
          audit(s, {
            action: "INVOICE.APPROVED",
            entity_type: "Invoice",
            entity_id: invoice.id,
            entity_label: invoice.number,
            summary: `Approved and posted as ${j.number}.`,
          });
          return ok(invoice, `${invoice.number} approved · ${j.number} posted`);
        }),

      voidDocument: (kind: "invoice" | "bill", id: string, reason: string) =>
        commit((s) => {
          const doc =
            kind === "invoice" ? s.invoices.find((i) => i.id === id) : s.bills.find((b) => b.id === id);
          if (!doc) return fail("Document not found.");
          if (doc.state === "VOID") return fail("Already void.");
          if (doc.source.type === "OPENING_BALANCE") return fail("Brought-forward items are removed from Accounting → Opening balances.");
          if (doc.amount_paid > 0) return fail("Payments have been recorded against it. Reverse those first.");
          if (!reason.trim()) return fail("Give a reason for voiding.");
          if (doc.journal_id) {
            const j = s.journals.find((x) => x.id === doc.journal_id);
            if (j && j.status === "POSTED") {
              const periodError = checkPeriod(s, todayIso());
              if (periodError) return fail(periodError);
              reverseInto(s, j, todayIso(), `void ${doc.number}: ${reason.trim()}`);
            }
          }
          doc.state = "VOID";
          touch(s, doc);
          audit(s, {
            action: kind === "invoice" ? "INVOICE.VOIDED" : "BILL.VOIDED",
            entity_type: kind === "invoice" ? "Invoice" : "Bill",
            entity_id: doc.id,
            entity_label: doc.number,
            summary: `Voided: ${reason.trim()}`,
            changes: [{ field: "state", from: "APPROVED", to: "VOID" }],
          });
          return ok(undefined, `${doc.number} voided`);
        }),

      recordPayment: (kind: "receipt" | "payment", input: PaymentInput) =>
        commit((s) => {
          const isReceipt = kind === "receipt";
          const doc = isReceipt
            ? s.invoices.find((i) => i.id === input.document_id)
            : s.bills.find((b) => b.id === input.document_id);
          if (!doc) return fail("Choose the document being paid.");
          if (doc.state !== "APPROVED") return fail("Only approved documents can be paid.");
          const total = documentTotals(doc.lines, s.taxCodes).total;
          const outstanding = round2(total - doc.amount_paid);
          const amount = round2(Number(input.amount) || 0);
          if (amount <= 0) return fail("Enter an amount greater than zero.");
          if (amount > outstanding + 0.005) {
            return fail(`Amount is more than the ${fmtMoney(outstanding, doc.currency)} outstanding.`);
          }
          if (input.date < doc.issue_date) return fail("Payment date cannot be before the document date.");
          const bank = s.bankAccounts.find((b) => b.id === input.bank_account_id);
          if (!bank) return fail("Choose the bank or cash account.");
          if (isForeign(bank.currency) && bank.currency !== doc.currency) {
            return fail(`${bank.name} holds ${bank.currency}. Use it only for ${bank.currency} documents.`);
          }
          const foreign = isForeign(doc.currency);
          const payRate = foreign ? round2((Number(input.exchange_rate) || 0) * 10000) / 10000 : 1;
          if (foreign && !(payRate > 0)) return fail(`Enter the ${doc.currency} rate on the payment date.`);
          const periodError = checkPeriod(s, input.date);
          if (periodError) return fail(periodError);

          const partyId = isReceipt ? (doc as SalesInvoice).customer_id : (doc as PurchaseBill).supplier_id;
          const party = (isReceipt ? s.customers : s.suppliers).find((p) => p.id === partyId)!;
          const list = isReceipt ? s.receipts : s.supplierPayments;
          const number = nextNumber(
            list.map((p) => p.number),
            isReceipt ? "RCT-2026-" : "PAY-2026-",
          );
          const carrying = carryingBaseFor(doc, total, amount);
          const settlement = settlementLines({
            kind: isReceipt ? "RECEIPT" : "PAYMENT",
            currency: doc.currency,
            amountFc: amount,
            payRate,
            carryingBase: carrying,
            bankGl: bank.gl_account_id,
            bankCurrency: bank.currency,
            partyAccount: isReceipt ? ACC.ar : ACC.ap,
            partyName: party.name,
            fxAccount: s.org.fx_realised_account_id,
          });
          const j = writeJournal(
            s,
            {
              date: input.date,
              memo: isReceipt
                ? `Receipt ${number} from ${party.name} for ${doc.number}`
                : `Payment ${number} to ${party.name} for ${doc.number}`,
              reference: input.reference,
              branch_id: doc.branch_id,
              lines: settlement.lines,
            },
            "POSTED",
            { type: isReceipt ? "SALES" : "PURCHASES", reference: number, document_id: doc.id },
          );
          const user = actorOf(s);
          const payment: Payment = {
            id: newId(isReceipt ? "rcp" : "pmt"),
            number,
            party_id: partyId,
            document_id: doc.id,
            date: input.date,
            amount,
            currency: doc.currency,
            exchange_rate: payRate,
            base_amount: settlement.bankBase,
            fx_gain_loss: settlement.fxGainLoss,
            method: input.method,
            bank_account_id: bank.id,
            reference: input.reference?.trim() || undefined,
            journal_id: j.id,
            ...stamp(nowIso(), user),
          };
          list.push(payment);
          doc.amount_paid = round2(doc.amount_paid + amount);
          doc.amount_paid_base = round2(doc.amount_paid_base + carrying);
          touch(s, doc);
          const fxNote =
            settlement.fxGainLoss === 0
              ? ""
              : ` Realised exchange ${settlement.fxGainLoss > 0 ? "gain" : "loss"} ${fmtCurrency(Math.abs(settlement.fxGainLoss))}.`;
          audit(s, {
            action: isReceipt ? "RECEIPT.RECORDED" : "PAYMENT.RECORDED",
            entity_type: isReceipt ? "Receipt" : "Supplier payment",
            entity_id: payment.id,
            entity_label: number,
            summary: `${fmtMoney(amount, doc.currency)} ${isReceipt ? "from" : "to"} ${party.name} against ${doc.number}.${fxNote}`,
          });
          return ok(payment, `${number} recorded · ${fmtMoney(amount, doc.currency)}${fxNote}`);
        }),

      // ---- Purchase bills ---------------------------------------------------
      createBill: (input: DocumentInput, approve: boolean) =>
        commit((s) => {
          const err = validateDocument(s, input, "supplier");
          if (err) return fail(err);
          if (!input.supplier_reference?.trim()) return fail("Enter the supplier's invoice number.");
          const supplier = s.suppliers.find((c) => c.id === input.party_id)!;
          const duplicate = s.bills.find(
            (b) =>
              b.supplier_id === supplier.id &&
              b.supplier_reference.toLowerCase() === input.supplier_reference!.trim().toLowerCase() &&
              b.state !== "VOID",
          );
          if (duplicate) return fail(`${supplier.name} invoice ${input.supplier_reference} is already ${duplicate.number}.`);
          if (approve) {
            const periodError = checkPeriod(s, input.issue_date);
            if (periodError) return fail(periodError);
          }
          const user = actorOf(s);
          const lines = input.lines.map((l) => ({ ...l, id: newId("bl") }));
          const bill: PurchaseBill = {
            id: newId("bill"),
            number: nextNumber(
              s.bills.map((b) => b.number),
              s.org.bill_prefix,
            ),
            supplier_reference: input.supplier_reference!.trim(),
            supplier_id: supplier.id,
            issue_date: input.issue_date,
            due_date: input.due_date,
            state: approve ? "APPROVED" : "DRAFT",
            lines,
            currency: input.currency,
            exchange_rate: input.currency === BASE_CURRENCY ? 1 : input.exchange_rate,
            amount_paid: 0,
            amount_paid_base: 0,
            journal_id: null,
            branch_id: input.branch_id,
            notes: input.notes,
            source: { type: "MANUAL" },
            custom_fields: normaliseCustomValues(input.custom_fields),
            ...stamp(nowIso(), user),
          };
          if (approve) {
            const j = writeJournal(
              s,
              {
                date: bill.issue_date,
                memo: `Supplier bill ${bill.number} – ${supplier.name}`,
                branch_id: bill.branch_id,
                lines: docJournalLines(s, bill, ACC.ap, supplier.name, "PURCHASE"),
              },
              "POSTED",
              { type: "PURCHASES", reference: bill.number, document_id: bill.id },
            );
            bill.journal_id = j.id;
          }
          s.bills.push(bill);
          audit(s, {
            action: approve ? "BILL.APPROVED" : "BILL.DRAFTED",
            entity_type: "Bill",
            entity_id: bill.id,
            entity_label: bill.number,
            summary: `${bill.number} from ${supplier.name} · ${fmtMoney(documentTotals(lines, s.taxCodes).total, bill.currency)}`,
          });
          return ok(bill, approve ? `${bill.number} approved and posted` : `${bill.number} saved as draft`);
        }),

      approveBill: (id: string) =>
        commit((s) => {
          const bill = s.bills.find((b) => b.id === id);
          if (!bill || bill.state !== "DRAFT") return fail("Only draft bills can be approved.");
          const billCurrencyError = checkCurrency(s, bill.currency, bill.exchange_rate);
          if (billCurrencyError) return fail(billCurrencyError);
          const billCustomError = checkCustom(s, "Bill", bill.custom_fields);
          if (billCustomError) return fail(billCustomError);
          const periodError = checkPeriod(s, bill.issue_date);
          if (periodError) return fail(periodError);
          const supplier = s.suppliers.find((c) => c.id === bill.supplier_id)!;
          const j = writeJournal(
            s,
            {
              date: bill.issue_date,
              memo: `Supplier bill ${bill.number} – ${supplier.name}`,
              branch_id: bill.branch_id,
              lines: docJournalLines(s, bill, ACC.ap, supplier.name, "PURCHASE"),
            },
            "POSTED",
            { type: "PURCHASES", reference: bill.number, document_id: bill.id },
          );
          bill.state = "APPROVED";
          bill.journal_id = j.id;
          touch(s, bill);
          audit(s, {
            action: "BILL.APPROVED",
            entity_type: "Bill",
            entity_id: bill.id,
            entity_label: bill.number,
            summary: `Approved and posted as ${j.number}.`,
          });
          return ok(bill, `${bill.number} approved · ${j.number} posted`);
        }),

      // ---- Banking ----------------------------------------------------------
      /** `amount` is in the currency of the account the money leaves; `rate` converts the foreign side. */
      transferFunds: (input: { from: string; to: string; amount: number; date: string; memo: string; rate?: number }) =>
        commit((s) => {
          if (input.from === input.to) return fail("Choose two different accounts.");
          const from = s.bankAccounts.find((b) => b.id === input.from);
          const to = s.bankAccounts.find((b) => b.id === input.to);
          if (!from || !to) return fail("Choose both accounts.");
          const amount = round2(Number(input.amount) || 0);
          if (amount <= 0) return fail("Enter an amount greater than zero.");
          const foreignCurrencies = [...new Set([from.currency, to.currency].filter(isForeign))];
          if (foreignCurrencies.length > 1) return fail("Transfers between two different foreign currencies are not supported.");
          const fc = foreignCurrencies[0];
          const rate = fc ? Number(input.rate) || 0 : 1;
          if (fc && !(rate > 0)) return fail(`Enter the ${fc} rate for this transfer.`);
          const periodError = checkPeriod(s, input.date);
          if (periodError) return fail(periodError);
          const fromForeign = isForeign(from.currency);
          const base = fromForeign ? toBase(amount, rate) : amount;
          const fcAmount = fc ? (fromForeign ? amount : round2(amount / rate)) : 0;
          const tag = (b: typeof from) => (isForeign(b.currency) ? { currency: b.currency, amount_fc: fcAmount } : {});
          const j = writeJournal(
            s,
            {
              date: input.date,
              memo:
                input.memo.trim() ||
                `Transfer from ${from.name} to ${to.name}${fc ? ` (${fmtMoney(fcAmount, fc)} @ ${fmtRate(rate)})` : ""}`,
              branch_id: null,
              lines: [
                { account_id: to.gl_account_id, debit: base, credit: 0, ...tag(to) },
                { account_id: from.gl_account_id, debit: 0, credit: base, ...tag(from) },
              ],
            },
            "POSTED",
            { type: "BANKING", reference: `TRF-${input.date.replace(/-/g, "")}` },
          );
          audit(s, {
            action: "BANK.TRANSFER",
            entity_type: "Journal",
            entity_id: j.id,
            entity_label: j.number,
            summary: `${fmtMoney(amount, from.currency)} from ${from.name} to ${to.name}.`,
          });
          return ok(j, `Transfer posted as ${j.number}`);
        }),

      matchStatementLine: (lineId: string, journalId: string) =>
        commit((s) => {
          const line = s.statementLines.find((l) => l.id === lineId);
          if (!line) return fail("Statement line not found.");
          const j = s.journals.find((x) => x.id === journalId);
          if (!j) return fail("Ledger entry not found.");
          const bank = s.bankAccounts.find((b) => b.id === line.bank_account_id)!;
          const net = round2(
            j.lines.filter((l) => l.account_id === bank.gl_account_id).reduce((t, l) => t + l.debit - l.credit, 0),
          );
          if (Math.abs(net - line.amount) > 0.005) {
            return fail(`Amounts differ: statement ${fmtCurrency(line.amount)}, ledger ${fmtCurrency(net)}.`);
          }
          if (s.statementLines.some((l) => l.matched_journal_id === journalId && l.id !== lineId)) {
            return fail(`${j.number} is already matched to another statement line.`);
          }
          line.status = "MATCHED";
          line.matched_journal_id = journalId;
          line.suggested_journal_id = null;
          audit(s, {
            action: "RECON.MATCHED",
            entity_type: "Statement line",
            entity_id: line.id,
            entity_label: line.description,
            summary: `Matched to ${j.number}.`,
          });
          return ok(line, `Matched to ${j.number}`);
        }),

      unmatchStatementLine: (lineId: string) =>
        commit((s) => {
          const line = s.statementLines.find((l) => l.id === lineId);
          if (!line || line.status !== "MATCHED") return fail("Line is not matched.");
          line.status = "UNMATCHED";
          line.matched_journal_id = null;
          return ok(line, "Match removed");
        }),

      createEntryFromStatementLine: (lineId: string, accountId: string, memo: string) =>
        commit((s) => {
          const line = s.statementLines.find((l) => l.id === lineId);
          if (!line) return fail("Statement line not found.");
          const account = s.accounts.find((a) => a.id === accountId);
          if (!account || account.is_group) return fail("Choose an account to post the other side to.");
          if (account.is_control) return fail("Use a receipt or payment for customer and supplier money.");
          const periodError = checkPeriod(s, line.date);
          if (periodError) return fail(periodError);
          const bank = s.bankAccounts.find((b) => b.id === line.bank_account_id)!;
          const amt = Math.abs(line.amount);
          const j = writeJournal(
            s,
            {
              date: line.date,
              memo: memo.trim() || line.description,
              branch_id: null,
              lines:
                line.amount > 0
                  ? [
                      { account_id: bank.gl_account_id, debit: amt, credit: 0 },
                      { account_id: accountId, debit: 0, credit: amt },
                    ]
                  : [
                      { account_id: accountId, debit: amt, credit: 0 },
                      { account_id: bank.gl_account_id, debit: 0, credit: amt },
                    ],
            },
            "POSTED",
            { type: "BANKING", reference: line.description.slice(0, 24) },
          );
          line.status = "MATCHED";
          line.matched_journal_id = j.id;
          audit(s, {
            action: "RECON.ENTRY_CREATED",
            entity_type: "Journal",
            entity_id: j.id,
            entity_label: j.number,
            summary: `Created from statement line "${line.description}" and matched.`,
          });
          return ok(j, `${j.number} posted and matched`);
        }),

      completeReconciliation: (bankId: string) =>
        commit((s) => {
          const bank = s.bankAccounts.find((b) => b.id === bankId);
          if (!bank) return fail("Bank account not found.");
          const open = s.statementLines.filter((l) => l.bank_account_id === bankId && l.status !== "MATCHED");
          if (open.length) return fail(`${open.length} statement line(s) are not matched yet.`);
          bank.last_reconciled_at = nowIso();
          touch(s, bank);
          audit(s, {
            action: "RECON.COMPLETED",
            entity_type: "Bank account",
            entity_id: bank.id,
            entity_label: bank.name,
            summary: `Reconciled to statement dated ${bank.statement_date}.`,
          });
          return ok(bank, `${bank.name} reconciled`);
        }),

      // ---- Integrations -----------------------------------------------------
      syncSource: (id: string) =>
        commit((s) => {
          const src = s.dataSources.find((d) => d.id === id);
          if (!src) return fail("Source not found.");
          if (src.status === "NOT_CONNECTED") return fail(`${src.name} is not connected yet.`);
          if (src.status === "ERROR") return fail(src.status_message ?? `${src.name} cannot sync until the connection is fixed.`);
          const count = 5 + Math.floor(Math.random() * 40);
          src.last_run_at = nowIso();
          src.last_run_status = src.status === "WARNING" ? "PARTIAL" : "SUCCESS";
          src.records_synced += count;
          touch(s, src);
          audit(s, {
            action: "SYNC.COMPLETED",
            entity_type: "Data source",
            entity_id: src.id,
            entity_label: src.name,
            summary: `Manual sync: ${count} records${src.error_count ? `, ${src.error_count} still held for review` : ""}.`,
          });
          return ok(count, `${src.name}: ${count} records synced`);
        }),

      connectSource: (id: string, input: { entities: string[]; schedule: string; connection: Record<string, string> }) =>
        commit((s) => {
          const src = s.dataSources.find((d) => d.id === id);
          if (!src) return fail("Source not found.");
          if (input.entities.length === 0) return fail("Pick at least one kind of record to bring in.");
          const missing = Object.entries(input.connection).find(([, v]) => !v.trim());
          if (missing) return fail(`${missing[0]} is required.`);
          const was = src.status;
          src.status = "CONNECTED";
          src.status_message = undefined;
          src.error_count = 0;
          src.entities = input.entities;
          src.schedule = input.schedule;
          src.connection = Object.fromEntries(
            Object.entries(input.connection).map(([k, v]) => [k, /token|secret|key|password/i.test(k) ? "••••••••" : v]),
          );
          src.last_run_at = nowIso();
          src.last_run_status = "SUCCESS";
          touch(s, src);
          audit(s, {
            action: was === "NOT_CONNECTED" ? "SOURCE.CONNECTED" : "SOURCE.RECONNECTED",
            entity_type: "Data source",
            entity_id: src.id,
            entity_label: src.name,
            summary: `${src.name} connected · ${input.entities.join(", ")} · ${input.schedule}.`,
            changes: [{ field: "status", from: was, to: "CONNECTED" }],
          });
          return ok(src, `${src.name} connected`);
        }),

      disconnectSource: (id: string) =>
        commit((s) => {
          const src = s.dataSources.find((d) => d.id === id);
          if (!src) return fail("Source not found.");
          const was = src.status;
          src.status = "NOT_CONNECTED";
          src.connection = {};
          touch(s, src);
          audit(s, {
            action: "SOURCE.DISCONNECTED",
            entity_type: "Data source",
            entity_id: src.id,
            entity_label: src.name,
            summary: `${src.name} disconnected. History is kept.`,
            changes: [{ field: "status", from: was, to: "NOT_CONNECTED" }],
          });
          return ok(src, `${src.name} disconnected`);
        }),

      saveMapping: (input: Omit<FieldMapping, "id">, id?: string) =>
        commit((s) => {
          if (!input.source_field.trim() || !input.target_field.trim()) {
            return fail("Both the source field and the Trovesuite field are required.");
          }
          const clash = s.fieldMappings.find(
            (m) =>
              m.source_id === input.source_id &&
              m.entity === input.entity &&
              m.target_field === input.target_field &&
              m.id !== id,
          );
          if (clash) return fail(`${input.target_field} is already mapped from ${clash.source_field}.`);
          if (id) {
            const m = s.fieldMappings.find((x) => x.id === id);
            if (!m) return fail("Mapping not found.");
            Object.assign(m, input);
            return ok(m, "Mapping updated");
          }
          const m: FieldMapping = { id: newId("fm"), ...input };
          s.fieldMappings.push(m);
          audit(s, {
            action: "MAPPING.CREATED",
            entity_type: "Field mapping",
            entity_id: m.id,
            entity_label: `${m.source_field} → ${m.target_field}`,
            summary: `Mapped ${m.source_field} to ${m.target_field} for ${m.entity}.`,
          });
          return ok(m, "Mapping added");
        }),

      removeMapping: (id: string) =>
        commit((s) => {
          const m = s.fieldMappings.find((x) => x.id === id);
          if (!m) return fail("Mapping not found.");
          if (m.required) return fail("Required mappings cannot be removed. Change the source field instead.");
          s.fieldMappings = s.fieldMappings.filter((x) => x.id !== id);
          return ok(undefined, "Mapping removed");
        }),

      addCustomField: (
        input: Omit<CustomField, "id" | "position" | "is_active" | keyof AuditFields>,
      ) =>
        commit((s) => {
          const key = input.key.trim();
          if (!/^[a-z][a-z0-9_]*$/.test(key)) return fail("Key must be lower_snake_case and start with a letter.");
          if (!input.label.trim()) return fail("Label is required.");
          if (s.customFields.some((f) => f.entity === input.entity && f.key === key)) {
            return fail(`${input.entity} already has a field called ${key}.`);
          }
          const optionError = checkFieldOptions(input);
          if (optionError) return fail(optionError);
          const position = Math.max(0, ...s.customFields.filter((f) => f.entity === input.entity).map((f) => f.position)) + 1;
          const f: CustomField = {
            id: newId("cf"),
            ...input,
            key,
            label: input.label.trim(),
            description: input.description?.trim() || undefined,
            default_value: input.default_value?.trim() || undefined,
            is_active: true,
            position,
            ...stamp(nowIso(), actorOf(s)),
          };
          s.customFields.push(f);
          audit(s, {
            action: "CUSTOM_FIELD.CREATED",
            entity_type: "Custom field",
            entity_id: f.id,
            entity_label: `${f.entity}.${f.key}`,
            summary: `Added ${f.label} to ${f.entity} (${f.scope === "FINANCIAL" ? "financial" : "source reference"}).`,
          });
          return ok(f, `${f.label} added to ${f.entity}`);
        }),

      /** Key and entity never change; type only while no record holds a value. */
      updateCustomField: (
        id: string,
        patch: Partial<
          Pick<
            CustomField,
            "label" | "description" | "type" | "scope" | "options" | "required" | "default_value" | "show_in_list" | "is_active"
          >
        >,
      ) =>
        commit((s) => {
          const f = s.customFields.find((x) => x.id === id);
          if (!f) return fail("Field not found.");
          if (patch.label !== undefined && !patch.label.trim()) return fail("Label is required.");
          const used = customFieldUsage(s, f);
          if (patch.type && patch.type !== f.type && used > 0) {
            return fail(`${used} record(s) already hold a ${f.label}. Its type cannot change; add a new field instead.`);
          }
          const next = { ...f, ...patch };
          const optionError = checkFieldOptions(next);
          if (optionError) return fail(optionError);
          if (next.type === "SELECT" && f.type === "SELECT" && f.options) {
            const removed = f.options.filter((o) => !next.options?.includes(o));
            const inUse = removed.find((o) =>
              recordsForEntity(s, f.entity).some((r) => r.custom_fields?.[f.key] === o),
            );
            if (inUse) return fail(`"${inUse}" is still used on some records. Change those first or keep the option.`);
          }
          const changes = (Object.keys(patch) as (keyof typeof patch)[])
            .filter((k) => JSON.stringify(patch[k]) !== JSON.stringify(f[k]))
            .map((k) => ({ field: k, from: f[k] === undefined ? null : String(f[k]), to: patch[k] === undefined ? null : String(patch[k]) }));
          Object.assign(f, {
            ...patch,
            label: next.label.trim(),
            description: next.description?.trim() || undefined,
            default_value: next.default_value?.trim() || undefined,
            options: next.type === "SELECT" ? next.options : undefined,
          });
          touch(s, f);
          if (changes.length) {
            audit(s, {
              action: "CUSTOM_FIELD.UPDATED",
              entity_type: "Custom field",
              entity_id: f.id,
              entity_label: `${f.entity}.${f.key}`,
              summary: `Updated ${f.label}.`,
              changes,
            });
          }
          return ok(f, `${f.label} saved`);
        }),

      deleteCustomField: (id: string) =>
        commit((s) => {
          const f = s.customFields.find((x) => x.id === id);
          if (!f) return fail("Field not found.");
          const used = customFieldUsage(s, f);
          if (used > 0) return fail(`${used} record(s) hold a ${f.label}. Deactivate it instead so the history is kept.`);
          const mapped = s.fieldMappings.find((m) => m.target_field === `custom.${f.key}`);
          if (mapped) return fail(`${f.label} is the target of a field mapping (${mapped.source_field}). Remove the mapping first.`);
          s.customFields = s.customFields.filter((x) => x.id !== id);
          audit(s, {
            action: "CUSTOM_FIELD.DELETED",
            entity_type: "Custom field",
            entity_id: f.id,
            entity_label: `${f.entity}.${f.key}`,
            summary: `Deleted unused field ${f.label}.`,
          });
          return ok(undefined, `${f.label} deleted`);
        }),

      moveCustomField: (id: string, direction: -1 | 1) =>
        commit((s) => {
          const f = s.customFields.find((x) => x.id === id);
          if (!f) return fail("Field not found.");
          const siblings = s.customFields.filter((x) => x.entity === f.entity).sort((a, b) => a.position - b.position);
          const i = siblings.indexOf(f);
          const other = siblings[i + direction];
          if (!other) return ok(f);
          siblings.splice(i, 1);
          siblings.splice(i + direction, 0, f);
          siblings.forEach((x, n) => (x.position = n + 1));
          return ok(f);
        }),

      /** Custom values never touch the ledger, so they can be edited on posted documents too. */
      setCustomFieldValues: (entity: CustomFieldEntity, id: string, values: Record<string, string>) =>
        commit((s) => {
          const record = recordsForEntity(s, entity).find((r) => (r as { id?: string }).id === id) as
            | ({ id: string; custom_fields?: Record<string, string>; updated_at: string; updated_by: string | null; updated_by_id: string | null } & Record<string, unknown>)
            | undefined;
          if (!record) return fail(`${entity} not found.`);
          const customError = checkCustom(s, entity, values);
          if (customError) return fail(customError);
          const before = record.custom_fields ?? {};
          const after = normaliseCustomValues(values, before);
          const labels = new Map(s.customFields.filter((f) => f.entity === entity).map((f) => [f.key, f.label]));
          const changes = [...new Set([...Object.keys(before), ...Object.keys(after)])]
            .filter((k) => (before[k] ?? "") !== (after[k] ?? ""))
            .map((k) => ({ field: labels.get(k) ?? k, from: before[k] ?? null, to: after[k] ?? null }));
          if (changes.length === 0) return ok(record, "Nothing changed");
          record.custom_fields = after;
          touch(s, record);
          const label = String(record.number ?? record.name ?? record.code ?? id);
          audit(s, {
            action: "CUSTOM_FIELDS.UPDATED",
            entity_type: entity,
            entity_id: id,
            entity_label: label,
            summary: `Updated ${changes.map((c) => c.field).join(", ")}.`,
            changes,
          });
          return ok(record, "Details saved");
        }),

      // ---- Currencies -------------------------------------------------------
      addCurrency: (input: { code: string; name: string; symbol: string }) =>
        commit((s) => {
          const code = input.code.trim().toUpperCase();
          if (!/^[A-Z]{3}$/.test(code)) return fail("Use the three-letter ISO code, e.g. USD.");
          if (s.currencies.some((c) => c.code === code)) return fail(`${code} is already set up.`);
          if (!input.name.trim()) return fail("Name is required.");
          const c: Currency = { code, name: input.name.trim(), symbol: input.symbol.trim() || code, is_active: true };
          s.currencies.push(c);
          audit(s, {
            action: "CURRENCY.ADDED",
            entity_type: "Currency",
            entity_id: code,
            entity_label: code,
            summary: `Added ${c.name} (${code}). Record a rate before using it.`,
          });
          return ok(c, `${code} added`);
        }),

      toggleCurrency: (code: string) =>
        commit((s) => {
          const c = s.currencies.find((x) => x.code === code);
          if (!c) return fail("Currency not found.");
          if (code === s.org.base_currency) return fail("The base currency is always on.");
          if (c.is_active) {
            const bank = s.bankAccounts.find((b) => b.currency === code);
            if (bank) return fail(`${bank.name} holds ${code}. A currency with a bank account cannot be switched off.`);
          }
          c.is_active = !c.is_active;
          audit(s, {
            action: c.is_active ? "CURRENCY.ACTIVATED" : "CURRENCY.DEACTIVATED",
            entity_type: "Currency",
            entity_id: code,
            entity_label: code,
            summary: c.is_active
              ? `${code} can be used on new documents.`
              : `${code} switched off for new documents. Open ${code} balances are still revalued.`,
            changes: [{ field: "is_active", from: String(!c.is_active), to: String(c.is_active) }],
          });
          return ok(c, `${code} ${c.is_active ? "switched on" : "switched off"}`);
        }),

      addExchangeRate: (input: { currency: string; date: string; rate: number }) =>
        commit((s) => {
          const c = s.currencies.find((x) => x.code === input.currency);
          if (!c || c.code === s.org.base_currency) return fail("Choose a foreign currency.");
          const rate = Math.round((Number(input.rate) || 0) * 10000) / 10000;
          if (!(rate > 0)) return fail("Enter a rate greater than zero.");
          if (!input.date) return fail("Choose the date the rate applies from.");
          if (input.date > todayIso()) return fail("Rates cannot be recorded for future dates.");
          const previous = rateOn(s.exchangeRates, c.code, input.date);
          const r: ExchangeRate = {
            id: newId("fx"),
            currency: c.code,
            date: input.date,
            rate,
            source: "MANUAL",
            ...stamp(nowIso(), actorOf(s)),
          };
          s.exchangeRates.push(r);
          const move = previous ? ((rate - previous.rate) / previous.rate) * 100 : 0;
          audit(s, {
            action: "FX_RATE.RECORDED",
            entity_type: "Exchange rate",
            entity_id: r.id,
            entity_label: `${c.code} ${input.date}`,
            summary: `1 ${c.code} = ${fmtCurrency(rate)} from ${input.date}${previous ? ` (${move >= 0 ? "+" : ""}${move.toFixed(2)}%)` : ""}.`,
            changes: previous ? [{ field: "rate", from: fmtRate(previous.rate), to: fmtRate(rate) }] : undefined,
          });
          return ok(r, `${c.code} rate recorded`);
        }),

      deleteExchangeRate: (id: string) =>
        commit((s) => {
          const r = s.exchangeRates.find((x) => x.id === id);
          if (!r) return fail("Rate not found.");
          if (r.source !== "MANUAL") return fail("Reference rates from Bank of Ghana cannot be deleted. Record a manual rate instead.");
          s.exchangeRates = s.exchangeRates.filter((x) => x.id !== id);
          audit(s, {
            action: "FX_RATE.DELETED",
            entity_type: "Exchange rate",
            entity_id: r.id,
            entity_label: `${r.currency} ${r.date}`,
            summary: `Deleted manual ${r.currency} rate ${fmtRate(r.rate)} for ${r.date}. Documents keep the rate they were posted at.`,
          });
          return ok(undefined, "Rate deleted");
        }),

      /** Simulates the daily Bank of Ghana reference-rate download. */
      fetchReferenceRates: () =>
        commit((s) => {
          const today = todayIso();
          const added: string[] = [];
          for (const c of s.currencies) {
            if (!c.is_active || c.code === s.org.base_currency) continue;
            if (s.exchangeRates.some((r) => r.currency === c.code && r.date === today && r.source === "BANK_OF_GHANA")) continue;
            const last = rateOn(s.exchangeRates, c.code, today);
            if (!last) continue;
            const drift = 1 + (Math.sin(Date.now() / 3.6e6 + c.code.charCodeAt(0)) * 0.004);
            s.exchangeRates.push({
              id: newId("fx"),
              currency: c.code,
              date: today,
              rate: Math.round(last.rate * drift * 10000) / 10000,
              source: "BANK_OF_GHANA",
              ...stamp(nowIso(), { id: "svc_integrations", name: "Trovesuite Integrations" }),
            });
            added.push(c.code);
          }
          if (added.length === 0) return ok(0, "Rates are already up to date for today");
          audit(s, {
            action: "FX_RATE.FETCHED",
            entity_type: "Exchange rate",
            entity_id: null,
            entity_label: "Bank of Ghana",
            summary: `Fetched reference rates for ${added.join(", ")} (${today}).`,
          });
          return ok(added.length, `Bank of Ghana rates fetched for ${added.join(", ")}`);
        }),

      runRevaluation: (periodId: string) =>
        commit((s) => {
          const period = s.periods.find((p) => p.id === periodId);
          if (!period) return fail("Choose a month end.");
          const asAt = period.end_date;
          if (asAt >= todayIso()) return fail(`${period.name} has not ended yet. Revalue after the month closes.`);
          if (s.fxRevaluations.some((r) => r.period_id === periodId)) return fail(`${period.name} has already been revalued.`);
          const nextDay = addDays(asAt, 1);
          const periodError = checkPeriod(s, asAt) ?? checkPeriod(s, nextDay);
          if (periodError) return fail(periodError);
          const preview = revaluationPreview(s, asAt);
          if (preview.missing.length) {
            return fail(`No ${preview.missing.join(", ")} rate on or before ${asAt}. Record one in Settings → Currencies.`);
          }
          const changed = preview.lines.filter((l) => l.difference !== 0);
          if (changed.length === 0) return fail("Nothing to revalue: no open foreign balances moved.");
          const reference = `FX-REVAL-${asAt.slice(0, 7)}`;
          const j = writeJournal(
            s,
            {
              date: asAt,
              memo: `Foreign currency revaluation – ${period.name}`,
              reference,
              branch_id: null,
              lines: revaluationJournalLines(preview.lines, s.org.fx_unrealised_account_id),
            },
            "POSTED",
            { type: "FX_REVALUATION", reference },
          );
          const reversal = reverseInto(s, j, nextDay, "automatic reversal of month-end revaluation");
          const net = round2(preview.lines.reduce((t, l) => t + l.difference, 0));
          const run: FxRevaluation = {
            id: newId("rev"),
            period_id: period.id,
            as_at: asAt,
            rates: preview.rates,
            lines: preview.lines,
            net_difference: net,
            journal_id: j.id,
            reversal_journal_id: reversal.id,
            ...stamp(nowIso(), actorOf(s)),
          };
          s.fxRevaluations.unshift(run);
          audit(s, {
            action: "FX.REVALUED",
            entity_type: "Journal",
            entity_id: j.id,
            entity_label: j.number,
            summary: `Revalued ${preview.lines.length} open foreign balance(s) at ${asAt}: net unrealised ${net >= 0 ? "gain" : "loss"} ${fmtCurrency(Math.abs(net))}. Reversed on ${nextDay} by ${reversal.number}.`,
          });
          return ok(run, `${period.name} revalued · ${j.number} posted, reversed on ${nextDay}`);
        }),

      toggleRule: (id: string) =>
        commit((s) => {
          const r = s.rules.find((x) => x.id === id);
          if (!r) return fail("Rule not found.");
          r.is_active = !r.is_active;
          touch(s, r);
          audit(s, {
            action: r.is_active ? "RULE.ACTIVATED" : "RULE.DEACTIVATED",
            entity_type: "Accounting rule",
            entity_id: r.id,
            entity_label: r.name,
            summary: `${r.is_active ? "Activated" : "Deactivated"} posting rule for ${r.event}.`,
            changes: [{ field: "is_active", from: String(!r.is_active), to: String(r.is_active) }],
          });
          return ok(r, `${r.name} ${r.is_active ? "activated" : "deactivated"}`);
        }),

      createImport: (input: ImportInput) =>
        commit((s) => {
          if (input.records.length === 0) return fail("The file has no rows to import.");
          const user = actorOf(s);
          const batch: ImportBatch = {
            id: newId("imp"),
            number: nextNumber(
              s.importBatches.map((b) => b.number),
              "IMP-",
            ),
            source_id: input.source_id,
            entity: input.entity,
            file_name: input.file_name,
            status: "NEEDS_REVIEW",
            records: input.records.map((r) => ({ ...r, posted: false })),
            journal_id: null,
            ...stamp(nowIso(), user),
          };
          s.importBatches.unshift(batch);
          audit(s, {
            action: "IMPORT.UPLOADED",
            entity_type: "Import batch",
            entity_id: batch.id,
            entity_label: batch.number,
            summary: `${batch.entity}: ${batch.records.length} rows from ${batch.file_name ?? "source"}.`,
          });
          if (!input.post) return ok(batch, `${batch.number} saved for review`);
          const res = postBatchInto(s, batch);
          if (!res.ok) return res;
          return ok(batch, res.message);
        }),

      postImportBatch: (id: string) =>
        commit((s) => {
          const batch = s.importBatches.find((b) => b.id === id);
          if (!batch) return fail("Batch not found.");
          if (batch.status === "POSTED") return fail("Batch is already posted.");
          const res = postBatchInto(s, batch);
          if (!res.ok) return res;
          return ok(batch, res.message);
        }),

      reprocessRecord: (batchId: string, row: number) =>
        commit((s) => {
          const batch = s.importBatches.find((b) => b.id === batchId);
          const record = batch?.records.find((r) => r.row === row);
          if (!batch || !record) return fail("Record not found.");
          if (record.status !== "ERROR") return fail("Only failed rows need reprocessing.");
          record.status = "VALID";
          record.message = `Corrected and revalidated by ${actorOf(s).name}.`;
          if (batch.status === "POSTED") batch.status = "PARTIALLY_POSTED";
          if (batch.status === "FAILED") batch.status = "NEEDS_REVIEW";
          audit(s, {
            action: "IMPORT.ROW_REPROCESSED",
            entity_type: "Import batch",
            entity_id: batch.id,
            entity_label: `${batch.number} row ${row}`,
            summary: `Row ${row} (${record.external_reference}) corrected and ready to post.`,
          });
          return ok(record, `Row ${row} is ready to post`);
        }),

      // ---- Settings ---------------------------------------------------------
      // ---- Opening balances ---------------------------------------------------
      saveOpeningBalances: (input: OpeningBalancesInput) =>
        commit((s) => {
          ensureOpeningEquity(s);
          const date = input.date;
          const periodError = checkPeriod(s, date);
          if (periodError) return fail(periodError);
          const before = openingBalancesView(s);
          const hasExisting = Boolean(before.journal_id) || before.receivables.length > 0 || before.payables.length > 0;
          if (hasExisting && before.locked_reason) return fail(before.locked_reason);
          if (before.first_transaction_date && date > before.first_transaction_date) {
            return fail(`Date the opening balances on or before your first transaction (${fmtDate(before.first_transaction_date)}).`);
          }

          const lines = (input.lines ?? [])
            .map((l) => ({ account_id: l.account_id, debit: round2(Number(l.debit) || 0), credit: round2(Number(l.credit) || 0) }))
            .filter((l) => l.debit > 0 || l.credit > 0);
          const seen = new Set<string>();
          for (const l of lines) {
            const account = s.accounts.find((a) => a.id === l.account_id);
            if (!account) return fail("An opening balance refers to an account that does not exist.");
            const name = `${account.code} ${account.name}`;
            if (account.is_group) return fail(`${name} is a group account and cannot hold a balance.`);
            if (!account.is_active) return fail(`${name} is inactive.`);
            if (account.id === ACC.openingEquity) return fail(`${name} is calculated for you; leave it out.`);
            if (account.is_control) {
              return fail(`${name} is built from the open invoices and bills you list below, not entered directly.`);
            }
            if (l.debit < 0 || l.credit < 0) return fail(`${name}: amounts cannot be negative.`);
            if (l.debit > 0 && l.credit > 0) return fail(`${name}: enter a debit or a credit, not both.`);
            const bank = s.bankAccounts.find((b) => b.gl_account_id === account.id);
            if (bank && isForeign(bank.currency)) {
              return fail(`${name} is held in ${bank.currency}. Record its opening balance as a manual journal with the ${bank.currency} amount.`);
            }
            if (seen.has(account.id)) return fail(`${name} appears more than once.`);
            seen.add(account.id);
          }

          const removed = new Set(input.removed_item_ids ?? []);
          const existing = [...before.receivables, ...before.payables];
          for (const id of removed) {
            if (!existing.some((d) => d.id === id)) return fail("Only open invoices and bills brought forward can be removed here.");
          }
          for (const doc of existing) {
            if (removed.has(doc.id) && doc.amount_paid > 0) {
              return fail(`${doc.number} has payments recorded against it. Reverse those before removing it.`);
            }
          }

          const taken = new Set<string>();
          for (const [i, item] of (input.receivables ?? []).entries()) {
            const err = validateOpeningItem(s, item, "receivable", i + 1, date, taken);
            if (err) return fail(err);
          }
          for (const [i, item] of (input.payables ?? []).entries()) {
            const err = validateOpeningItem(s, item, "payable", i + 1, date, taken);
            if (err) return fail(err);
          }
          const remaining = existing.filter((d) => !removed.has(d.id));
          if (lines.length === 0 && !input.receivables?.length && !input.payables?.length && remaining.length === 0 && !hasExisting) {
            return fail("Enter at least one opening balance.");
          }

          const replaceJournal = (old: JournalEntry | undefined) => {
            if (!old || old.status !== "POSTED") return;
            const reversal = reverseInto(s, old, old.date, "replaced by updated opening balances");
            reversal.source = { ...OPENING_SOURCE };
          };

          // Account balances: reverse the previous journal and post the new set.
          replaceJournal(s.journals.find((j) => j.id === s.org.opening_balance_journal_id));
          s.org.opening_balance_journal_id = null;
          let journalNumber: string | null = null;
          if (lines.length > 0) {
            const t = lineTotals(lines);
            const diff = round2(t.debit - t.credit);
            const j = writeJournal(
              s,
              {
                date,
                memo: `Opening balances at ${fmtDate(date)}`,
                branch_id: null,
                lines: [
                  ...lines,
                  ...(diff === 0
                    ? []
                    : [{ account_id: ACC.openingEquity, debit: diff < 0 ? -diff : 0, credit: diff > 0 ? diff : 0, description: "Balancing entry" }]),
                ],
              },
              "POSTED",
              { ...OPENING_SOURCE },
            );
            s.org.opening_balance_journal_id = j.id;
            journalNumber = j.number;
          }

          const user = actorOf(s);
          const partyName = (doc: SalesInvoice | PurchaseBill) =>
            "customer_id" in doc
              ? s.customers.find((c) => c.id === doc.customer_id)?.name ?? ""
              : s.suppliers.find((c) => c.id === doc.supplier_id)?.name ?? "";
          const postItem = (doc: SalesInvoice | PurchaseBill) => {
            const amount = documentTotals(doc.lines, s.taxCodes).total;
            const isInvoice = "customer_id" in doc;
            const j = writeJournal(
              s,
              {
                date,
                memo: `Opening ${isInvoice ? "receivable" : "payable"} ${isInvoice ? doc.number : (doc as PurchaseBill).supplier_reference} – ${partyName(doc)}`,
                branch_id: null,
                lines: isInvoice
                  ? [
                      { account_id: ACC.ar, debit: amount, credit: 0, description: partyName(doc) },
                      { account_id: ACC.openingEquity, debit: 0, credit: amount },
                    ]
                  : [
                      { account_id: ACC.openingEquity, debit: amount, credit: 0 },
                      { account_id: ACC.ap, debit: 0, credit: amount, description: partyName(doc) },
                    ],
              },
              "POSTED",
              { type: "OPENING_BALANCE", reference: doc.number, document_id: doc.id },
            );
            doc.journal_id = j.id;
          };

          for (const doc of existing) {
            if (removed.has(doc.id)) {
              replaceJournal(s.journals.find((j) => j.id === doc.journal_id));
              const row = "customer_id" in doc ? s.invoices.find((i) => i.id === doc.id)! : s.bills.find((b) => b.id === doc.id)!;
              row.state = "VOID";
              touch(s, row);
            } else if (date !== before.conversion_date) {
              const row = "customer_id" in doc ? s.invoices.find((i) => i.id === doc.id)! : s.bills.find((b) => b.id === doc.id)!;
              replaceJournal(s.journals.find((j) => j.id === row.journal_id));
              postItem(row);
              touch(s, row);
            }
          }

          const documentFor = (item: OpeningItemInput, prefix: string): Pick<SalesInvoice, "lines" | "issue_date" | "due_date"> => ({
            issue_date: item.issue_date,
            due_date: item.due_date,
            lines: [
              {
                id: newId(prefix),
                description: `Balance brought forward – ${item.reference.trim()}`,
                quantity: 1,
                unit_price: round2(Number(item.amount)),
                tax_code_id: TAX.exempt,
                account_id: ACC.openingEquity,
              },
            ],
          });
          const common = {
            state: "APPROVED" as const,
            currency: s.org.base_currency,
            exchange_rate: 1,
            amount_paid: 0,
            amount_paid_base: 0,
            journal_id: null,
            branch_id: null,
            notes: "Brought forward from the previous system.",
          };
          for (const item of input.receivables ?? []) {
            const invoice: SalesInvoice = {
              id: newId("inv"),
              number: item.reference.trim(),
              customer_id: item.party_id,
              ...documentFor(item, "il"),
              ...common,
              source: { type: "OPENING_BALANCE", reference: "OPENING" },
              ...stamp(nowIso(), user),
            };
            s.invoices.push(invoice);
            postItem(invoice);
          }
          for (const item of input.payables ?? []) {
            const bill: PurchaseBill = {
              id: newId("bill"),
              number: nextNumber(
                s.bills.map((b) => b.number),
                s.org.bill_prefix,
              ),
              supplier_reference: item.reference.trim(),
              supplier_id: item.party_id,
              ...documentFor(item, "bl"),
              ...common,
              source: { type: "OPENING_BALANCE", reference: "OPENING" },
              ...stamp(nowIso(), user),
            };
            s.bills.push(bill);
            postItem(bill);
          }

          const previousDate = before.conversion_date;
          s.org.conversion_date = date;
          const after = openingBalancesView(s);
          const added = (input.receivables?.length ?? 0) + (input.payables?.length ?? 0);
          audit(s, {
            action: "OPENING_BALANCES.UPDATED",
            entity_type: "Opening balances",
            entity_id: "opening_balances",
            entity_label: journalNumber ?? "Opening balances",
            summary: [
              `${lines.length} account balance${lines.length === 1 ? "" : "s"} at ${fmtDate(date)}`,
              added ? `${added} open item${added === 1 ? "" : "s"} added` : "",
              removed.size ? `${removed.size} removed` : "",
              `Opening Balance Equity ${fmtCurrency(after.opening_equity_balance)}`,
            ]
              .filter(Boolean)
              .join(" · "),
            changes: previousDate !== date ? [{ field: "conversion_date", from: previousDate, to: date }] : undefined,
          });
          return ok(
            after,
            after.opening_equity_balance === 0
              ? "Opening balances saved and in balance"
              : `Opening balances saved · ${fmtCurrency(Math.abs(after.opening_equity_balance))} left in Opening Balance Equity`,
          );
        }),

      setupOrganisation: (input: OrganisationSetupInput) =>
        commit((s) => {
          if (s.org.setup_completed) return fail("This organisation is already set up. Change its details in Settings.");
          if (!input.name?.trim()) return fail("Trading name is required.");
          if (!input.legal_name?.trim()) return fail("Legal name is required.");
          if (!/^[A-Z]{2}$/.test(input.country ?? "")) return fail("Choose the country the business is registered in.");
          if (!/^(0[1-9]|1[0-2])-01$/.test(input.fiscal_year_start ?? "")) {
            return fail("The financial year must start on the first day of a month.");
          }
          const currencyError = adoptBaseCurrency(s, input.base_currency);
          if (currencyError) return fail(currencyError);
          const year = todayIso().slice(0, 4);
          s.org = {
            ...s.org,
            name: input.name.trim(),
            legal_name: input.legal_name.trim(),
            tin: input.tin?.trim() ?? "",
            country: input.country,
            base_currency: input.base_currency,
            fiscal_year_start: input.fiscal_year_start,
            address: input.address?.trim() ?? "",
            email: input.email?.trim() ?? "",
            phone: input.phone?.trim() ?? "",
            invoice_prefix: `INV-${year}-`,
            bill_prefix: `BILL-${year}-`,
            journal_prefix: `JE-${year}-`,
            setup_completed: true,
          };
          s.periods = fiscalYearPeriods(input.fiscal_year_start, todayIso());
          audit(s, {
            action: "ORGANISATION.SET_UP",
            entity_type: "Organisation",
            entity_id: null,
            entity_label: s.org.name,
            summary: `Set up ${s.org.name} with ${input.base_currency} as the base currency.`,
          });
          return ok(s.org, `${s.org.name} is ready`);
        }),

      updateOrg: (input: Partial<OrgSettings>) =>
        commit((s) => {
          const patch = { ...input };
          delete patch.setup_completed;
          delete patch.conversion_date;
          delete patch.opening_balance_journal_id;
          if (patch.name !== undefined && !patch.name.trim()) return fail("Trading name is required.");
          if (patch.base_currency !== undefined && patch.base_currency !== s.org.base_currency) {
            if (s.journals.some((j) => j.status === "POSTED" || j.status === "REVERSED")) {
              return fail("The base currency cannot change once entries have been posted.");
            }
            const currencyError = adoptBaseCurrency(s, patch.base_currency);
            if (currencyError) return fail(currencyError);
          }
          if (patch.approval_threshold !== undefined && patch.approval_threshold < 0) {
            return fail("Approval threshold cannot be negative.");
          }
          for (const key of ["fx_realised_account_id", "fx_unrealised_account_id"] as const) {
            if (patch[key] === undefined) continue;
            const a = s.accounts.find((x) => x.id === patch[key]);
            if (!a || a.is_group || a.is_control || !a.is_active) return fail("Choose an active, postable account for exchange differences.");
          }
          if (patch.fx_rate_tolerance_pct !== undefined && !(patch.fx_rate_tolerance_pct >= 0)) {
            return fail("Rate tolerance cannot be negative.");
          }
          const changes = (Object.keys(patch) as (keyof OrgSettings)[])
            .filter((k) => String(patch[k]) !== String(s.org[k]))
            .map((k) => ({ field: k, from: String(s.org[k]), to: String(patch[k]) }));
          if (changes.length === 0) return ok(s.org, "Nothing changed");
          s.org = { ...s.org, ...patch };
          audit(s, {
            action: "SETTINGS.UPDATED",
            entity_type: "Organisation",
            entity_id: null,
            entity_label: "Settings",
            summary: `Updated ${changes.map((c) => c.field.replace(/_/g, " ")).join(", ")}.`,
            changes,
          });
          return ok(s.org, "Settings saved");
        }),

      saveDimension: (input: { kind: Dimension["kind"]; code: string; name: string; description?: string }) =>
        commit((s) => {
          if (!input.code.trim() || !input.name.trim()) return fail("Code and name are required.");
          if (s.dimensions.some((d) => d.kind === input.kind && d.code.toLowerCase() === input.code.trim().toLowerCase())) {
            return fail(`Code ${input.code.trim()} is already used.`);
          }
          const dim: Dimension = {
            id: newId("dim"),
            kind: input.kind,
            code: input.code.trim().toUpperCase(),
            name: input.name.trim(),
            description: input.description?.trim() || undefined,
            is_active: true,
            ...stamp(nowIso(), actorOf(s)),
          };
          s.dimensions.push(dim);
          audit(s, {
            action: "DIMENSION.CREATED",
            entity_type: "Dimension",
            entity_id: dim.id,
            entity_label: `${dim.code} ${dim.name}`,
            summary: `Added ${dim.kind.replace(/_/g, " ").toLowerCase()} ${dim.name}.`,
          });
          return ok(dim, `${dim.name} added`);
        }),

      toggleDimension: (id: string) =>
        commit((s) => {
          const dim = s.dimensions.find((d) => d.id === id);
          if (!dim) return fail("Not found.");
          dim.is_active = !dim.is_active;
          touch(s, dim);
          return ok(dim, `${dim.name} ${dim.is_active ? "activated" : "deactivated"}`);
        }),
  };
};

export type LedgerEngine = ReturnType<typeof createLedgerEngine>;

const checkFieldOptions = (f: Pick<CustomField, "type" | "options" | "default_value" | "label">): string | null => {
  if (f.type === "SELECT") {
    const opts = (f.options ?? []).map((o) => o.trim()).filter(Boolean);
    if (opts.length < 2) return "A dropdown needs at least two options.";
    if (new Set(opts).size !== opts.length) return "Dropdown options must be unique.";
    if (f.default_value && !opts.includes(f.default_value)) return "The default must be one of the options.";
  }
  if (f.type === "BOOLEAN" && f.default_value && !["true", "false"].includes(f.default_value)) {
    return "The default for a yes/no field is yes or no.";
  }
  if (f.type === "NUMBER" && f.default_value && !Number.isFinite(Number(f.default_value))) {
    return "The default must be a number.";
  }
  return null;
};

/** Rates as at `asAt` plus every open foreign balance revalued at them. */
export const revaluationPreview = (s: LedgerState, asAt: string) => {
  const rates: Record<string, number> = {};
  for (const c of s.currencies) {
    if (c.code === s.org.base_currency) continue;
    const r = rateOn(s.exchangeRates, c.code, asAt);
    if (r) rates[c.code] = r.rate;
  }
  const exposed = new Set<string>([
    ...s.invoices.filter((d) => isForeign(d.currency) && d.state === "APPROVED" && d.issue_date <= asAt).map((d) => d.currency),
    ...s.bills.filter((d) => isForeign(d.currency) && d.state === "APPROVED" && d.issue_date <= asAt).map((d) => d.currency),
    ...s.bankAccounts.filter((b) => isForeign(b.currency)).map((b) => b.currency),
  ]);
  const missing = [...exposed].filter((c) => !rates[c]);
  const lines = revaluationLines(s, asAt, rates, { ar: ACC.ar, ap: ACC.ap });
  return { rates, lines, missing };
};

/** Turns the postable rows of an import batch into one balanced journal. */
const postBatchInto = (s: LedgerState, batch: ImportBatch): Result<ImportBatch> => {
  const postable = batch.records.filter((r) => r.status !== "ERROR" && !r.posted);
  if (postable.length === 0) return fail("There are no valid rows left to post. Fix or reprocess the failed rows first.");
  const total = round2(postable.reduce((t, r) => t + Math.abs(r.amount), 0));
  const financial = ["Sales", "Invoices", "Bills"].includes(batch.entity) && total > 0;
  if (financial) {
    const date = todayIso();
    const periodError = checkPeriod(s, date);
    if (periodError) return fail(periodError);
    const net = round2(total / 1.2);
    const tax = round2(total - net);
    const lines: JournalDraftLine[] =
      batch.entity === "Bills"
        ? [
            { account_id: ACC.transport, debit: net, credit: 0, description: `${postable.length} imported bills` },
            { account_id: ACC.vatIn, debit: tax, credit: 0 },
            { account_id: ACC.ap, debit: 0, credit: total },
          ]
        : [
            { account_id: batch.entity === "Sales" ? ACC.cash : ACC.ar, debit: total, credit: 0 },
            { account_id: ACC.sales, debit: 0, credit: net, description: `${postable.length} imported rows` },
            { account_id: ACC.vatOut, debit: 0, credit: tax },
          ];
    const j = writeJournal(
      s,
      {
        date,
        memo: `Imported ${batch.entity.toLowerCase()} – ${batch.number}${batch.file_name ? ` (${batch.file_name})` : ""}`,
        branch_id: null,
        lines,
      },
      "POSTED",
      { type: "IMPORT", reference: batch.number },
    );
    batch.journal_id = j.id;
  }
  postable.forEach((r) => (r.posted = true));
  const errors = batch.records.filter((r) => r.status === "ERROR").length;
  batch.status = errors ? "PARTIALLY_POSTED" : "POSTED";
  touch(s, batch);
  audit(s, {
    action: "IMPORT.POSTED",
    entity_type: "Import batch",
    entity_id: batch.id,
    entity_label: batch.number,
    summary: `Posted ${postable.length} row(s)${errors ? `; ${errors} held with errors` : ""}.`,
  });
  return ok(
    batch,
    `${batch.number}: ${postable.length} row(s) posted${errors ? `, ${errors} held for correction` : ""}`,
  );
};
