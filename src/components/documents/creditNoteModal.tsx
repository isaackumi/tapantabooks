"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { FiPlus, FiTrash2 } from "react-icons/fi";
import { BTN_PRIMARY, BTN_SECONDARY, Modal } from "@/components/modal";
import { Field, FormError, compactInputClass, inputClass } from "@/components/ui";
import AccountSelect from "@/components/accounting/accountSelect";
import { useLedger } from "@/store/ledgerStore";
import { billRows, invoiceRows } from "@/store/selectors";
import { documentTotals, lineAmount } from "@/lib/documents";
import type { AccountType, DocumentLine } from "@/models/accounting";
import { todayIso } from "@/utils/dates";
import { fmtDate, fmtMoney, round2 } from "@/utils/format";

interface LineState {
  key: number;
  description: string;
  quantity: string;
  unit_price: string;
  tax_code_id: string;
  account_id: string;
}

let key = 0;
const fromLine = (l: DocumentLine): LineState => ({
  key: key++,
  description: l.description,
  quantity: String(l.quantity),
  unit_price: String(l.unit_price),
  tax_code_id: l.tax_code_id,
  account_id: l.account_id,
});

const SALE_ACCOUNTS: AccountType[] = ["REVENUE", "EXPENSE", "EQUITY"];
const PURCHASE_ACCOUNTS: AccountType[] = ["EXPENSE", "ASSET", "EQUITY"];
const nonBank = (a: { is_bank: boolean }) => !a.is_bank;

interface CreditNoteModalProps {
  kind: "customer" | "supplier";
  open: boolean;
  onClose: () => void;
  /** Pre-selects the invoice or bill being credited. */
  documentId?: string | null;
}

/** Customer credit note against an invoice, or a supplier's credit against a bill. */
const CreditNoteModal = ({ kind, open, onClose, documentId }: CreditNoteModalProps) => {
  const { state, actions } = useLedger();
  const isCustomer = kind === "customer";
  const openDocs = useMemo(
    () => (isCustomer ? invoiceRows(state) : billRows(state)).filter((r) => r.outstanding > 0),
    [state, isCustomer],
  );
  const taxCodes = state.taxCodes.filter((t) => t.is_active && t.kind !== "WITHHOLDING");

  const [docId, setDocId] = useState("");
  const [date, setDate] = useState(todayIso());
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<LineState[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const row = openDocs.find((r) => r.doc.id === docId);
  const currency = row?.currency ?? state.org.base_currency;
  const pick = (id: string) => {
    setDocId(id);
    const r = openDocs.find((x) => x.doc.id === id);
    setLines(r ? r.doc.lines.map(fromLine) : []);
  };

  useEffect(() => {
    if (!open) return;
    pick(openDocs.find((r) => r.doc.id === documentId)?.doc.id ?? "");
    setDate(todayIso());
    setReason("");
    setReference("");
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, documentId]);

  const asLines = lines.map((l) => ({
    id: String(l.key),
    description: l.description,
    quantity: Number(l.quantity) || 0,
    unit_price: Number(l.unit_price) || 0,
    tax_code_id: l.tax_code_id,
    account_id: l.account_id,
  }));
  const totals = documentTotals(asLines, state.taxCodes);
  const over = row ? round2(totals.total - row.outstanding_fc) : 0;
  const update = (k: number, patch: Partial<LineState>) => setLines((ls) => ls.map((l) => (l.key === k ? { ...l, ...patch } : l)));

  const submit = async () => {
    setBusy(true);
    try {
      const res = await actions.createCreditNote(kind, {
        document_id: docId,
        date,
        reason,
        supplier_reference: isCustomer ? undefined : reference,
        lines: asLines.map((l) => ({
          description: l.description,
          quantity: l.quantity,
          unit_price: l.unit_price,
          tax_code_id: l.tax_code_id,
          account_id: l.account_id,
        })),
      });
      if (!res.ok) return setError(res.error);
      toast.success(res.message ?? "Credit recorded");
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="4xl"
      title={isCustomer ? "Issue credit note" : "Record supplier credit"}
      description={
        isCustomer
          ? "Reduces what the customer owes on an invoice and reverses the revenue and output VAT on the lines you credit. Use it for returns, price corrections and agreed discounts."
          : "Reduces what you owe on a bill and reverses the cost and input VAT on the lines credited. Enter it when the supplier sends you a credit note."
      }
      buttons={[
        { label: "Cancel", onClick: onClose, className: BTN_SECONDARY },
        {
          label: isCustomer ? "Issue credit note" : "Record credit",
          onClick: submit,
          className: BTN_PRIMARY,
          disabled: busy || !row || over > 0.005 || lines.length === 0,
        },
      ]}
    >
      <FormError message={error} />
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={isCustomer ? "Invoice" : "Bill"} required className="sm:col-span-2">
            <select value={docId} onChange={(e) => pick(e.target.value)} className={inputClass}>
              <option value="">Select an open {isCustomer ? "invoice" : "bill"}</option>
              {openDocs.map((r) => (
                <option key={r.doc.id} value={r.doc.id}>
                  {r.doc.number} · {r.party?.name} · {fmtMoney(r.outstanding_fc, r.currency)} owed · {fmtDate(r.doc.issue_date)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date" required>
            <input
              type="date"
              value={date}
              min={row?.doc.issue_date}
              max={todayIso()}
              onChange={(e) => setDate(e.target.value)}
              className={inputClass}
            />
          </Field>
          {!isCustomer && (
            <Field label="Supplier's credit note no." required>
              <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. CR-88214" className={inputClass} />
            </Field>
          )}
          <Field label="Reason" required className={isCustomer ? "" : "sm:col-span-2"} hint="Printed on the credit note and kept on the audit trail.">
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={isCustomer ? "e.g. 3 bags returned damaged" : "e.g. Goods returned – failed quality check"}
              className={inputClass}
            />
          </Field>
        </div>

        {row && (
          <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-700">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-50 text-left text-neutral-500 dark:bg-neutral-900/40 dark:text-neutral-400">
                <tr>
                  <th className="px-3 py-2 font-normal">Description</th>
                  <th className="w-56 px-3 py-2 font-normal">Account</th>
                  <th className="w-20 px-3 py-2 text-right font-normal">Qty</th>
                  <th className="w-28 px-3 py-2 text-right font-normal">Price</th>
                  <th className="w-36 px-3 py-2 font-normal">Tax</th>
                  <th className="w-28 px-3 py-2 text-right font-normal">Amount</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700">
                {lines.map((l) => (
                  <tr key={l.key}>
                    <td className="px-3 py-2">
                      <input value={l.description} onChange={(e) => update(l.key, { description: e.target.value })} className={compactInputClass} />
                    </td>
                    <td className="px-3 py-2">
                      <AccountSelect
                        value={l.account_id}
                        onChange={(id) => update(l.key, { account_id: id })}
                        className={compactInputClass}
                        types={isCustomer ? SALE_ACCOUNTS : PURCHASE_ACCOUNTS}
                        filter={isCustomer ? undefined : nonBank}
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
                      <select value={l.tax_code_id} onChange={(e) => update(l.key, { tax_code_id: e.target.value })} className={compactInputClass}>
                        {taxCodes.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.code} ({Math.round(t.rate * 1000) / 10}%)
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmtMoney(lineAmount({ quantity: Number(l.quantity), unit_price: Number(l.unit_price) }), currency)}
                    </td>
                    <td className="px-2 py-2 text-center">
                      <button
                        type="button"
                        disabled={lines.length <= 1}
                        onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                        className="rounded p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
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
                onClick={() => setLines((ls) => [...ls, { ...fromLine(row.doc.lines[0]), description: "", quantity: "1", unit_price: "" }])}
                className="inline-flex w-fit items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-900/20"
              >
                <FiPlus className="h-4 w-4" /> Add line
              </button>
              <dl className="w-full max-w-xs space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-neutral-500">Subtotal</dt>
                  <dd className="tabular-nums">{fmtMoney(totals.subtotal, currency)}</dd>
                </div>
                {totals.taxByCode.map((t) => (
                  <div key={t.tax_code_id} className="flex justify-between">
                    <dt className="text-neutral-500">{state.taxCodes.find((c) => c.id === t.tax_code_id)?.name}</dt>
                    <dd className="tabular-nums">{fmtMoney(t.amount, currency)}</dd>
                  </div>
                ))}
                <div className="flex justify-between border-t border-neutral-200 pt-1 text-base font-semibold dark:border-neutral-700">
                  <dt>Credit total</dt>
                  <dd className="tabular-nums">{fmtMoney(totals.total, currency)}</dd>
                </div>
                <div className="flex justify-between text-xs text-neutral-500">
                  <dt>Still owed on {row.doc.number}</dt>
                  <dd className="tabular-nums">{fmtMoney(row.outstanding_fc, currency)}</dd>
                </div>
                {over > 0.005 && (
                  <p className="text-xs text-red-600 dark:text-red-400">
                    {fmtMoney(over, currency)} more than is owed. Reduce the quantities or prices.
                  </p>
                )}
              </dl>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default CreditNoteModal;
