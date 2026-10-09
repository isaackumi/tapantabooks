"use client";

import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { FiAlertTriangle, FiArchive, FiCalendar, FiPlus, FiRotateCcw, FiXCircle } from "react-icons/fi";
import { Button, Callout } from "@/components/ui";
import { BTN_PRIMARY, BTN_SECONDARY, Modal } from "@/components/modal";
import ReasonModal from "./reasonModal";
import { useJournalViewer } from "./journalViewer";
import { useLedger } from "@/store/ledgerStore";
import { fiscalYearFor, fiscalYearsView, NEXT_YEAR_LEAD_DAYS, yearEndPreview, type FiscalYearView } from "@/lib/fiscalYears";
import { classNames, fmtAccounting, fmtCurrency, fmtDate, fmtDateTime } from "@/utils/format";
import { addDays, todayIso } from "@/utils/dates";

const FiscalYearsPanel = () => {
  const { state, actions } = useLedger();
  const { openJournal } = useJournalViewer();
  const [closing, setClosing] = useState<string | null>(null);
  const [reopening, setReopening] = useState<FiscalYearView | null>(null);
  const [busy, setBusy] = useState(false);
  const today = todayIso();

  const years = useMemo(() => fiscalYearsView(state), [state]);
  const last = years[years.length - 1];
  const next = last ? fiscalYearFor(state.org, addDays(last.end_date, 1)) : null;
  const nextOpensFrom = next ? addDays(next.start_date, -NEXT_YEAR_LEAD_DAYS) : null;
  const lastClosedIndex = years.map((y) => y.status).lastIndexOf("CLOSED");

  const addYear = async () => {
    setBusy(true);
    try {
      const res = await actions.addFiscalYear();
      if (res.ok) toast.success(res.message ?? "Year opened");
      else toast.error(res.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mb-6" data-tour="fiscal-years">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Financial years</h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Closing a year moves its profit or loss into retained earnings and closes every month in it.
          </p>
        </div>
        {next && nextOpensFrom && (
          <Button
            variant="secondary"
            icon={FiPlus}
            disabled={busy || today < nextOpensFrom}
            title={today < nextOpensFrom ? `${next.name} can be opened from ${fmtDate(nextOpensFrom)}` : undefined}
            onClick={addYear}
          >
            Open {next.name}
          </Button>
        )}
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {years.map((y, i) => {
          const current = today >= y.start_date && today <= y.end_date;
          const ended = y.end_date < today;
          return (
            <div
              key={y.id}
              className={classNames(
                "rounded-xl border bg-white p-5 dark:bg-neutral-800",
                current ? "border-brand-300 dark:border-brand-700" : "border-neutral-200 dark:border-neutral-700",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 font-semibold">
                    <FiCalendar className="text-neutral-400" /> {y.name}
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    {fmtDate(y.start_date)} – {fmtDate(y.end_date)}
                  </p>
                </div>
                <span
                  className={classNames(
                    "rounded-full px-2.5 py-0.5 text-xs font-medium",
                    y.status === "CLOSED"
                      ? "bg-neutral-100 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200"
                      : current
                        ? "bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300"
                        : ended
                          ? "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
                          : "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300",
                  )}
                >
                  {y.status === "CLOSED" ? "Closed" : current ? "Current year" : ended ? "Ready to close" : "Upcoming"}
                </span>
              </div>
              <dl className="mt-4 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-neutral-500 dark:text-neutral-400">{y.status === "CLOSED" || ended ? "Net profit" : "Net profit to date"}</dt>
                  <dd className={classNames("tabular-nums font-medium", y.net_income < 0 && "text-red-600 dark:text-red-400")}>{fmtCurrency(y.net_income)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-neutral-500 dark:text-neutral-400">Months</dt>
                  <dd className="text-xs">
                    {y.periods.open} open · {y.periods.locked} locked · {y.periods.closed} closed
                  </dd>
                </div>
                {y.closing_journal_id && (
                  <div className="flex justify-between">
                    <dt className="text-neutral-500 dark:text-neutral-400">Closing entry</dt>
                    <dd>
                      <button onClick={() => openJournal(y.closing_journal_id!)} className="font-mono text-xs text-brand-700 hover:underline dark:text-brand-300">
                        {y.closing_journal_number}
                      </button>
                      <span className="ml-1 text-xs text-neutral-500">{fmtDateTime(y.closed_at)}</span>
                    </dd>
                  </div>
                )}
              </dl>
              <div className="mt-4 flex justify-end gap-2">
                {y.status === "OPEN" && (
                  <Button size="sm" variant={ended ? "primary" : "secondary"} icon={FiArchive} onClick={() => setClosing(y.id)}>
                    {ended ? "Close year" : "Preview close"}
                  </Button>
                )}
                {y.status === "CLOSED" && i === lastClosedIndex && (
                  <Button size="sm" variant="ghost" icon={FiRotateCcw} onClick={() => setReopening(y)}>
                    Reopen year
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <CloseYearModal fiscalYearId={closing} onClose={() => setClosing(null)} />
      <ReasonModal
        open={!!reopening}
        onClose={() => setReopening(null)}
        danger
        title={reopening ? `Reopen ${reopening.name}` : ""}
        description="Reverses the closing entry on the last day of the year and locks its months again, so profit returns to current earnings until you close the year again."
        confirmLabel="Reopen year"
        placeholder="e.g. Auditor's adjustments to inventory"
        onConfirm={(reason) => actions.reopenFiscalYear(reopening!.id, reason)}
      />
    </section>
  );
};

const CloseYearModal = ({ fiscalYearId, onClose }: { fiscalYearId: string | null; onClose: () => void }) => {
  const { state, actions } = useLedger();
  const [busy, setBusy] = useState(false);
  const preview = useMemo(() => (fiscalYearId ? yearEndPreview(state, fiscalYearId) : null), [state, fiscalYearId]);
  const accounts = new Map(state.accounts.map((a) => [a.id, a]));
  const totals = preview?.lines.reduce((t, l) => ({ debit: t.debit + l.debit, credit: t.credit + l.credit }), { debit: 0, credit: 0 });

  const submit = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const res = await actions.closeFiscalYear(preview.fiscal_year.id);
      if (res.ok) {
        toast.success(res.message ?? "Year closed");
        onClose();
      } else toast.error(res.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!preview}
      onClose={onClose}
      size="3xl"
      title={preview ? `Close ${preview.fiscal_year.name}` : ""}
      description={
        preview
          ? `Posts the closing entry on ${fmtDate(preview.fiscal_year.end_date)}, closes all twelve months and opens the next year if needed. The income statement still reports the year's profit.`
          : ""
      }
      buttons={[
        { label: "Cancel", onClick: onClose, className: BTN_SECONDARY },
        { label: busy ? "Closing…" : "Close year", onClick: submit, className: BTN_PRIMARY, disabled: busy || !preview || preview.blockers.length > 0 },
      ]}
    >
      {preview && (
        <div className="space-y-4">
          {preview.blockers.length > 0 && (
            <Callout tone="danger" icon={FiXCircle} title="This year cannot be closed yet">
              <ul className="list-disc space-y-1 pl-4">
                {preview.blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </Callout>
          )}
          {preview.warnings.length > 0 && (
            <Callout tone="warning" icon={FiAlertTriangle} title="Worth checking first">
              <ul className="list-disc space-y-1 pl-4">
                {preview.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </Callout>
          )}
          <div className="rounded-xl bg-neutral-50 p-4 text-sm dark:bg-neutral-900/40">
            <span className="text-neutral-500 dark:text-neutral-400">{preview.net_income >= 0 ? "Profit" : "Loss"} moved to retained earnings: </span>
            <span className="font-semibold tabular-nums">{fmtCurrency(Math.abs(preview.net_income))}</span>
            {preview.fiscal_year.end_date >= todayIso() && <span className="ml-1 text-xs text-neutral-500">(so far; the figure is final once the year ends)</span>}
          </div>
          {preview.lines.length === 0 ? (
            <p className="text-sm text-neutral-500">No income or expense balances in this year, so no closing entry is needed.</p>
          ) : (
            <div className="max-h-80 overflow-auto rounded-xl border border-neutral-200 dark:border-neutral-700">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-neutral-50 text-left text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400">
                  <tr>
                    <th className="px-4 py-2 font-normal">Account</th>
                    <th className="px-4 py-2 text-right font-normal">Debit</th>
                    <th className="px-4 py-2 text-right font-normal">Credit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700">
                  {preview.lines.map((l) => {
                    const a = accounts.get(l.account_id);
                    const re = l.account_id === preview.retained_earnings_account_id;
                    return (
                      <tr key={l.account_id} className={re ? "bg-brand-50/50 font-medium dark:bg-brand-900/10" : ""}>
                        <td className="px-4 py-1.5">
                          <span className="mr-2 font-mono text-xs text-neutral-400">{a?.code}</span>
                          {a?.name}
                        </td>
                        <td className="px-4 py-1.5 text-right tabular-nums">{fmtAccounting(l.debit)}</td>
                        <td className="px-4 py-1.5 text-right tabular-nums">{fmtAccounting(l.credit)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t-2 border-neutral-300 font-semibold dark:border-neutral-600">
                  <tr>
                    <td className="px-4 py-2">Total</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmtAccounting(totals!.debit)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{fmtAccounting(totals!.credit)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};

export default FiscalYearsPanel;
