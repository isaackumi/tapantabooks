"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Field, FormError, inputClass } from "@/components/ui";
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, Modal } from "@/components/modal";
import { useLedger } from "@/store/ledgerStore";
import type { BankAccount } from "@/models/accounting";
import { BASE_CURRENCY } from "@/utils/format";

interface BankAccountModalProps {
  open: boolean;
  onClose: () => void;
  /** The account to edit; omitted when adding. */
  account?: BankAccount | null;
}

const NEW_LEDGER = "";

const BankAccountModal = ({ open, onClose, account }: BankAccountModalProps) => {
  const { state, actions } = useLedger();
  const editing = account ?? null;
  const [form, setForm] = useState({ name: "", bank: "", account_number: "", currency: BASE_CURRENCY, gl_account_id: NEW_LEDGER });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const currencies = state.currencies.filter((c) => c.is_active || c.code === editing?.currency);
  const linked = new Set(state.bankAccounts.map((b) => b.gl_account_id));
  const freeLedgers = state.accounts.filter((a) => a.is_bank && !a.is_group && a.is_active && !linked.has(a.id));
  const ledger = editing && state.accounts.find((a) => a.id === editing.gl_account_id);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(
      editing
        ? { name: editing.name, bank: editing.bank, account_number: editing.account_number, currency: editing.currency, gl_account_id: editing.gl_account_id }
        : { name: "", bank: "", account_number: "", currency: BASE_CURRENCY, gl_account_id: NEW_LEDGER },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const run = async (request: () => ReturnType<typeof actions.updateBankAccount>) => {
    setBusy(true);
    try {
      const res = await request();
      if (!res.ok) return setError(res.error);
      toast.success(res.message ?? "Saved");
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    const { gl_account_id, ...fields } = form;
    return run(() =>
      editing ? actions.updateBankAccount(editing.id, fields) : actions.createBankAccount({ ...fields, gl_account_id: gl_account_id || null }),
    );
  };

  const toggleActive = () => editing && run(() => actions.updateBankAccount(editing.id, { is_active: !editing.is_active }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${editing.name}` : "Add bank or cash account"}
      description={
        editing
          ? "History stays on the account. Deactivating needs a zero balance and every statement line matched."
          : "Bank accounts, mobile money wallets and cash floats each post to their own ledger account."
      }
      buttons={[
        ...(editing
          ? [
              {
                label: editing.is_active ? "Deactivate" : "Reactivate",
                onClick: toggleActive,
                className: editing.is_active ? BTN_DANGER : BTN_SECONDARY,
                disabled: busy,
              },
            ]
          : []),
        { label: "Cancel", onClick: onClose, className: BTN_SECONDARY },
        { label: editing ? "Save changes" : "Add account", onClick: save, className: BTN_PRIMARY, disabled: busy },
      ]}
    >
      <FormError message={error} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Account name" required className="sm:col-span-2">
          <input value={form.name} onChange={set("name")} placeholder="e.g. Fidelity Bank – Collections" className={inputClass} />
        </Field>
        <Field label="Bank or provider" required>
          <input value={form.bank} onChange={set("bank")} placeholder="e.g. Fidelity Bank Ghana" className={inputClass} />
        </Field>
        <Field label="Account number" required hint="Store the last four digits only, e.g. ••••1234">
          <input value={form.account_number} onChange={set("account_number")} placeholder="••••1234" className={inputClass} />
        </Field>
        <Field label="Currency" required hint={editing ? "Fixed once the account has postings or statement lines." : undefined}>
          <select value={form.currency} onChange={set("currency")} className={inputClass}>
            {currencies.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} – {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ledger account" required>
          {editing ? (
            <p className="py-2 text-sm text-neutral-700 dark:text-neutral-200">{ledger ? `${ledger.code} ${ledger.name}` : "—"}</p>
          ) : (
            <select value={form.gl_account_id} onChange={set("gl_account_id")} className={inputClass}>
              <option value={NEW_LEDGER}>Open a new ledger account</option>
              {freeLedgers.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} {a.name}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
    </Modal>
  );
};

export default BankAccountModal;
