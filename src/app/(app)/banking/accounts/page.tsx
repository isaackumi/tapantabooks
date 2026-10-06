"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { FiArrowDownLeft, FiArrowUpRight, FiRepeat, FiCreditCard } from "react-icons/fi";
import { Button, Field, FormError, PageHeader, Panel, inputClass } from "@/components/ui";
import StatCard from "@/components/statCard";
import SourceBadge from "@/components/sourceBadge";
import { BTN_PRIMARY, BTN_SECONDARY, Modal } from "@/components/modal";
import { useJournalViewer } from "@/components/accounting/journalViewer";
import { useLedger } from "@/store/ledgerStore";
import { bankBaseBalances, bankLedgerBalances } from "@/store/selectors";
import { FxRateField, useFxRate } from "@/components/fxRateField";
import { isForeign, toBase } from "@/lib/fx";
import { affectsLedger, balancesByAccount } from "@/lib/ledger";
import { BASE_CURRENCY, fmtCurrency, fmtDate, fmtMoney, fmtRelative, round2 } from "@/utils/format";
import { todayIso } from "@/utils/dates";

const TransferModal = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const { state, actions } = useLedger();
  const [form, setForm] = useState({ from: "ba_gcb", to: "ba_eco", amount: "", date: todayIso(), memo: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const balances = bankLedgerBalances(state);
  const from = state.bankAccounts.find((b) => b.id === form.from);
  const to = state.bankAccounts.find((b) => b.id === form.to);
  const fc = [from?.currency, to?.currency].find(isForeign) ?? BASE_CURRENCY;
  const fx = useFxRate(fc, form.date, open);
  const amount = Number(form.amount) || 0;
  const arrives =
    from && to && amount > 0 && fx.rateValue > 0 && from.currency !== to.currency
      ? isForeign(from.currency)
        ? toBase(amount, fx.rateValue)
        : round2(amount / fx.rateValue)
      : null;

  useEffect(() => {
    if (open) {
      setForm({ from: "ba_gcb", to: "ba_eco", amount: "", date: todayIso(), memo: "" });
      setError(null);
    }
  }, [open]);

  const submit = async () => {
    setBusy(true);
    try {
      const res = await actions.transferFunds({ ...form, amount: Number(form.amount), rate: fx.rateValue });
      if (!res.ok) return setError(res.error);
      toast.success(res.message ?? "Transfer posted");
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Transfer between accounts"
      description="Moves money between your own bank, MoMo and cash accounts. Transfers do not count as income or expense."
      buttons={[
        { label: "Cancel", onClick: onClose, className: BTN_SECONDARY },
        { label: "Post transfer", onClick: submit, className: BTN_PRIMARY, disabled: busy },
      ]}
    >
      <FormError message={error} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="From" required hint={`Balance ${fmtMoney(balances.get(form.from) ?? 0, from?.currency)}`}>
          <select value={form.from} onChange={(e) => setForm((f) => ({ ...f, from: e.target.value }))} className={inputClass}>
            {state.bankAccounts.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="To" required hint={`Balance ${fmtMoney(balances.get(form.to) ?? 0, to?.currency)}`}>
          <select value={form.to} onChange={(e) => setForm((f) => ({ ...f, to: e.target.value }))} className={inputClass}>
            {state.bankAccounts.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label={`Amount${from && isForeign(from.currency) ? ` (${from.currency})` : ""}`}
          required
          hint={arrives !== null && to ? `Arrives as ${fmtMoney(arrives, to.currency)}` : undefined}
        >
          <input
            type="number"
            min={0}
            step="0.01"
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            className={inputClass}
          />
        </Field>
        <Field label="Date" required>
          <input
            type="date"
            value={form.date}
            max={todayIso()}
            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            className={inputClass}
          />
        </Field>
        {from && to && from.currency !== to.currency && <FxRateField currency={fc} fx={fx} label="Conversion rate" className="sm:col-span-2" />}
        <Field label="Memo" className="sm:col-span-2">
          <input
            value={form.memo}
            onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))}
            placeholder="e.g. Fund October payroll"
            className={inputClass}
          />
        </Field>
      </div>
    </Modal>
  );
};

export default function BankAccountsPage() {
  const { state } = useLedger();
  const { openJournal } = useJournalViewer();
  const router = useRouter();
  const [transferOpen, setTransferOpen] = useState(false);
  const balances = useMemo(() => bankLedgerBalances(state), [state]);
  const baseBalances = useMemo(() => bankBaseBalances(state), [state]);
  const glBalances = useMemo(() => balancesByAccount(state.accounts, state.journals), [state]);
  const total = round2([...baseBalances.values()].reduce((s, v) => s + v, 0));
  const foreignBanks = state.bankAccounts.filter((b) => isForeign(b.currency));
  const bankGl = new Set(state.bankAccounts.map((b) => b.gl_account_id));

  const recent = useMemo(
    () =>
      state.journals
        .filter((j) => affectsLedger(j) && j.lines.some((l) => bankGl.has(l.account_id)))
        .sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number))
        .slice(0, 14)
        .map((j) => {
          const bankLines = j.lines.filter((l) => bankGl.has(l.account_id));
          const net = round2(bankLines.reduce((s, l) => s + l.debit - l.credit, 0));
          const account = state.bankAccounts.find((b) => b.gl_account_id === bankLines[0].account_id);
          const transfer = bankLines.some((l) => l.debit > 0) && bankLines.some((l) => l.credit > 0);
          const fcNet =
            account && isForeign(account.currency) && !transfer
              ? round2(bankLines.reduce((s, l) => s + (l.debit > 0 ? 1 : -1) * (l.amount_fc ?? 0), 0))
              : null;
          return { journal: j, net, fcNet, account, transfer };
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state],
  );

  return (
    <div>
      <PageHeader
        title="Bank & cash"
        description="Ledger balances for every bank account, mobile money wallet and cash float, next to the latest statement."
        actions={
          <>
            <Button variant="secondary" icon={FiRepeat} onClick={() => router.push("/banking/reconciliation")}>
              Reconcile
            </Button>
            <Button icon={FiRepeat} onClick={() => setTransferOpen(true)}>
              Transfer funds
            </Button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Total cash position"
          value={fmtCurrency(total)}
          sub={`${state.bankAccounts.length} accounts${foreignBanks.length ? ` · foreign at booked rates` : ""}`}
          info={
            foreignBanks.length
              ? "Foreign-currency accounts are counted at the GH₵ value they were booked at. Month-end revaluation restates them at the closing rate."
              : undefined
          }
        />
        <StatCard
          label="Unreconciled statement lines"
          value={state.statementLines.filter((l) => l.status !== "MATCHED").length}
          tone="warning"
          sub="Across all bank feeds"
        />
        <StatCard
          label="Payroll account"
          value={fmtCurrency(glBalances.get("acc_1030") ?? 0)}
          sub="Ecobank, funds ZelosHR payroll"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {state.bankAccounts.map((b) => {
          const ledger = balances.get(b.id) ?? 0;
          const open = state.statementLines.filter((l) => l.bank_account_id === b.id && l.status !== "MATCHED").length;
          const diff = round2(b.statement_balance - ledger);
          const foreign = isForeign(b.currency);
          return (
            <div key={b.id} className="flex flex-col rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-800">
              <div className="flex items-start justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300">
                  <FiCreditCard className="h-5 w-5" />
                </div>
                <span className="font-mono text-xs text-neutral-400">{b.account_number}</span>
              </div>
              <p className="mt-3 flex items-center gap-2 font-semibold">
                {b.name}
                {foreign && (
                  <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                    {b.currency}
                  </span>
                )}
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">{b.bank}</p>
              <p className="mt-3 text-2xl font-bold tabular-nums">{fmtMoney(ledger, b.currency)}</p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Ledger balance{foreign && <> · {fmtCurrency(baseBalances.get(b.id) ?? 0)} booked</>}
              </p>
              <dl className="mt-4 space-y-1 border-t border-neutral-100 pt-3 text-xs dark:border-neutral-700">
                <div className="flex justify-between">
                  <dt className="text-neutral-500">Statement {fmtDate(b.statement_date)}</dt>
                  <dd className="tabular-nums">{fmtMoney(b.statement_balance, b.currency)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-neutral-500">Difference</dt>
                  <dd className={`tabular-nums ${diff ? "text-amber-600" : "text-emerald-600"}`}>{diff ? fmtMoney(diff, b.currency) : "None"}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-neutral-500">Last reconciled</dt>
                  <dd>{fmtRelative(b.last_reconciled_at)}</dd>
                </div>
              </dl>
              <div className="mt-4 flex gap-2">
                <Link
                  href={`/accounting/general-ledger?account=${b.gl_account_id}`}
                  className="flex-1 rounded-lg border border-neutral-200 py-1.5 text-center text-xs font-medium hover:bg-neutral-50 dark:border-neutral-600 dark:hover:bg-neutral-700"
                >
                  Ledger
                </Link>
                {open > 0 && (
                  <Link
                    href={`/banking/reconciliation?account=${b.id}`}
                    className="flex-1 rounded-lg bg-brand-600 py-1.5 text-center text-xs font-medium text-white hover:bg-brand-700"
                  >
                    Reconcile ({open})
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Panel title="Recent bank activity" subtitle="Latest posted entries touching bank, MoMo or cash" className="mt-6" bodyClassName="p-0 pt-2">
        <table className="min-w-full text-sm">
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700">
            {recent.map(({ journal: j, net, fcNet, account, transfer }) => (
              <tr key={j.id} onClick={() => openJournal(j.id)} className="cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-700/40">
                <td className="w-12 py-3 pl-6">
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-full ${
                      transfer
                        ? "bg-neutral-100 text-neutral-500 dark:bg-neutral-700"
                        : net > 0
                          ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30"
                          : "bg-red-50 text-red-600 dark:bg-red-900/30"
                    }`}
                  >
                    {transfer ? <FiRepeat /> : net > 0 ? <FiArrowDownLeft /> : <FiArrowUpRight />}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <p className="max-w-lg truncate font-medium">{j.memo}</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    {fmtDate(j.date)} · {transfer ? "Internal transfer" : account?.name}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <SourceBadge type={j.source.type} />
                </td>
                <td className={`px-6 py-3 text-right font-medium tabular-nums ${net > 0 ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
                  {transfer ? "—" : `${net > 0 ? "+" : ""}${fmtCurrency(net)}`}
                  {fcNet ? (
                    <p className="text-xs font-normal text-neutral-500">
                      {fcNet > 0 ? "+" : ""}
                      {fmtMoney(fcNet, account!.currency)}
                    </p>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <TransferModal open={transferOpen} onClose={() => setTransferOpen(false)} />
    </div>
  );
}
