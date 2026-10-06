"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { BTN_PRIMARY, BTN_SECONDARY, Modal } from "@/components/modal";
import { Field, FormError, inputClass } from "@/components/ui";
import { useLedger } from "@/store/ledgerStore";
import { billRows, invoiceRows } from "@/store/selectors";
import type { PaymentMethod } from "@/models/accounting";
import { todayIso } from "@/utils/dates";
import { fmtCurrency, fmtDate } from "@/utils/format";

const METHODS: { id: PaymentMethod; label: string }[] = [
  { id: "BANK_TRANSFER", label: "Bank transfer" },
  { id: "MOBILE_MONEY", label: "Mobile money" },
  { id: "CASH", label: "Cash" },
  { id: "CHEQUE", label: "Cheque" },
];

const defaultBankFor = (method: PaymentMethod) =>
  method === "CASH" ? "ba_cash" : method === "MOBILE_MONEY" ? "ba_momo" : "ba_gcb";

interface PaymentModalProps {
  kind: "receipt" | "payment";
  open: boolean;
  onClose: () => void;
  /** Pre-selects the document being settled. */
  documentId?: string | null;
}

const PaymentModal = ({ kind, open, onClose, documentId }: PaymentModalProps) => {
  const { state, actions } = useLedger();
  const isReceipt = kind === "receipt";
  const openDocs = useMemo(
    () => (isReceipt ? invoiceRows(state) : billRows(state)).filter((r) => r.outstanding > 0),
    [state, isReceipt],
  );

  const [docId, setDocId] = useState("");
  const [date, setDate] = useState(todayIso());
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("BANK_TRANSFER");
  const [bankId, setBankId] = useState("ba_gcb");
  const [reference, setReference] = useState("");
  const [error, setError] = useState<string | null>(null);

  const row = openDocs.find((r) => r.doc.id === docId);

  useEffect(() => {
    if (!open) return;
    const initial = openDocs.find((r) => r.doc.id === documentId);
    setDocId(initial?.doc.id ?? "");
    setAmount(initial ? String(initial.outstanding) : "");
    setDate(todayIso());
    setMethod("BANK_TRANSFER");
    setBankId("ba_gcb");
    setReference("");
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, documentId]);

  const submit = () => {
    const res = actions.recordPayment(kind, {
      document_id: docId,
      date,
      amount: Number(amount),
      method,
      bank_account_id: bankId,
      reference: reference || undefined,
    });
    if (!res.ok) return setError(res.error);
    toast.success(res.message ?? "Recorded");
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={isReceipt ? "Record customer receipt" : "Record supplier payment"}
      description={
        isReceipt
          ? "Debits the bank or cash account and clears the customer's balance in Accounts Receivable."
          : "Clears the supplier's balance in Accounts Payable and credits the bank or cash account."
      }
      buttons={[
        { label: "Cancel", onClick: onClose, className: BTN_SECONDARY },
        { label: isReceipt ? "Record receipt" : "Record payment", onClick: submit, className: BTN_PRIMARY },
      ]}
    >
      <FormError message={error} />
      <div className="space-y-4">
        <Field label={isReceipt ? "Invoice" : "Bill"} required>
          <select
            value={docId}
            onChange={(e) => {
              setDocId(e.target.value);
              const r = openDocs.find((x) => x.doc.id === e.target.value);
              if (r) setAmount(String(r.outstanding));
            }}
            className={inputClass}
          >
            <option value="">Select an open {isReceipt ? "invoice" : "bill"}</option>
            {openDocs.map((r) => (
              <option key={r.doc.id} value={r.doc.id}>
                {r.doc.number} · {r.party?.name} · {fmtCurrency(r.outstanding)} due {fmtDate(r.doc.due_date)}
              </option>
            ))}
          </select>
        </Field>
        {row && (
          <div className="grid grid-cols-3 gap-3 rounded-xl bg-neutral-50 p-3 text-sm dark:bg-neutral-900/40">
            <div>
              <p className="text-xs text-neutral-500">Total</p>
              <p className="font-medium tabular-nums">{fmtCurrency(row.totals.total)}</p>
            </div>
            <div>
              <p className="text-xs text-neutral-500">Paid so far</p>
              <p className="font-medium tabular-nums">{fmtCurrency(row.doc.amount_paid)}</p>
            </div>
            <div>
              <p className="text-xs text-neutral-500">Outstanding</p>
              <p className="font-semibold tabular-nums text-brand-700 dark:text-brand-300">
                {fmtCurrency(row.outstanding)}
              </p>
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Date" required>
            <input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Amount" required hint={row ? "Part payments are allowed." : undefined}>
            <input
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={`${inputClass} tabular-nums`}
            />
          </Field>
          <Field label="Method" required>
            <select
              value={method}
              onChange={(e) => {
                const m = e.target.value as PaymentMethod;
                setMethod(m);
                setBankId(defaultBankFor(m));
              }}
              className={inputClass}
            >
              {METHODS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label={isReceipt ? "Deposit to" : "Pay from"} required>
            <select value={bankId} onChange={(e) => setBankId(e.target.value)} className={inputClass}>
              {state.bankAccounts.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Reference" className="sm:col-span-2">
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Bank or MoMo transaction ID"
              className={inputClass}
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
};

export default PaymentModal;
