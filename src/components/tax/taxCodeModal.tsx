"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Field, FormError, inputClass } from "@/components/ui";
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, Modal } from "@/components/modal";
import { useLedger } from "@/store/ledgerStore";
import type { Account, TaxCode } from "@/models/accounting";

interface TaxCodeModalProps {
  open: boolean;
  onClose: () => void;
  /** The code to edit; omitted when adding. */
  taxCode?: TaxCode | null;
}

const KINDS: { value: TaxCode["kind"]; label: string }[] = [
  { value: "OUTPUT_INPUT", label: "VAT / levy (charged on sales, recovered on purchases)" },
  { value: "WITHHOLDING", label: "Withholding tax" },
  { value: "EXEMPT", label: "Exempt (no tax)" },
];

const blank = { code: "", name: "", kind: "OUTPUT_INPUT" as TaxCode["kind"], rate: "", output_account_id: "", input_account_id: "", description: "" };

const TaxCodeModal = ({ open, onClose, taxCode }: TaxCodeModalProps) => {
  const { state, actions } = useLedger();
  const editing = taxCode ?? null;
  const [form, setForm] = useState(blank);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const postable = (a: Account, type: Account["type"]) =>
    a.type === type && !a.is_group && !a.is_control && !a.is_bank && (a.is_active || a.id === form.output_account_id || a.id === form.input_account_id);
  const liabilities = state.accounts.filter((a) => postable(a, "LIABILITY"));
  const assets = state.accounts.filter((a) => postable(a, "ASSET"));

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(
      editing
        ? {
            code: editing.code,
            name: editing.name,
            kind: editing.kind,
            rate: String(Math.round(editing.rate * 100000) / 1000),
            output_account_id: editing.output_account_id ?? "",
            input_account_id: editing.input_account_id ?? "",
            description: editing.description,
          }
        : blank,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const run = async (request: () => ReturnType<typeof actions.updateTaxCode>) => {
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
    const input = {
      code: form.code,
      name: form.name,
      kind: form.kind,
      rate: form.kind === "EXEMPT" ? 0 : (Number(form.rate) || 0) / 100,
      output_account_id: form.kind === "EXEMPT" ? null : form.output_account_id || null,
      input_account_id: form.kind === "OUTPUT_INPUT" ? form.input_account_id || null : null,
      description: form.description,
    };
    return run(() => (editing ? actions.updateTaxCode(editing.id, input) : actions.createTaxCode(input)));
  };

  const toggleActive = () => editing && run(() => actions.updateTaxCode(editing.id, { is_active: !editing.is_active }));
  const accountLabel = (a: Account) => `${a.code} ${a.name}`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `Edit ${editing.code}` : "Add tax code"}
      description={
        editing
          ? "Code, kind and rate are fixed once an invoice, bill or credit uses this code. To change a rate, add a new code and deactivate this one."
          : "Tax codes are chosen on invoice and bill lines. Rates are a percentage of the line amount."
      }
      buttons={[
        ...(editing
          ? [{ label: editing.is_active ? "Deactivate" : "Reactivate", onClick: toggleActive, className: editing.is_active ? BTN_DANGER : BTN_SECONDARY, disabled: busy }]
          : []),
        { label: "Cancel", onClick: onClose, className: BTN_SECONDARY },
        { label: editing ? "Save changes" : "Add tax code", onClick: save, className: BTN_PRIMARY, disabled: busy },
      ]}
    >
      <FormError message={error} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Code" required hint="Letters, digits and dashes, e.g. GH-STD">
          <input value={form.code} onChange={set("code")} placeholder="e.g. GH-TOUR" className={`${inputClass} uppercase`} />
        </Field>
        <Field label="Name" required>
          <input value={form.name} onChange={set("name")} placeholder="e.g. Tourism levy" className={inputClass} />
        </Field>
        <Field label="Kind" required className="sm:col-span-2">
          <select value={form.kind} onChange={set("kind")} className={inputClass}>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </Field>
        {form.kind !== "EXEMPT" && (
          <Field label="Rate (%)" required>
            <input type="number" min={0} max={99.99} step="0.01" value={form.rate} onChange={set("rate")} placeholder="e.g. 20" className={inputClass} />
          </Field>
        )}
        {form.kind !== "EXEMPT" && (
          <Field label={form.kind === "WITHHOLDING" ? "Withholding payable account" : "Output tax account (sales)"} required>
            <select value={form.output_account_id} onChange={set("output_account_id")} className={inputClass}>
              <option value="">Choose a liability account</option>
              {liabilities.map((a) => (
                <option key={a.id} value={a.id}>
                  {accountLabel(a)}
                </option>
              ))}
            </select>
          </Field>
        )}
        {form.kind === "OUTPUT_INPUT" && (
          <Field label="Input tax account (purchases)" hint="Left empty, purchase tax posts to the default VAT input account.">
            <select value={form.input_account_id} onChange={set("input_account_id")} className={inputClass}>
              <option value="">Default VAT input account</option>
              {assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {accountLabel(a)}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Description" className="sm:col-span-2">
          <textarea value={form.description} onChange={set("description")} rows={2} className={inputClass} />
        </Field>
      </div>
    </Modal>
  );
};

export default TaxCodeModal;
