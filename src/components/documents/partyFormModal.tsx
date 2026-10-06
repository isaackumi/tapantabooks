"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { BTN_PRIMARY, BTN_SECONDARY, Modal } from "@/components/modal";
import { Field, FormError, Toggle, inputClass } from "@/components/ui";
import { useLedger } from "@/store/ledgerStore";
import type { Party } from "@/models/accounting";
import { CustomFieldInputs } from "@/components/customFields";
import { defaultCustomValues } from "@/lib/customFields";
import { BASE_CURRENCY } from "@/utils/format";

interface PartyFormModalProps {
  kind: "customer" | "supplier";
  open: boolean;
  onClose: () => void;
  party?: Party | null;
}

const empty = {
  name: "",
  email: "",
  phone: "",
  city: "",
  tin: "",
  payment_terms_days: "30",
  credit_limit: "0",
  currency: BASE_CURRENCY,
  active: true,
};

const PartyFormModal = ({ kind, open, onClose, party }: PartyFormModalProps) => {
  const { state, actions } = useLedger();
  const [form, setForm] = useState(empty);
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const entity = kind === "customer" ? "Customer" : "Supplier";
  const currencies = state.currencies.filter((c) => c.is_active || c.code === party?.currency);
  const hasDocs = !!party && (kind === "customer" ? state.invoices.some((d) => d.customer_id === party.id) : state.bills.some((d) => d.supplier_id === party.id));

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(
      party
        ? {
            name: party.name,
            email: party.email,
            phone: party.phone,
            city: party.city,
            tin: party.tin ?? "",
            payment_terms_days: String(party.payment_terms_days),
            credit_limit: String(party.credit_limit),
            currency: party.currency,
            active: party.status === "ACTIVE",
          }
        : empty,
    );
    setCustom(party ? (party.custom_fields ?? {}) : defaultCustomValues(state.customFields, entity));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, party]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    setBusy(true);
    try {
      const res = await actions.saveParty(
        kind,
        {
          name: form.name,
          email: form.email,
          phone: form.phone,
          city: form.city,
          tin: form.tin || undefined,
          payment_terms_days: Number(form.payment_terms_days) || 0,
          credit_limit: Number(form.credit_limit) || 0,
          currency: form.currency,
          status: form.active ? "ACTIVE" : "INACTIVE",
          custom_fields: custom,
        },
        party?.id,
      );
      if (!res.ok) return setError(res.error);
      toast.success(res.message ?? "Saved");
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="2xl"
      title={party ? `Edit ${party.name}` : `New ${kind}`}
      buttons={[
        { label: "Cancel", onClick: onClose, className: BTN_SECONDARY },
        { label: party ? "Save changes" : `Add ${kind}`, onClick: submit, className: BTN_PRIMARY, disabled: busy },
      ]}
    >
      <FormError message={error} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Name" required className="sm:col-span-2">
          <input value={form.name} onChange={set("name")} className={inputClass} />
        </Field>
        <Field label="Email">
          <input type="email" value={form.email} onChange={set("email")} className={inputClass} />
        </Field>
        <Field label="Phone">
          <input value={form.phone} onChange={set("phone")} placeholder="+233…" className={inputClass} />
        </Field>
        <Field label="City">
          <input value={form.city} onChange={set("city")} className={inputClass} />
        </Field>
        <Field label="TIN" hint="Ghana Revenue Authority taxpayer number">
          <input value={form.tin} onChange={set("tin")} className={inputClass} />
        </Field>
        <Field label="Payment terms (days)">
          <input type="number" min={0} value={form.payment_terms_days} onChange={set("payment_terms_days")} className={inputClass} />
        </Field>
        <Field label={kind === "customer" ? "Credit limit (GH₵)" : "Spend limit (GH₵)"} hint="0 means no limit">
          <input type="number" min={0} value={form.credit_limit} onChange={set("credit_limit")} className={inputClass} />
        </Field>
        <Field
          label="Default currency"
          hint={hasDocs ? "Changing it only affects new documents" : "Pre-selected on new invoices and bills; can be changed per document"}
        >
          <select value={form.currency} onChange={set("currency")} className={inputClass}>
            {currencies.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} · {c.name}
              </option>
            ))}
          </select>
        </Field>

        <CustomFieldInputs
          entity={entity}
          values={custom}
          onChange={setCustom}
          className="sm:col-span-2 mt-2 border-t border-neutral-200 pt-4 dark:border-neutral-700"
        />

        {party && (
          <div className="sm:col-span-2">
            <Toggle
              checked={form.active}
              onChange={(v) => setForm((f) => ({ ...f, active: v }))}
              label="Active"
              description={`Inactive ${kind}s keep their history but cannot be used on new documents.`}
            />
          </div>
        )}
      </div>
    </Modal>
  );
};

export default PartyFormModal;
