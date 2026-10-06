"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { FiAlertTriangle, FiCheckCircle, FiGlobe, FiInfo, FiRefreshCw } from "react-icons/fi";
import { Button, Callout, PageHeader, Panel } from "@/components/ui";
import StatCard from "@/components/statCard";
import StatusBadge from "@/components/statusBadge";
import { BTN_PRIMARY, BTN_SECONDARY, Modal } from "@/components/modal";
import { useJournalViewer } from "@/components/accounting/journalViewer";
import { revaluationPreview, useLedger } from "@/store/ledgerStore";
import { revaluationJournalLines } from "@/lib/fx";
import type { FxRevaluationLine } from "@/models/accounting";
import { addDays, todayIso } from "@/utils/dates";
import { classNames, fmtAccounting, fmtCurrency, fmtDate, fmtDateTime, fmtMoney, fmtRate } from "@/utils/format";

const KIND_LABEL: Record<FxRevaluationLine["kind"], string> = {
  RECEIVABLE: "Customer invoices (Accounts Receivable)",
  PAYABLE: "Supplier bills (Accounts Payable)",
  BANK: "Foreign-currency bank accounts",
};

const Difference = ({ value }: { value: number }) => (
  <span
    className={classNames(
      "font-medium tabular-nums",
      value > 0 ? "text-emerald-600 dark:text-emerald-400" : value < 0 ? "text-red-600 dark:text-red-400" : "text-neutral-400",
    )}
  >
    {value === 0 ? "—" : `${value > 0 ? "+" : "−"}${fmtCurrency(Math.abs(value))}`}
  </span>
);

const LinesTable = ({ lines }: { lines: FxRevaluationLine[] }) => (
  <div className="overflow-x-auto">
    <table className="min-w-full text-sm">
      <thead className="text-left text-neutral-500 dark:text-neutral-400">
        <tr>
          <th className="px-6 py-2 font-normal">Item</th>
          <th className="px-4 py-2 text-right font-normal">Open amount</th>
          <th className="px-4 py-2 text-right font-normal">Booked in GH₵</th>
          <th className="px-4 py-2 text-right font-normal">Closing rate</th>
          <th className="px-4 py-2 text-right font-normal">Revalued GH₵</th>
          <th className="px-6 py-2 text-right font-normal">Gain / (loss)</th>
        </tr>
      </thead>
      {(Object.keys(KIND_LABEL) as FxRevaluationLine["kind"][]).map((kind) => {
        const group = lines.filter((l) => l.kind === kind);
        if (group.length === 0) return null;
        const subtotal = group.reduce((t, l) => t + l.difference, 0);
        return (
          <tbody key={kind} className="divide-y divide-neutral-100 dark:divide-neutral-700">
            <tr className="bg-neutral-50/80 dark:bg-neutral-900/30">
              <td colSpan={5} className="px-6 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                {KIND_LABEL[kind]}
              </td>
              <td className="px-6 py-2 text-right text-xs">
                <Difference value={Math.round(subtotal * 100) / 100} />
              </td>
            </tr>
            {group.map((l, i) => (
              <tr key={`${kind}-${i}`} className={classNames(l.difference === 0 && "opacity-60")}>
                <td className="px-6 py-2.5">
                  <p className="font-medium">{l.label}</p>
                  <p className="text-xs text-neutral-500">{l.currency}</p>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmtMoney(l.amount_fc, l.currency)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmtCurrency(l.carrying_base)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmtRate(l.rate)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmtCurrency(l.revalued_base)}</td>
                <td className="px-6 py-2.5 text-right">
                  <Difference value={l.difference} />
                </td>
              </tr>
            ))}
          </tbody>
        );
      })}
    </table>
  </div>
);

export default function RevaluationPage() {
  const { state, actions } = useLedger();
  const { openJournal } = useJournalViewer();
  const router = useRouter();
  const today = todayIso();
  const ended = useMemo(() => state.periods.filter((p) => p.end_date < today).sort((a, b) => b.end_date.localeCompare(a.end_date)), [state.periods, today]);
  const revaluedIds = new Set(state.fxRevaluations.map((r) => r.period_id));
  const [periodId, setPeriodId] = useState(() => ended.find((p) => !revaluedIds.has(p.id))?.id ?? ended[0]?.id ?? "");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const period = state.periods.find((p) => p.id === periodId);
  const asAt = period?.end_date ?? today;
  const preview = useMemo(() => revaluationPreview(state, asAt), [state, asAt]);
  const done = state.fxRevaluations.find((r) => r.period_id === periodId);
  const changed = preview.lines.filter((l) => l.difference !== 0);
  const net = Math.round(preview.lines.reduce((t, l) => t + l.difference, 0) * 100) / 100;
  const journalLines = useMemo(
    () => (changed.length ? revaluationJournalLines(preview.lines, state.org.fx_unrealised_account_id) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [preview, state.org.fx_unrealised_account_id],
  );
  const accounts = new Map(state.accounts.map((a) => [a.id, a]));
  const shown = done ? done.net_difference : net;
  const blocked = period && period.status !== "OPEN";

  const exposure = (kind: FxRevaluationLine["kind"]) => preview.lines.filter((l) => l.kind === kind).reduce((t, l) => t + l.carrying_base, 0);

  const post = () => {
    const res = actions.runRevaluation(periodId);
    setConfirmOpen(false);
    if (res.ok) toast.success(res.message ?? "Posted", { duration: 6000 });
    else toast.error(res.error);
  };

  return (
    <div>
      <PageHeader
        title="Currency revaluation"
        description="Restates open foreign-currency balances at the month-end rate so the balance sheet shows what they are worth today. The entry reverses itself on the first day of the next month."
        actions={
          <Button variant="secondary" icon={FiGlobe} onClick={() => router.push("/settings?tab=currencies")}>
            Exchange rates
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" data-tour="stats">
        <StatCard label="Foreign receivables" value={fmtCurrency(exposure("RECEIVABLE"))} sub={`At booked rates, ${fmtDate(asAt)}`} />
        <StatCard label="Foreign payables" value={fmtCurrency(exposure("PAYABLE"))} sub={`At booked rates, ${fmtDate(asAt)}`} />
        <StatCard label="Foreign bank balances" value={fmtCurrency(exposure("BANK"))} sub={`At booked rates, ${fmtDate(asAt)}`} />
        <StatCard
          label={done ? "Posted result" : "Unrealised result"}
          value={`${shown >= 0 ? "+" : "−"}${fmtCurrency(Math.abs(shown))}`}
          tone={shown >= 0 ? "success" : "danger"}
          sub={done ? `Posted ${fmtDate(done.as_at)}` : "If posted now"}
          info="Gain if the cedi value of what you are owed and hold rose more than the cedi value of what you owe."
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-4">
        <div className="space-y-6">
          <Panel tour="reval-periods" title="Month end" bodyClassName="px-3 pb-3">
            <ul className="space-y-1">
              {ended.map((p) => {
                const r = state.fxRevaluations.find((x) => x.period_id === p.id);
                return (
                  <li key={p.id}>
                    <button
                      onClick={() => setPeriodId(p.id)}
                      className={classNames(
                        "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition",
                        periodId === p.id ? "bg-brand-50 font-semibold text-brand-800 dark:bg-brand-900/30 dark:text-brand-200" : "hover:bg-neutral-50 dark:hover:bg-neutral-700/40",
                      )}
                    >
                      <span>{p.name}</span>
                      {r ? (
                        <FiCheckCircle className="h-4 w-4 text-emerald-600" aria-label="Revalued" />
                      ) : p.status !== "OPEN" ? (
                        <StatusBadge status={p.status} />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </Panel>

          <Panel tour="reval-rates" title="Closing rates" subtitle={`GH₵ per unit on ${fmtDate(asAt)}`}>
            <dl className="space-y-2 text-sm">
              {Object.entries(done ? done.rates : preview.rates)
                .filter(([c]) => preview.lines.some((l) => l.currency === c) || preview.missing.includes(c))
                .map(([c, r]) => (
                  <div key={c} className="flex justify-between">
                    <dt className="font-medium">{c}</dt>
                    <dd className="tabular-nums">{fmtRate(r)}</dd>
                  </div>
                ))}
              {preview.missing.map((c) => (
                <div key={c} className="flex justify-between text-amber-700 dark:text-amber-400">
                  <dt className="font-medium">{c}</dt>
                  <dd>No rate</dd>
                </div>
              ))}
              {preview.lines.length === 0 && preview.missing.length === 0 && <p className="text-neutral-500">No foreign balances.</p>}
            </dl>
          </Panel>
        </div>

        <div className="space-y-6 xl:col-span-3">
          {done ? (
            <Callout tone="success" icon={FiCheckCircle} title={`${period?.name} has been revalued`}>
              Posted by {done.created_by} on {fmtDateTime(done.created_at)} as{" "}
              <button className="font-mono underline" onClick={() => openJournal(done.journal_id)}>
                {state.journals.find((j) => j.id === done.journal_id)?.number}
              </button>{" "}
              and reversed on {fmtDate(addDays(done.as_at, 1))} by{" "}
              <button className="font-mono underline" onClick={() => openJournal(done.reversal_journal_id)}>
                {state.journals.find((j) => j.id === done.reversal_journal_id)?.number}
              </button>
              .
            </Callout>
          ) : preview.missing.length ? (
            <Callout tone="warning" icon={FiAlertTriangle} title="Rates missing">
              There is no {preview.missing.join(", ")} rate on or before {fmtDate(asAt)}.{" "}
              <Link href="/settings?tab=currencies" className="font-medium underline">
                Record one
              </Link>{" "}
              to continue.
            </Callout>
          ) : blocked ? (
            <Callout tone="warning" icon={FiAlertTriangle} title={`${period?.name} is ${period?.status.toLowerCase()}`}>
              The revaluation posts on {fmtDate(asAt)}, which falls in a {period?.status.toLowerCase()} period. Reopen it from Fiscal
              periods or choose a later month end.
            </Callout>
          ) : (
            <Callout tone="info" icon={FiInfo}>
              Each document stays at the rate it was booked at. This entry moves the difference to{" "}
              <strong>{accounts.get(state.org.fx_unrealised_account_id)?.name}</strong> on {fmtDate(asAt)} and reverses it on{" "}
              {fmtDate(addDays(asAt, 1))}, so when the invoice or bill is paid the realised gain or loss is still measured against
              the booked rate.
            </Callout>
          )}

          <Panel
            tour="reval-preview"
            title={done ? "What was revalued" : "Preview"}
            subtitle={`${preview.lines.length} open foreign balance${preview.lines.length === 1 ? "" : "s"} at ${fmtDate(asAt)}`}
            actions={
              !done && (
                <Button icon={FiRefreshCw} data-tour="reval-post" disabled={!!blocked || preview.missing.length > 0 || changed.length === 0} onClick={() => setConfirmOpen(true)}>
                  Post revaluation
                </Button>
              )
            }
            bodyClassName="px-0 pb-2"
          >
            {(done ? done.lines : preview.lines).length === 0 ? (
              <p className="px-6 py-6 text-sm text-neutral-500">No open foreign-currency balances at this date.</p>
            ) : (
              <>
                <LinesTable lines={done ? done.lines : preview.lines} />
                <div className="mx-6 mt-2 flex justify-between border-t border-neutral-200 pt-3 text-sm font-semibold dark:border-neutral-700">
                  <span>Net unrealised {shown >= 0 ? "gain" : "loss"}</span>
                  <Difference value={shown} />
                </div>
              </>
            )}
          </Panel>

          {!done && journalLines.length > 0 && (
            <Panel tour="reval-journal" title="Journal to be posted" subtitle={`Dated ${fmtDate(asAt)} · reversed automatically on ${fmtDate(addDays(asAt, 1))}`} bodyClassName="px-0 pb-2">
              <table className="min-w-full text-sm">
                <thead className="text-left text-neutral-500 dark:text-neutral-400">
                  <tr>
                    <th className="px-6 py-2 font-normal">Account</th>
                    <th className="px-6 py-2 text-right font-normal">Debit</th>
                    <th className="px-6 py-2 text-right font-normal">Credit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700">
                  {journalLines.map((l, i) => {
                    const a = accounts.get(l.account_id);
                    return (
                      <tr key={i}>
                        <td className="px-6 py-2.5">
                          <span className="mr-2 font-mono text-xs text-neutral-500">{a?.code}</span>
                          {a?.name}
                          {l.description && <p className="text-xs text-neutral-500">{l.description}</p>}
                        </td>
                        <td className="px-6 py-2.5 text-right tabular-nums">{fmtAccounting(l.debit)}</td>
                        <td className="px-6 py-2.5 text-right tabular-nums">{fmtAccounting(l.credit)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Panel>
          )}

          <Panel tour="reval-history" title="History" subtitle="Every revaluation and its automatic reversal" bodyClassName="px-0 pb-2">
            {state.fxRevaluations.length === 0 ? (
              <p className="px-6 py-4 text-sm text-neutral-500">No revaluations posted yet.</p>
            ) : (
              <table className="min-w-full text-sm">
                <thead className="text-left text-neutral-500 dark:text-neutral-400">
                  <tr>
                    <th className="px-6 py-2 font-normal">Month end</th>
                    <th className="px-4 py-2 font-normal">Entry</th>
                    <th className="px-4 py-2 font-normal">Reversal</th>
                    <th className="px-4 py-2 text-right font-normal">Result</th>
                    <th className="px-6 py-2 font-normal">Posted by</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700">
                  {state.fxRevaluations.map((r) => (
                    <tr key={r.id}>
                      <td className="px-6 py-2.5">{state.periods.find((p) => p.id === r.period_id)?.name}</td>
                      <td className="px-4 py-2.5">
                        <button className="font-mono text-xs text-brand-700 hover:underline dark:text-brand-300" onClick={() => openJournal(r.journal_id)}>
                          {state.journals.find((j) => j.id === r.journal_id)?.number}
                        </button>
                      </td>
                      <td className="px-4 py-2.5">
                        <button className="font-mono text-xs text-brand-700 hover:underline dark:text-brand-300" onClick={() => openJournal(r.reversal_journal_id)}>
                          {state.journals.find((j) => j.id === r.reversal_journal_id)?.number}
                        </button>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Difference value={r.net_difference} />
                      </td>
                      <td className="px-6 py-2.5 text-xs text-neutral-500">
                        {r.created_by} · {fmtDateTime(r.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </div>
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        size="md"
        title={`Revalue ${period?.name}?`}
        description={`Posts a net unrealised ${net >= 0 ? "gain" : "loss"} of ${fmtCurrency(Math.abs(net))} on ${fmtDate(asAt)} across ${changed.length} balance(s), and an automatic reversal on ${fmtDate(addDays(asAt, 1))}.`}
        buttons={[
          { label: "Cancel", onClick: () => setConfirmOpen(false), className: BTN_SECONDARY },
          { label: "Post revaluation", onClick: post, className: BTN_PRIMARY },
        ]}
      />
    </div>
  );
}
