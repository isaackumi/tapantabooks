"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import type {
  Account,
  AccountType,
  AuditEvent,
  AuditFields,
  Customer,
  CustomField,
  Dimension,
  DocumentLine,
  FieldMapping,
  ImportBatch,
  ImportRecord,
  JournalEntry,
  JournalStatus,
  OrgSettings,
  Payment,
  PaymentMethod,
  PeriodStatus,
  PurchaseBill,
  SalesInvoice,
  SourceRef,
  Supplier,
} from "@/models/accounting";
import { buildSeed, CURRENT_USER, USERS, ACC, stamp, type SeedData } from "@/mock/seed";
import { isBalanced, lineTotals } from "@/lib/ledger";
import { documentTotals } from "@/lib/documents";
import { fmtCurrency, round2 } from "@/utils/format";
import { addDays, nowIso, todayIso } from "@/utils/dates";

export type LedgerState = SeedData & { currentUserId: string };

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
}

export interface JournalDraftInput {
  date: string;
  memo: string;
  reference?: string;
  branch_id: string | null;
  lines: JournalDraftLine[];
}

export type JournalIntent = "DRAFT" | "POST";

export interface DocumentInput {
  party_id: string;
  issue_date: string;
  due_date: string;
  supplier_reference?: string;
  branch_id: string | null;
  notes?: string;
  lines: Omit<DocumentLine, "id">[];
}

export interface PaymentInput {
  document_id: string;
  date: string;
  amount: number;
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

const actorOf = (s: LedgerState) => ALL_USERS.find((u) => u.id === s.currentUserId) ?? CURRENT_USER;

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
      })),
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

const invoiceJournalLines = (
  s: LedgerState,
  lines: DocumentLine[],
  partyAccount: string,
  partyName: string,
  kind: "SALE" | "PURCHASE",
): JournalDraftLine[] => {
  const totals = documentTotals(lines, s.taxCodes);
  const byAccount = new Map<string, number>();
  for (const l of lines) {
    byAccount.set(l.account_id, round2((byAccount.get(l.account_id) ?? 0) + l.quantity * l.unit_price));
  }
  const taxLines = totals.taxByCode.map((t) => {
    const code = s.taxCodes.find((c) => c.id === t.tax_code_id)!;
    return {
      account_id: (kind === "SALE" ? code.output_account_id : code.input_account_id) ?? ACC.vatOut,
      amount: t.amount,
      label: code.code,
    };
  });
  if (kind === "SALE") {
    return [
      { account_id: partyAccount, debit: totals.total, credit: 0, description: partyName },
      ...[...byAccount.entries()].map(([account_id, amount]) => ({ account_id, debit: 0, credit: amount })),
      ...taxLines.map((t) => ({ account_id: t.account_id, debit: 0, credit: t.amount, description: t.label })),
    ];
  }
  return [
    ...[...byAccount.entries()].map(([account_id, amount]) => ({ account_id, debit: amount, credit: 0 })),
    ...taxLines.map((t) => ({ account_id: t.account_id, debit: t.amount, credit: 0, description: t.label })),
    { account_id: partyAccount, debit: 0, credit: totals.total, description: partyName },
  ];
};

const validateDocument = (s: LedgerState, input: DocumentInput, partyLabel: string): string | null => {
  if (!input.party_id) return `Choose a ${partyLabel}.`;
  if (!input.issue_date) return "Choose an issue date.";
  if (!input.due_date) return "Choose a due date.";
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
  return null;
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
// Provider
// ---------------------------------------------------------------------------

const createInitialState = (): LedgerState => ({ ...buildSeed(), currentUserId: CURRENT_USER.id });

const useLedgerActions = (
  stateRef: RefObject<LedgerState>,
  setState: (s: LedgerState) => void,
) => {
  const commit = useCallback(
    <T,>(fn: (draft: LedgerState) => Result<T>): Result<T> => {
      const draft = structuredClone(stateRef.current) as LedgerState;
      const res = fn(draft);
      if (res.ok) {
        stateRef.current = draft;
        setState(draft);
      }
      return res;
    },
    [stateRef, setState],
  );

  return useMemo(
    () => ({
      resetDemo: () => {
        const fresh = createInitialState();
        stateRef.current = fresh;
        setState(fresh);
      },

      switchUser: (userId: string) =>
        commit((s) => {
          s.currentUserId = userId;
          return ok(undefined);
        }),

      // ---- Chart of accounts ------------------------------------------------
      createAccount: (input: {
        code: string;
        name: string;
        parent_id: string;
        subtype: string;
        description?: string;
        is_bank?: boolean;
      }) =>
        commit((s) => {
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

      updateAccount: (id: string, patch: { name?: string; description?: string; is_active?: boolean }) =>
        commit((s) => {
          const account = s.accounts.find((a) => a.id === id);
          if (!account) return fail("Account not found.");
          if (patch.name !== undefined && !patch.name.trim()) return fail("Name cannot be empty.");
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
          if ((input.credit_limit ?? 0) < 0) return fail("Credit limit cannot be negative.");
          const user = actorOf(s);
          if (id) {
            const existing = list.find((p) => p.id === id);
            if (!existing) return fail(`${kind} not found.`);
            Object.assign(existing, { ...input, name });
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
            custom_fields: input.custom_fields ?? {},
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
            amount_paid: 0,
            journal_id: null,
            branch_id: input.branch_id,
            notes: input.notes,
            source: { type: "MANUAL" },
            ...stamp(nowIso(), user),
          };
          if (approve) {
            const j = writeJournal(
              s,
              {
                date: invoice.issue_date,
                memo: `Sales invoice ${invoice.number} – ${customer.name}`,
                branch_id: invoice.branch_id,
                lines: invoiceJournalLines(s, lines, ACC.ar, customer.name, "SALE"),
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
            summary: `${invoice.number} for ${customer.name} · ${fmtCurrency(documentTotals(lines, s.taxCodes).total)}`,
          });
          return ok(invoice, approve ? `${invoice.number} approved and posted` : `${invoice.number} saved as draft`);
        }),

      approveInvoice: (id: string) =>
        commit((s) => {
          const invoice = s.invoices.find((i) => i.id === id);
          if (!invoice || invoice.state !== "DRAFT") return fail("Only draft invoices can be approved.");
          const periodError = checkPeriod(s, invoice.issue_date);
          if (periodError) return fail(periodError);
          const customer = s.customers.find((c) => c.id === invoice.customer_id)!;
          const j = writeJournal(
            s,
            {
              date: invoice.issue_date,
              memo: `Sales invoice ${invoice.number} – ${customer.name}`,
              branch_id: invoice.branch_id,
              lines: invoiceJournalLines(s, invoice.lines, ACC.ar, customer.name, "SALE"),
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
            return fail(`Amount is more than the ${fmtCurrency(outstanding)} outstanding.`);
          }
          if (input.date < doc.issue_date) return fail("Payment date cannot be before the document date.");
          const bank = s.bankAccounts.find((b) => b.id === input.bank_account_id);
          if (!bank) return fail("Choose the bank or cash account.");
          const periodError = checkPeriod(s, input.date);
          if (periodError) return fail(periodError);

          const partyId = isReceipt ? (doc as SalesInvoice).customer_id : (doc as PurchaseBill).supplier_id;
          const party = (isReceipt ? s.customers : s.suppliers).find((p) => p.id === partyId)!;
          const list = isReceipt ? s.receipts : s.supplierPayments;
          const number = nextNumber(
            list.map((p) => p.number),
            isReceipt ? "RCT-2026-" : "PAY-2026-",
          );
          const j = writeJournal(
            s,
            {
              date: input.date,
              memo: isReceipt
                ? `Receipt ${number} from ${party.name} for ${doc.number}`
                : `Payment ${number} to ${party.name} for ${doc.number}`,
              reference: input.reference,
              branch_id: doc.branch_id,
              lines: isReceipt
                ? [
                    { account_id: bank.gl_account_id, debit: amount, credit: 0 },
                    { account_id: ACC.ar, debit: 0, credit: amount, description: party.name },
                  ]
                : [
                    { account_id: ACC.ap, debit: amount, credit: 0, description: party.name },
                    { account_id: bank.gl_account_id, debit: 0, credit: amount },
                  ],
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
            method: input.method,
            bank_account_id: bank.id,
            reference: input.reference?.trim() || undefined,
            journal_id: j.id,
            ...stamp(nowIso(), user),
          };
          list.push(payment);
          doc.amount_paid = round2(doc.amount_paid + amount);
          touch(s, doc);
          audit(s, {
            action: isReceipt ? "RECEIPT.RECORDED" : "PAYMENT.RECORDED",
            entity_type: isReceipt ? "Receipt" : "Supplier payment",
            entity_id: payment.id,
            entity_label: number,
            summary: `${fmtCurrency(amount)} ${isReceipt ? "from" : "to"} ${party.name} against ${doc.number}.`,
          });
          return ok(payment, `${number} recorded · ${fmtCurrency(amount)}`);
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
            amount_paid: 0,
            journal_id: null,
            branch_id: input.branch_id,
            notes: input.notes,
            source: { type: "MANUAL" },
            ...stamp(nowIso(), user),
          };
          if (approve) {
            const j = writeJournal(
              s,
              {
                date: bill.issue_date,
                memo: `Supplier bill ${bill.number} – ${supplier.name}`,
                branch_id: bill.branch_id,
                lines: invoiceJournalLines(s, lines, ACC.ap, supplier.name, "PURCHASE"),
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
            summary: `${bill.number} from ${supplier.name} · ${fmtCurrency(documentTotals(lines, s.taxCodes).total)}`,
          });
          return ok(bill, approve ? `${bill.number} approved and posted` : `${bill.number} saved as draft`);
        }),

      approveBill: (id: string) =>
        commit((s) => {
          const bill = s.bills.find((b) => b.id === id);
          if (!bill || bill.state !== "DRAFT") return fail("Only draft bills can be approved.");
          const periodError = checkPeriod(s, bill.issue_date);
          if (periodError) return fail(periodError);
          const supplier = s.suppliers.find((c) => c.id === bill.supplier_id)!;
          const j = writeJournal(
            s,
            {
              date: bill.issue_date,
              memo: `Supplier bill ${bill.number} – ${supplier.name}`,
              branch_id: bill.branch_id,
              lines: invoiceJournalLines(s, bill.lines, ACC.ap, supplier.name, "PURCHASE"),
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
      transferFunds: (input: { from: string; to: string; amount: number; date: string; memo: string }) =>
        commit((s) => {
          if (input.from === input.to) return fail("Choose two different accounts.");
          const from = s.bankAccounts.find((b) => b.id === input.from);
          const to = s.bankAccounts.find((b) => b.id === input.to);
          if (!from || !to) return fail("Choose both accounts.");
          const amount = round2(Number(input.amount) || 0);
          if (amount <= 0) return fail("Enter an amount greater than zero.");
          const periodError = checkPeriod(s, input.date);
          if (periodError) return fail(periodError);
          const j = writeJournal(
            s,
            {
              date: input.date,
              memo: input.memo.trim() || `Transfer from ${from.name} to ${to.name}`,
              branch_id: null,
              lines: [
                { account_id: to.gl_account_id, debit: amount, credit: 0 },
                { account_id: from.gl_account_id, debit: 0, credit: amount },
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
            summary: `${fmtCurrency(amount)} from ${from.name} to ${to.name}.`,
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

      addCustomField: (input: Omit<CustomField, "id" | keyof AuditFields>) =>
        commit((s) => {
          const key = input.key.trim();
          if (!/^[a-z][a-z0-9_]*$/.test(key)) return fail("Key must be lower_snake_case and start with a letter.");
          if (!input.label.trim()) return fail("Label is required.");
          if (s.customFields.some((f) => f.entity === input.entity && f.key === key)) {
            return fail(`${input.entity} already has a field called ${key}.`);
          }
          if (input.type === "SELECT" && (!input.options || input.options.length < 2)) {
            return fail("A select field needs at least two options.");
          }
          const f: CustomField = { id: newId("cf"), ...input, key, ...stamp(nowIso(), actorOf(s)) };
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
      updateOrg: (patch: Partial<OrgSettings>) =>
        commit((s) => {
          if (patch.name !== undefined && !patch.name.trim()) return fail("Trading name is required.");
          if (patch.approval_threshold !== undefined && patch.approval_threshold < 0) {
            return fail("Approval threshold cannot be negative.");
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
    }),
    [commit, stateRef, setState],
  );
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

type Actions = ReturnType<typeof useLedgerActions>;

interface LedgerContextValue {
  state: LedgerState;
  actions: Actions;
}

const LedgerContext = createContext<LedgerContextValue | undefined>(undefined);

export const LedgerProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<LedgerState>(createInitialState);
  const stateRef = useRef(state);
  const actions = useLedgerActions(stateRef, setState);
  const value = useMemo(() => ({ state, actions }), [state, actions]);
  return <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>;
};

export const useLedger = () => {
  const ctx = useContext(LedgerContext);
  if (!ctx) throw new Error("useLedger must be used within a LedgerProvider");
  return ctx;
};

export const useCurrentUser = () => {
  const { state } = useLedger();
  return ALL_USERS.find((u) => u.id === state.currentUserId) ?? CURRENT_USER;
};

export const defaultDueDate = (issue: string, terms: number) => addDays(issue, terms);
