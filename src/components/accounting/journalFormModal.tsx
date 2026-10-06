"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { FiPlus, FiTrash2, FiCheckCircle, FiAlertTriangle } from "react-icons/fi";
import { BTN_PRIMARY, BTN_SECONDARY, Modal } from "@/components/modal";
import { Field, FormError, compactInputClass, inputClass } from "@/components/ui";
import AccountSelect from "./accountSelect";
import { periodForDate, useLedger, type JournalDraftInput } from "@/store/ledgerStore";
import { dimensionsOf } from "@/store/selectors";
import { lineTotals } from "@/lib/ledger";
import type { JournalEntry } from "@/models/accounting";
import { todayIso } from "@/utils/dates";
import { fmtCurrency, round2 } from "@/utils/format";

interface LineState {
  key: number;
  account_id: string;
  description: string;
  debit: string;
  credit: string;
  cost_centre_id: string;
}

let lineKey = 0;
const blankLine = (): LineState => ({
  key: lineKey++,
  account_id: "",
  description: "",
  debit: "",
  credit: "",
  cost_centre_id: "",
});

interface JournalFormModalProps {
  open: boolean;
  onClose: () => void;
  /** Draft being edited; omit to create a new entry. */
  draft?: JournalEntry | null;
  onSaved?: (journal: JournalEntry) => void;
}

const JournalFormModal = ({ open, onClose, draft, onSaved }: JournalFormModalProps) => {
  const { state, actions } = useLedger();
  const [date, setDate] = useState(todayIso());
  const [memo, setMemo] = useState("");
  const [reference, setReference] = useState("");
  const [branchId, setBranchId] = useState("");
  const [lines, setLines] = useState<LineState[]>([blankLine(), blankLine()]);
  const [error, setError] = useState<string | null>(null);

  const branches = dimensionsOf(state, "BRANCH");
  const costCentres = dimensionsOf(state, "COST_CENTRE");

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (draft) {
      setDate(draft.date);
      setMemo(draft.memo);
      setReference(draft.reference ?? "");
      setBranchId(draft.branch_id ?? "");
      setLines(
        draft.lines.map((l) => ({
          key: lineKey++,
          account_id: l.account_id,
          description: l.description ?? "",
          debit: l.debit ? String(l.debit) : "",
          credit: l.credit ? String(l.credit) : "",
          cost_centre_id: l.cost_centre_id ?? "",
        })),
      );
    } else {
      setDate(todayIso());
      setMemo("");
      setReference("");
      setBranchId(branches[0]?.id ?? "");
      setLines([blankLine(), blankLine()]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draft]);

  const numericLines = lines.map((l) => ({ debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 }));
  const totals = lineTotals(numericLines);
  const balanced = totals.debit > 0 && Math.abs(totals.difference) < 0.005;
  const needsApproval =
    state.org.require_approval_for_manual_journals && totals.debit >= state.org.approval_threshold;
  const period = useMemo(() => (date ? periodForDate(state, date) : undefined), [state, date]);

  const update = (key: number, patch: Partial<LineState>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const balanceLast = () => {
    if (balanced || lines.length === 0) return;
    const diff = round2(totals.difference);
    const target = [...lines].reverse().find((l) => !l.debit && !l.credit) ?? lines[lines.length - 1];
    update(target.key, diff > 0 ? { credit: String(diff), debit: "" } : { debit: String(-diff), credit: "" });
  };

  const toInput = (): JournalDraftInput => ({
    date,
    memo,
    reference: reference || undefined,
    branch_id: branchId || null,
    lines: lines
      .filter((l) => l.account_id || l.debit || l.credit)
      .map((l) => ({
        account_id: l.account_id,
        description: l.description || undefined,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
        cost_centre_id: l.cost_centre_id || null,
      })),
  });

  const save = (intent: "DRAFT" | "POST") => {
    const input = toInput();
    if (draft) {
      const res = actions.updateDraftJournal(draft.id, input);
      if (!res.ok) return setError(res.error);
      if (intent === "POST") {
        const posted = actions.submitJournal(draft.id);
        if (!posted.ok) {
          setError(`Draft saved, but it could not be posted: ${posted.error}`);
          return;
        }
        toast.success(posted.message ?? "Posted");
        onSaved?.(posted.data);
      } else {
        toast.success(res.message ?? "Saved");
        onSaved?.(res.data);
      }
      onClose();
      return;
    }
    const res = actions.createJournal(input, intent);
    if (!res.ok) return setError(res.error);
    toast.success(res.message ?? "Saved", { duration: 5000 });
    onSaved?.(res.data);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="5xl"
      title={draft ? `Edit draft ${draft.number}` : "New journal entry"}
      description="Manual double-entry journal. Debits must equal credits. Customer and supplier control accounts are posted through invoices, bills and payments."
      buttons={[
        { label: "Cancel", onClick: onClose, className: BTN_SECONDARY },
        { label: "Save draft", onClick: () => save("DRAFT"), className: BTN_SECONDARY },
        {
          label: needsApproval ? "Submit for approval" : "Post entry",
          onClick: () => save("POST"),
          className: BTN_PRIMARY,
          disabled: !balanced,
        },
      ]}
    >
      <FormError message={error} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Field
          label="Date"
          required
          error={period && period.status !== "OPEN" ? `${period.name} is ${period.status.toLowerCase()}` : null}
          hint={period ? `${period.name} · open` : "No fiscal period covers this date"}
        >
          <input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Memo" required className="md:col-span-2">
          <input
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="e.g. Accrue October electricity"
            className={inputClass}
          />
        </Field>
        <Field label="Reference">
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Optional"
            className={inputClass}
          />
        </Field>
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
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-700">
        <table className="min-w-full text-sm">
          <thead className="bg-neutral-50 text-left text-neutral-500 dark:bg-neutral-900/40 dark:text-neutral-400">
            <tr>
              <th className="px-3 py-2 font-normal w-[32%]">Account</th>
              <th className="px-3 py-2 font-normal">Description</th>
              <th className="px-3 py-2 font-normal w-[14%]">Cost centre</th>
              <th className="px-3 py-2 font-normal text-right w-[13%]">Debit</th>
              <th className="px-3 py-2 font-normal text-right w-[13%]">Credit</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700">
            {lines.map((l) => (
              <tr key={l.key}>
                <td className="px-3 py-2">
                  <AccountSelect
                    value={l.account_id}
                    onChange={(id) => update(l.key, { account_id: id })}
                    className={compactInputClass}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    value={l.description}
                    onChange={(e) => update(l.key, { description: e.target.value })}
                    className={compactInputClass}
                    placeholder="Line note"
                  />
                </td>
                <td className="px-3 py-2">
                  <select
                    value={l.cost_centre_id}
                    onChange={(e) => update(l.key, { cost_centre_id: e.target.value })}
                    className={compactInputClass}
                  >
                    <option value="">—</option>
                    {costCentres.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    value={l.debit}
                    onChange={(e) => update(l.key, { debit: e.target.value, credit: e.target.value ? "" : l.credit })}
                    className={`${compactInputClass} text-right tabular-nums`}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    value={l.credit}
                    onChange={(e) => update(l.key, { credit: e.target.value, debit: e.target.value ? "" : l.debit })}
                    className={`${compactInputClass} text-right tabular-nums`}
                  />
                </td>
                <td className="px-2 py-2 text-center">
                  <button
                    type="button"
                    disabled={lines.length <= 2}
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
          <tfoot className="bg-neutral-50 dark:bg-neutral-900/40">
            <tr>
              <td colSpan={3} className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setLines((ls) => [...ls, blankLine()])}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-900/20"
                  >
                    <FiPlus className="h-4 w-4" /> Add line
                  </button>
                  {!balanced && totals.debit + totals.credit > 0 && (
                    <button
                      type="button"
                      onClick={balanceLast}
                      className="rounded-lg px-2 py-1 text-sm text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700"
                    >
                      Balance with last line
                    </button>
                  )}
                </div>
              </td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmtCurrency(totals.debit)}</td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmtCurrency(totals.credit)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
        {balanced ? (
          <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
            <FiCheckCircle /> Balanced
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
            <FiAlertTriangle />
            {totals.debit + totals.credit === 0
              ? "Enter amounts"
              : `Out of balance by ${fmtCurrency(Math.abs(totals.difference))}`}
          </span>
        )}
        {needsApproval && (
          <span className="text-neutral-500 dark:text-neutral-400">
            Over the {fmtCurrency(state.org.approval_threshold)} threshold: a second person must approve before it posts.
          </span>
        )}
      </div>
    </Modal>
  );
};

export default JournalFormModal;
