"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { FiPlus, FiTrash2 } from "react-icons/fi";
import { BTN_PRIMARY, BTN_SECONDARY, Modal } from "@/components/modal";
import { Field, FormError, compactInputClass, inputClass } from "@/components/ui";
import AccountSelect from "@/components/accounting/accountSelect";
import { defaultDueDate, useLedger } from "@/store/ledgerStore";
import { dimensionsOf } from "@/store/selectors";
import { documentTotals, lineAmount } from "@/lib/documents";
import type { AccountType, DocumentLine, OrgSettings } from "@/models/accounting";
import { todayIso } from "@/utils/dates";
import { BASE_CURRENCY, fmtCurrency, fmtMoney } from "@/utils/format";
import { FxRateField, useFxRate } from "@/components/fxRateField";
import { CustomFieldInputs } from "@/components/customFields";
import { defaultCustomValues } from "@/lib/customFields";
import { isForeign, toBase } from "@/lib/fx";

export type DocumentKind = "invoice" | "bill";

interface LineState {
  key: number;
  description: string;
  quantity: string;
  unit_price: string;
  tax_code_id: string;
  account_id: string;
}

let key = 0;
const blank = (kind: DocumentKind, org: OrgSettings): LineState => ({
  key: key++,
  description: "",
  quantity: "1",
  unit_price: "",
  tax_code_id: (kind === "invoice" ? org.default_sales_tax_code_id : org.default_purchase_tax_code_id) ?? "",
  account_id: (kind === "invoice" ? org.default_sales_account_id : org.default_purchase_account_id) ?? "",
});

const REVENUE: AccountType[] = ["REVENUE"];
const SPEND: AccountType[] = ["EXPENSE", "ASSET"];
const nonBank = (a: { is_bank: boolean }) => !a.is_bank;

interface DocumentFormModalProps {
  kind: DocumentKind;
  open: boolean;
  onClose: () => void;
  onSaved?: (id: string) => void;
  defaultPartyId?: string;
}

const DocumentFormModal = ({ kind, open, onClose, onSaved, defaultPartyId }: DocumentFormModalProps) => {
  const { state, actions } = useLedger();
  const isInvoice = kind === "invoice";
  const parties = (isInvoice ? state.customers : state.suppliers).filter((p) => p.status === "ACTIVE");
  const branches = dimensionsOf(state, "BRANCH");
  const taxCodes = state.taxCodes.filter((t) => t.is_active && t.kind !== "WITHHOLDING");

  const [partyId, setPartyId] = useState("");
  const [issueDate, setIssueDate] = useState(todayIso());
  const [dueDate, setDueDate] = useState(todayIso());
  const [supplierRef, setSupplierRef] = useState("");
  const [branchId, setBranchId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineState[]>([blank(kind, state.org)]);
  const [currency, setCurrency] = useState(BASE_CURRENCY);
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fx = useFxRate(currency, issueDate, open);
  const entity = isInvoice ? "Invoice" : "Bill";
  const currencies = state.currencies.filter((c) => c.is_active);

  useEffect(() => {
    if (!open) return;
    const party = parties.find((p) => p.id === defaultPartyId);
    setPartyId(party?.id ?? "");
    setIssueDate(todayIso());
    setDueDate(defaultDueDate(todayIso(), party?.payment_terms_days ?? 30));
    setSupplierRef("");
    setBranchId(branches[0]?.id ?? "");
    setNotes("");
    setLines([blank(kind, state.org)]);
    setCurrency(party?.currency ?? BASE_CURRENCY);
    setCustom(defaultCustomValues(state.customFields, isInvoice ? "Invoice" : "Bill"));
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const chooseParty = (id: string) => {
    setPartyId(id);
    const party = parties.find((p) => p.id === id);
    if (party) {
      setDueDate(defaultDueDate(issueDate, party.payment_terms_days));
      setCurrency(party.currency);
    }
  };

  const docLines: DocumentLine[] = lines.map((l) => ({
    id: String(l.key),
    description: l.description,
    quantity: Number(l.quantity) || 0,
    unit_price: Number(l.unit_price) || 0,
    tax_code_id: l.tax_code_id,
    account_id: l.account_id,
  }));
  const totals = documentTotals(docLines, state.taxCodes);
  const party = parties.find((p) => p.id === partyId);

  const update = (k: number, patch: Partial<LineState>) =>
    setLines((ls) => ls.map((l) => (l.key === k ? { ...l, ...patch } : l)));

  const save = async (approve: boolean) => {
    const input = {
      party_id: partyId,
      issue_date: issueDate,
      due_date: dueDate,
      supplier_reference: supplierRef,
      branch_id: branchId || null,
      notes: notes || undefined,
      currency,
      exchange_rate: fx.rateValue,
      custom_fields: custom,
      lines: docLines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        unit_price: l.unit_price,
        tax_code_id: l.tax_code_id,
        account_id: l.account_id,
      })),
    };
    setBusy(true);
    try {
      const res = await (isInvoice ? actions.createInvoice(input, approve) : actions.createBill(input, approve));
      if (!res.ok) return setError(res.error);
      toast.success(res.message ?? "Saved");
      onSaved?.(res.data.id);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="5xl"
      title={isInvoice ? "New sales invoice" : "New supplier bill"}
      description={
        isInvoice
          ? "Approving posts the invoice to Accounts Receivable, revenue and output VAT in one balanced entry."
          : "Approving posts the bill to Accounts Payable, the expense or asset account and input VAT."
      }
      buttons={[
        { label: "Cancel", onClick: onClose, className: BTN_SECONDARY },
        { label: "Save draft", onClick: () => save(false), className: BTN_SECONDARY, disabled: busy },
        { label: "Approve & post", onClick: () => save(true), className: BTN_PRIMARY, disabled: busy },
      ]}
    >
      <FormError message={error} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Field label={isInvoice ? "Customer" : "Supplier"} required className="md:col-span-2">
          <select value={partyId} onChange={(e) => chooseParty(e.target.value)} className={inputClass}>
            <option value="">Select {isInvoice ? "customer" : "supplier"}</option>
            {parties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.code})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Issue date" required>
          <input
            type="date"
            value={issueDate}
            max={todayIso()}
            onChange={(e) => {
              setIssueDate(e.target.value);
              if (party) setDueDate(defaultDueDate(e.target.value, party.payment_terms_days));
            }}
            className={inputClass}
          />
        </Field>
        <Field label="Due date" required hint={party ? `${party.payment_terms_days}-day terms` : undefined}>
          <input type="date" value={dueDate} min={issueDate} onChange={(e) => setDueDate(e.target.value)} className={inputClass} />
        </Field>
        {!isInvoice && (
          <Field label="Supplier invoice no." required hint="Used to catch duplicate bills.">
            <input
              value={supplierRef}
              onChange={(e) => setSupplierRef(e.target.value)}
              placeholder="e.g. TT-55102"
              className={inputClass}
            />
          </Field>
        )}
        <Field
          label="Currency"
          required
          hint={party && party.currency !== currency ? `${party.name} usually trades in ${party.currency}` : undefined}
        >
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputClass}>
            {currencies.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} · {c.name}
              </option>
            ))}
          </select>
        </Field>
        <FxRateField currency={currency} fx={fx} className="md:col-span-2" />
        <Field label="Branch">
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={inputClass}>
            <option value="">No branch</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Notes"
          className={
            isForeign(currency) ? (isInvoice ? "md:col-span-4" : "md:col-span-3") : isInvoice ? "md:col-span-2" : "md:col-span-1"
          }
        >
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={isInvoice ? "Shown on the invoice" : "Internal note"}
            className={inputClass}
          />
        </Field>
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-700">
        <table className="min-w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500 dark:bg-neutral-900/40 dark:text-neutral-400">
            <tr>
              <th className="px-3 py-2 font-normal">Description</th>
              <th className="px-3 py-2 font-normal w-[24%]">{isInvoice ? "Revenue account" : "Expense / asset account"}</th>
              <th className="px-3 py-2 font-normal w-[8%] text-right">Qty</th>
              <th className="px-3 py-2 font-normal w-[12%] text-right">Unit price</th>
              <th className="px-3 py-2 font-normal w-[13%]">Tax</th>
              <th className="px-3 py-2 font-normal w-[12%] text-right">Amount</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700">
            {lines.map((l) => (
              <tr key={l.key}>
                <td className="px-3 py-2">
                  <input
                    value={l.description}
                    onChange={(e) => update(l.key, { description: e.target.value })}
                    className={compactInputClass}
                    placeholder={isInvoice ? "e.g. Rice 25kg × bags" : "e.g. Delivery to Osu branch"}
                  />
                </td>
                <td className="px-3 py-2">
                  <AccountSelect
                    value={l.account_id}
                    onChange={(id) => update(l.key, { account_id: id })}
                    className={compactInputClass}
                    types={isInvoice ? REVENUE : SPEND}
                    filter={isInvoice ? undefined : nonBank}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    min={0}
                    value={l.quantity}
                    onChange={(e) => update(l.key, { quantity: e.target.value })}
                    className={`${compactInputClass} text-right tabular-nums`}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={l.unit_price}
                    onChange={(e) => update(l.key, { unit_price: e.target.value })}
                    className={`${compactInputClass} text-right tabular-nums`}
                  />
                </td>
                <td className="px-3 py-2">
                  <select
                    value={l.tax_code_id}
                    onChange={(e) => update(l.key, { tax_code_id: e.target.value })}
                    className={compactInputClass}
                  >
                    {taxCodes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.code} ({Math.round(t.rate * 1000) / 10}%)
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-neutral-700 dark:text-neutral-200">
                  {fmtMoney(lineAmount({ quantity: Number(l.quantity), unit_price: Number(l.unit_price) }), currency)}
                </td>
                <td className="px-2 py-2 text-center">
                  <button
                    type="button"
                    disabled={lines.length <= 1}
                    onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                    className="rounded p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30 disabled:hover:bg-transparent"
                    aria-label="Remove line"
                  >
                    <FiTrash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-col gap-4 border-t border-neutral-200 bg-neutral-50 px-3 py-3 sm:flex-row sm:items-start sm:justify-between dark:border-neutral-700 dark:bg-neutral-900/40">
          <button
            type="button"
            onClick={() => setLines((ls) => [...ls, blank(kind, state.org)])}
            className="inline-flex w-fit items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-900/20"
          >
            <FiPlus className="h-4 w-4" /> Add line
          </button>
          <dl className="w-full max-w-xs space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-neutral-500 dark:text-neutral-400">Subtotal</dt>
              <dd className="tabular-nums">{fmtMoney(totals.subtotal, currency)}</dd>
            </div>
            {totals.taxByCode.map((t) => (
              <div key={t.tax_code_id} className="flex justify-between">
                <dt className="text-neutral-500 dark:text-neutral-400">
                  {state.taxCodes.find((c) => c.id === t.tax_code_id)?.name}
                </dt>
                <dd className="tabular-nums">{fmtMoney(t.amount, currency)}</dd>
              </div>
            ))}
            <div className="flex justify-between border-t border-neutral-200 pt-1 text-base font-semibold dark:border-neutral-700">
              <dt>Total</dt>
              <dd className="tabular-nums">{fmtMoney(totals.total, currency)}</dd>
            </div>
            {isForeign(currency) && (
              <div className="flex justify-between text-xs text-neutral-500 dark:text-neutral-400">
                <dt>Posts to the ledger as</dt>
                <dd className="tabular-nums">{fx.rateValue > 0 ? fmtCurrency(toBase(totals.total, fx.rateValue)) : "—"}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      <CustomFieldInputs
        entity={entity}
        values={custom}
        onChange={setCustom}
        className="mt-6 rounded-xl border border-neutral-200 p-4 dark:border-neutral-700"
      />
    </Modal>
  );
};

export default DocumentFormModal;
