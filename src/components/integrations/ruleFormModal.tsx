"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { FiPlus, FiTrash2 } from "react-icons/fi";
import { Button, Field, FormError, compactInputClass, inputClass } from "@/components/ui";
import { BTN_PRIMARY, BTN_SECONDARY, Modal } from "@/components/modal";
import AccountSelect from "@/components/accounting/accountSelect";
import { useLedger } from "@/store/ledgerStore";
import type { AccountingRule, AccountingRuleLine, RuleAmountBasis } from "@/models/accounting";
import { fmtCurrency, round2 } from "@/utils/format";

const BASES: RuleAmountBasis[] = ["TOTAL", "SUBTOTAL", "TAX", "COST", "PRINCIPAL", "INTEREST", "FEES"];

interface RuleFormModalProps {
  open: boolean;
  onClose: () => void;
  /** The rule to edit; omitted when adding. */
  rule?: AccountingRule | null;
  onSaved?: (id: string) => void;
}

const emptyLine = (side: AccountingRuleLine["side"]): AccountingRuleLine => ({ side, account_id: "", basis: "TOTAL", label: "" });

const RuleFormModal = ({ open, onClose, rule, onSaved }: RuleFormModalProps) => {
  const { state, actions } = useLedger();
  const editing = rule ?? null;
  const [form, setForm] = useState({ name: "", event: "", source_id: "", description: "" });
  const [lines, setLines] = useState<AccountingRuleLine[]>([]);
  const [sample, setSample] = useState<Partial<Record<RuleAmountBasis, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (editing) {
      setForm({ name: editing.name, event: editing.event, source_id: editing.source_id, description: editing.description });
      setLines(editing.lines.map((l) => ({ ...l })));
      setSample(Object.fromEntries(Object.entries(editing.sample).map(([k, v]) => [k, String(v)])));
    } else {
      setForm({ name: "", event: "", source_id: state.dataSources[0]?.id ?? "", description: "" });
      setLines([emptyLine("DEBIT"), emptyLine("CREDIT")]);
      setSample({ TOTAL: "1000" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const bases = [...new Set(lines.map((l) => l.basis))];
  const sideTotal = (side: AccountingRuleLine["side"]) =>
    round2(lines.filter((l) => l.side === side).reduce((t, l) => t + (Number(sample[l.basis]) || 0), 0));
  const debits = sideTotal("DEBIT");
  const credits = sideTotal("CREDIT");
  const fixed = !!editing && editing.postings_count > 0;

  const setLine = (i: number, patch: Partial<AccountingRuleLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const save = async () => {
    setBusy(true);
    try {
      const input = {
        ...form,
        lines,
        sample: Object.fromEntries(bases.map((b) => [b, Number(sample[b]) || 0])) as Partial<Record<RuleAmountBasis, number>>,
      };
      const res = await actions.saveRule(input, editing?.id);
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
      size="3xl"
      title={editing ? `Edit ${editing.name}` : "New posting rule"}
      description="When the event arrives, each line posts the event's chosen amount to its account. Journals already posted never change."
      buttons={[
        { label: "Cancel", onClick: onClose, className: BTN_SECONDARY },
        { label: editing ? "Save rule" : "Add rule", onClick: save, className: BTN_PRIMARY, disabled: busy },
      ]}
    >
      <FormError message={error} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Name" required>
          <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Loan fee charged" className={inputClass} />
        </Field>
        <Field label="Source system" required hint={fixed ? "Fixed: this rule has posted journals." : undefined}>
          <select value={form.source_id} disabled={fixed} onChange={(e) => setForm((f) => ({ ...f, source_id: e.target.value }))} className={inputClass}>
            {state.dataSources.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Event" required hint={fixed ? "Fixed: this rule has posted journals." : "Dotted lower case, as the source sends it"}>
          <input
            value={form.event}
            disabled={fixed}
            onChange={(e) => setForm((f) => ({ ...f, event: e.target.value }))}
            placeholder="e.g. loans.fee.charged"
            className={`${inputClass} font-mono`}
          />
        </Field>
        <Field label="Description">
          <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className={inputClass} />
        </Field>
      </div>

      <h4 className="mt-6 mb-2 text-sm font-semibold">Posting lines</h4>
      <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-700">
        <table className="min-w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500 dark:bg-neutral-900/40">
            <tr>
              <th className="px-3 py-2 font-normal">Side</th>
              <th className="px-3 py-2 font-normal">Account</th>
              <th className="px-3 py-2 font-normal">Amount from</th>
              <th className="px-3 py-2 font-normal">Line label</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700">
            {lines.map((l, i) => (
              <tr key={i}>
                <td className="px-3 py-2">
                  <select
                    aria-label={`Line ${i + 1} side`}
                    value={l.side}
                    onChange={(e) => setLine(i, { side: e.target.value as AccountingRuleLine["side"] })}
                    className={`${compactInputClass} w-24`}
                  >
                    <option value="DEBIT">Debit</option>
                    <option value="CREDIT">Credit</option>
                  </select>
                </td>
                <td className="px-3 py-2">
                  <AccountSelect ariaLabel={`Line ${i + 1} account`} value={l.account_id} onChange={(id) => setLine(i, { account_id: id })} className={`${compactInputClass} min-w-56`} includeControl />
                </td>
                <td className="px-3 py-2">
                  <select
                    aria-label={`Line ${i + 1} amount`}
                    value={l.basis}
                    onChange={(e) => setLine(i, { basis: e.target.value as RuleAmountBasis })}
                    className={`${compactInputClass} w-32 font-mono text-xs`}
                  >
                    {BASES.map((b) => (
                      <option key={b} value={b}>
                        event.{b.toLowerCase()}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <input aria-label={`Line ${i + 1} label`} value={l.label} onChange={(e) => setLine(i, { label: e.target.value })} className={compactInputClass} />
                </td>
                <td className="px-3 py-2 text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={FiTrash2}
                    aria-label={`Remove line ${i + 1}`}
                    disabled={lines.length <= 2}
                    onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button size="sm" variant="ghost" icon={FiPlus} className="mt-2" onClick={() => setLines((ls) => [...ls, emptyLine("CREDIT")])}>
        Add line
      </Button>

      <h4 className="mt-6 mb-2 text-sm font-semibold">Sample event</h4>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {bases.map((b) => (
          <label key={b} className="text-sm">
            <span className="mb-1 block font-mono text-xs text-neutral-500">event.{b.toLowerCase()}</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={sample[b] ?? ""}
              onChange={(e) => setSample((s) => ({ ...s, [b]: e.target.value }))}
              className={`${compactInputClass} tabular-nums`}
            />
          </label>
        ))}
      </div>
      <p className={`mt-3 text-sm ${debits === credits && debits > 0 ? "text-emerald-600" : "text-amber-600"}`}>
        Debits {fmtCurrency(debits)} · Credits {fmtCurrency(credits)}
        {debits === credits && debits > 0 ? " · balanced" : " · must balance before the rule can be saved"}
      </p>
    </Modal>
  );
};

export default RuleFormModal;
