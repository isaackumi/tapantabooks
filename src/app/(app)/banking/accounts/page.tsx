"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { FiArrowDownLeft, FiArrowUpRight, FiCreditCard, FiEdit2, FiPlus, FiRepeat } from "react-icons/fi";
import { Button, Field, FormError, PageHeader, Panel, inputClass } from "@/components/ui";
import StatCard from "@/components/statCard";
import SourceBadge from "@/components/sourceBadge";
import { BTN_PRIMARY, BTN_SECONDARY, Modal } from "@/components/modal";
import { QueryError, QueryState, Skeleton } from "@/components/queryState";
import { useJournalViewer } from "@/components/accounting/journalViewer";
import BankAccountModal from "@/components/banking/bankAccountModal";
import { useLedger } from "@/store/ledgerStore";
import { useReport } from "@/services/useApiQuery";
import type { ListData } from "@/core/apiClient";
import type { BankAccountBalances, BankActivityItem } from "@/models/banking";
import type { BankAccount } from "@/models/accounting";
import { FxRateField, useFxRate } from "@/components/fxRateField";
import { isForeign, toBase } from "@/lib/fx";
import { BASE_CURRENCY, fmtCurrency, fmtDate, fmtMoney, fmtRelative, round2 } from "@/utils/format";
import { todayIso } from "@/utils/dates";

const useBankBalances = () => useReport<BankAccountBalances>("/bank-accounts/balances", {});

const TransferModal = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const { state, actions } = useLedger();
  const active = state.bankAccounts.filter((b) => b.is_active);
  const blank = () => ({ from: active[0]?.id ?? "", to: active[1]?.id ?? "", amount: "", date: todayIso(), memo: "" });
  const [form, setForm] = useState(blank);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const balanceQuery = useBankBalances();
  const balanceHint = (id: string, currency: string | undefined) => {
    const b = balanceQuery.data?.items.find((i) => i.bank_account_id === id);
    return b ? `Balance ${fmtMoney(b.ledger_balance, currency)}` : undefined;
  };
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
      setForm(blank());
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        <Field label="From" required hint={balanceHint(form.from, from?.currency)}>
          <select value={form.from} onChange={(e) => setForm((f) => ({ ...f, from: e.target.value }))} className={inputClass}>
            {active.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="To" required hint={balanceHint(form.to, to?.currency)}>
          <select value={form.to} onChange={(e) => setForm((f) => ({ ...f, to: e.target.value }))} className={inputClass}>
            {active.map((b) => (
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
  const [editing, setEditing] = useState<BankAccount | null>(null);
  const [adding, setAdding] = useState(false);
  const accounts = [...state.bankAccounts].sort((a, b) => Number(b.is_active) - Number(a.is_active));
  const inactiveCount = accounts.filter((b) => !b.is_active).length;
  const balanceQuery = useBankBalances();
  const activityQuery = useReport<ListData<BankActivityItem>>("/bank-accounts/activity", { size: 14 });
  const summary = balanceQuery.data;
  const balanceOf = new Map(summary?.items.map((i) => [i.bank_account_id, i]));
  const bankName = new Map(state.bankAccounts.map((b) => [b.id, b.name]));
  const foreignBanks = state.bankAccounts.filter((b) => isForeign(b.currency));
  const pending = <span className="text-neutral-300 dark:text-neutral-600">—</span>;

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
            <Button variant="secondary" icon={FiPlus} onClick={() => setAdding(true)}>
              Add account
            </Button>
            <Button icon={FiRepeat} onClick={() => setTransferOpen(true)}>
              Transfer funds
            </Button>
          </>
        }
      />

      {balanceQuery.error && !summary && <QueryError message={balanceQuery.error} onRetry={balanceQuery.refetch} className="mb-6" />}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Total cash position"
          value={summary ? fmtCurrency(summary.total_base) : pending}
          sub={`${accounts.length - inactiveCount} active${inactiveCount ? ` · ${inactiveCount} inactive` : ""}${foreignBanks.length ? " · foreign at booked rates" : ""}`}
          info={
            foreignBanks.length
              ? "Foreign-currency accounts are counted at the GH₵ value they were booked at. Month-end revaluation restates them at the closing rate."
              : undefined
          }
        />
        <StatCard
          label="Unreconciled statement lines"
          value={summary ? summary.unmatched_lines : pending}
          tone="warning"
          sub="Across all bank feeds"
        />
        <StatCard
          label="Out of agreement"
          value={summary ? `${summary.out_of_agreement} of ${summary.items.length}` : pending}
          tone={summary?.out_of_agreement ? "warning" : "default"}
          sub="Accounts whose ledger differs from the latest statement"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {accounts.map((b) => {
          const bal = balanceOf.get(b.id);
          const open = bal?.unmatched_lines ?? 0;
          const diff = bal?.statement_difference ?? 0;
          const foreign = isForeign(b.currency);
          return (
            <div
              key={b.id}
              data-testid={`bank-card-${b.id}`}
              className={`flex flex-col rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-800 ${b.is_active ? "" : "opacity-60"}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300">
                  <FiCreditCard className="h-5 w-5" />
                </div>
                <span className="font-mono text-xs text-neutral-400">{b.account_number}</span>
              </div>
              <p className="mt-3 flex items-center gap-2 font-semibold">
                {b.name}
                {!b.is_active && (
                  <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300">
                    Inactive
                  </span>
                )}
                {foreign && (
                  <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                    {b.currency}
                  </span>
                )}
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">{b.bank}</p>
              <p className="mt-3 text-2xl font-bold tabular-nums">{bal ? fmtMoney(bal.ledger_balance, b.currency) : pending}</p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Ledger balance{foreign && bal && <> · {fmtCurrency(bal.ledger_balance_base)} booked</>}
              </p>
              <dl className="mt-4 space-y-1 border-t border-neutral-100 pt-3 text-xs dark:border-neutral-700">
                <div className="flex justify-between">
                  <dt className="text-neutral-500">Statement {fmtDate(b.statement_date)}</dt>
                  <dd className="whitespace-nowrap tabular-nums">{fmtMoney(b.statement_balance, b.currency)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-neutral-500">Difference</dt>
                  <dd className={`whitespace-nowrap tabular-nums ${diff ? "text-amber-600" : "text-emerald-600"}`}>
                    {!bal ? pending : diff ? fmtMoney(diff, b.currency) : "None"}
                  </dd>
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
                <button
                  type="button"
                  onClick={() => setEditing(b)}
                  aria-label={`Edit ${b.name}`}
                  className="flex items-center justify-center gap-1 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium hover:bg-neutral-50 dark:border-neutral-600 dark:hover:bg-neutral-700"
                >
                  <FiEdit2 className="h-3 w-3" /> Edit
                </button>
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
        <QueryState
          query={activityQuery}
          className="pb-2"
          skeleton={<Skeleton className="px-6" />}
          isEmpty={(d) => d.items.length === 0}
          empty={<p className="px-6 py-6 text-center text-sm text-neutral-500">Nothing posted to a bank, MoMo or cash account yet.</p>}
        >
          {(data) => (
            <table className="min-w-full text-sm">
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700">
                {data.items.map((a) => {
                  const net = a.amount_base;
                  return (
                    <tr key={a.journal_id} onClick={() => openJournal(a.journal_id)} className="cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-700/40">
                      <td className="w-12 py-3 pl-6">
                        <span
                          className={`flex h-8 w-8 items-center justify-center rounded-full ${
                            a.is_transfer
                              ? "bg-neutral-100 text-neutral-500 dark:bg-neutral-700"
                              : net > 0
                                ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30"
                                : "bg-red-50 text-red-600 dark:bg-red-900/30"
                          }`}
                        >
                          {a.is_transfer ? <FiRepeat /> : net > 0 ? <FiArrowDownLeft /> : <FiArrowUpRight />}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="max-w-lg truncate font-medium">{a.memo}</p>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">
                          {fmtDate(a.date)} · {a.is_transfer ? "Internal transfer" : bankName.get(a.bank_account_id)}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <SourceBadge type={a.source_type} />
                      </td>
                      <td className={`px-6 py-3 text-right font-medium tabular-nums ${!a.is_transfer && net > 0 ? "text-emerald-600 dark:text-emerald-400" : ""}`}>
                        {a.is_transfer ? "—" : `${net > 0 ? "+" : ""}${fmtCurrency(net)}`}
                        {!a.is_transfer && isForeign(a.currency) ? (
                          <p className="text-xs font-normal text-neutral-500">
                            {a.amount > 0 ? "+" : ""}
                            {fmtMoney(a.amount, a.currency)}
                          </p>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </QueryState>
      </Panel>

      <TransferModal open={transferOpen} onClose={() => setTransferOpen(false)} />
      <BankAccountModal open={adding} onClose={() => setAdding(false)} />
      <BankAccountModal open={!!editing} onClose={() => setEditing(null)} account={editing && state.bankAccounts.find((b) => b.id === editing.id)} />
    </div>
  );
}
