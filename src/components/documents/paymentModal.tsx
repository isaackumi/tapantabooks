"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { BTN_PRIMARY, BTN_SECONDARY, Modal } from "@/components/modal";
import { Field, FormError, inputClass } from "@/components/ui";
import { useLedger } from "@/store/ledgerStore";
import { billRows, invoiceRows } from "@/store/selectors";
import type { PaymentMethod } from "@/models/accounting";
import { todayIso } from "@/utils/dates";
import { BASE_CURRENCY, classNames, fmtCurrency, fmtDate, fmtMoney, fmtRate } from "@/utils/format";
import { FxRateField, useFxRate } from "@/components/fxRateField";
import { carryingBaseFor, isForeign, toBase } from "@/lib/fx";

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
  const currency = row?.currency ?? BASE_CURRENCY;
  const foreign = isForeign(currency);
  const fx = useFxRate(currency, date, open);
  const banks = state.bankAccounts.filter((b) => b.currency === BASE_CURRENCY || b.currency === currency);

  const amountFc = Number(amount) || 0;
  const preview =
    row && foreign && amountFc > 0 && fx.rateValue > 0
      ? (() => {
          const carrying = carryingBaseFor(row.doc, row.totals.total, Math.min(amountFc, row.outstanding_fc));
          const bankBase = toBase(amountFc, fx.rateValue);
          return { carrying, bankBase, gain: Math.round((isReceipt ? bankBase - carrying : carrying - bankBase) * 100) / 100 };
        })()
      : null;

  useEffect(() => {
    if (!banks.some((b) => b.id === bankId)) setBankId(banks.find((b) => b.currency === currency)?.id ?? "ba_gcb");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency]);

  useEffect(() => {
    if (!open) return;
    const initial = openDocs.find((r) => r.doc.id === documentId);
    setDocId(initial?.doc.id ?? "");
    setAmount(initial ? String(initial.outstanding_fc) : "");
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
      exchange_rate: fx.rateValue,
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
              if (r) setAmount(String(r.outstanding_fc));
            }}
            className={inputClass}
          >
            <option value="">Select an open {isReceipt ? "invoice" : "bill"}</option>
            {openDocs.map((r) => (
              <option key={r.doc.id} value={r.doc.id}>
                {r.doc.number} · {r.party?.name} · {fmtMoney(r.outstanding_fc, r.currency)} due {fmtDate(r.doc.due_date)}
              </option>
            ))}
          </select>
        </Field>
        {row && (
          <div className="grid grid-cols-3 gap-3 rounded-xl bg-neutral-50 p-3 text-sm dark:bg-neutral-900/40">
            <div>
              <p className="text-xs text-neutral-500">Total</p>
              <p className="font-medium tabular-nums">{fmtMoney(row.totals.total, currency)}</p>
            </div>
            <div>
              <p className="text-xs text-neutral-500">Paid so far</p>
              <p className="font-medium tabular-nums">{fmtMoney(row.doc.amount_paid, currency)}</p>
            </div>
            <div>
              <p className="text-xs text-neutral-500">Outstanding</p>
              <p className="font-semibold tabular-nums text-brand-700 dark:text-brand-300">
                {fmtMoney(row.outstanding_fc, currency)}
              </p>
            </div>
            {foreign && (
              <p className="col-span-3 text-xs text-neutral-500 dark:text-neutral-400">
                Booked at {fmtRate(row.doc.exchange_rate)} · {fmtCurrency(row.outstanding)} still carried in Accounts{" "}
                {isReceipt ? "Receivable" : "Payable"}
              </p>
            )}
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Date" required>
            <input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </Field>
          <Field label={foreign ? `Amount (${currency})` : "Amount"} required hint={row ? "Part payments are allowed." : undefined}>
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
              {banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                  {b.currency !== BASE_CURRENCY ? ` (${b.currency})` : ""}
                </option>
              ))}
            </select>
          </Field>
          {foreign && <FxRateField currency={currency} fx={fx} label="Rate on payment date" className="sm:col-span-2" />}
          <Field label="Reference" className="sm:col-span-2">
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Bank or MoMo transaction ID"
              className={inputClass}
            />
          </Field>
        </div>
        {preview && (
          <div className="rounded-xl border border-neutral-200 p-4 text-sm dark:border-neutral-700">
            <p className="mb-2 font-semibold">How this posts in GH₵</p>
            <dl className="space-y-1">
              <div className="flex justify-between">
                <dt className="text-neutral-500">{isReceipt ? "Bank receives" : "Bank pays"} at {fmtRate(fx.rateValue)}</dt>
                <dd className="tabular-nums">{fmtCurrency(preview.bankBase)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500">
                  {isReceipt ? "Receivable cleared" : "Payable cleared"} at {fmtRate(row!.doc.exchange_rate)}
                </dt>
                <dd className="tabular-nums">{fmtCurrency(preview.carrying)}</dd>
              </div>
              <div
                className={classNames(
                  "flex justify-between border-t border-neutral-200 pt-1 font-semibold dark:border-neutral-700",
                  preview.gain > 0 ? "text-emerald-700 dark:text-emerald-400" : preview.gain < 0 ? "text-red-700 dark:text-red-400" : "",
                )}
              >
                <dt>{preview.gain >= 0 ? "Realised exchange gain" : "Realised exchange loss"}</dt>
                <dd className="tabular-nums">{fmtCurrency(Math.abs(preview.gain))}</dd>
              </div>
            </dl>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default PaymentModal;
