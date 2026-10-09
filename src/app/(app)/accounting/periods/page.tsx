"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { FiLock, FiUnlock, FiArchive, FiInfo } from "react-icons/fi";
import { Callout, PageHeader, Toggle, compactInputClass } from "@/components/ui";
import FiscalYearsPanel from "@/components/accounting/fiscalYearsPanel";
import { fiscalYearFor, type FiscalYearView } from "@/lib/fiscalYears";
import StatusBadge from "@/components/statusBadge";
import StatCard from "@/components/statCard";
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, Modal } from "@/components/modal";
import { useLedger } from "@/store/ledgerStore";
import { useReport } from "@/services/useApiQuery";
import type { ListData } from "@/core/apiClient";
import type { FiscalPeriod, PeriodStatus } from "@/models/accounting";
import type { PeriodStatistics } from "@/models/reports";
import { fmtCurrency, fmtDate, fmtDateTime } from "@/utils/format";
import { todayIso } from "@/utils/dates";

const VERB: Record<PeriodStatus, { label: string; description: string }> = {
  OPEN: { label: "Reopen", description: "Posting will be allowed again. Reports already issued for this period may change." },
  LOCKED: {
    label: "Lock",
    description: "Stops new postings while you review. You can reopen a locked period if something was missed.",
  },
  CLOSED: {
    label: "Close",
    description: "Final close. Drafts and pending approvals must be cleared first. Periods close in order.",
  },
};

export default function PeriodsPage() {
  const { state, actions } = useLedger();
  const [pending, setPending] = useState<{ period: FiscalPeriod; to: PeriodStatus } | null>(null);
  const [busy, setBusy] = useState(false);
  const today = todayIso();

  const years = useReport<ListData<FiscalYearView>>("/fiscal-years/list", {}).data?.items ?? [];
  const currentYear = fiscalYearFor(state.org, today).id;
  const [yearId, setYearId] = useState(currentYear);
  const year = years.find((y) => y.id === yearId) ?? years[years.length - 1];
  const yearPeriods = year ? state.periods.filter((p) => p.start_date >= year.start_date && p.end_date <= year.end_date) : state.periods;

  const periodStats = useReport<ListData<PeriodStatistics>>("/fiscal-periods/statistics", {});
  const byPeriod = new Map((periodStats.data?.items ?? []).map((s) => [s.period_id, s]));
  const stats = yearPeriods.map((p) => {
    const s = byPeriod.get(p.id);
    return { period: p, posted: s ? s.posted_count : "—", volume: s?.posted_total ?? 0, open: s?.open_count ?? 0 };
  });

  const confirm = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      const res = await actions.setPeriodStatus(pending.period.id, pending.to);
      if (res.ok) {
        toast.success(res.message ?? "Updated");
        setPending(null);
      } else toast.error(res.error);
    } finally {
      setBusy(false);
    }
  };

  const count = (s: PeriodStatus) => yearPeriods.filter((p) => p.status === s).length;

  return (
    <div>
      <PageHeader
        title="Fiscal periods"
        description="Lock a month while you review it, close it when the numbers are final, and close the year once it has ended."
      />

      <FiscalYearsPanel />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3" data-tour="stats">
        <StatCard label="Open" value={count("OPEN")} sub="Accept postings" tone="success" />
        <StatCard label="Locked" value={count("LOCKED")} sub="Under review" tone="warning" />
        <StatCard label="Closed" value={count("CLOSED")} sub="Final" />
      </div>

      <div className="mb-6 rounded-xl border border-neutral-200 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-800" data-tour="period-locks">
        <Toggle
          checked={state.org.block_posting_to_locked_periods}
          onChange={async (v) => {
            const res = await actions.updateOrg({ block_posting_to_locked_periods: v });
            if (res.ok) toast.success(v ? "Locked and closed periods now reject postings" : "Period locks are now advisory");
          }}
          label="Enforce period locks"
          description="When on, nothing (manual entries, documents, integrations or imports) can post into a locked or closed month."
        />
      </div>

      {years.length > 1 && (
        <div className="mb-3 flex items-center gap-2 text-sm">
          <span className="text-neutral-500 dark:text-neutral-400">Months of</span>
          <select value={year?.id} onChange={(e) => setYearId(e.target.value)} className={`${compactInputClass} w-36`}>
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800" data-tour="periods-table">
        <table className="min-w-full text-sm">
          <thead className="bg-neutral-50/60 text-left text-neutral-500 dark:bg-neutral-800 dark:text-neutral-300">
            <tr>
              <th className="px-6 py-3 font-normal">Period</th>
              <th className="px-6 py-3 font-normal">Dates</th>
              <th className="px-6 py-3 font-normal text-right">Entries</th>
              <th className="px-6 py-3 font-normal text-right">Volume</th>
              <th className="px-6 py-3 font-normal">Status</th>
              <th className="px-6 py-3 font-normal">Changed by</th>
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
            {stats.map(({ period: p, posted, volume, open }) => {
              const current = today >= p.start_date && today <= p.end_date;
              const future = p.start_date > today;
              return (
                <tr key={p.id} className={current ? "bg-brand-50/50 dark:bg-brand-900/10" : ""}>
                  <td className="px-6 py-3 font-medium">
                    {p.name}
                    {current && (
                      <span className="ml-2 rounded bg-brand-100 px-1.5 py-0.5 text-[11px] font-medium text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
                        Current
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-neutral-600 dark:text-neutral-300">
                    {fmtDate(p.start_date)} – {fmtDate(p.end_date)}
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums">
                    {posted}
                    {open > 0 && <span className="ml-1 text-xs text-amber-600">+{open} open</span>}
                  </td>
                  <td className="whitespace-nowrap px-6 py-3 text-right tabular-nums">{volume ? fmtCurrency(volume) : "—"}</td>
                  <td className="px-6 py-3">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="px-6 py-3 text-xs text-neutral-500 dark:text-neutral-400">
                    {p.locked_by ? (
                      <>
                        {p.locked_by}
                        <br />
                        {fmtDateTime(p.locked_at)}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-6 py-3">
                    {!future && (
                      <div className="flex justify-end gap-1.5">
                        {p.status === "OPEN" && (
                          <button
                            onClick={() => setPending({ period: p, to: "LOCKED" })}
                            className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 px-2.5 py-1 text-xs font-medium hover:bg-neutral-50 dark:border-neutral-600 dark:hover:bg-neutral-700"
                          >
                            <FiLock className="h-3.5 w-3.5" /> Lock
                          </button>
                        )}
                        {p.status === "LOCKED" && (
                          <>
                            <button
                              onClick={() => setPending({ period: p, to: "OPEN" })}
                              className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 px-2.5 py-1 text-xs font-medium hover:bg-neutral-50 dark:border-neutral-600 dark:hover:bg-neutral-700"
                            >
                              <FiUnlock className="h-3.5 w-3.5" /> Reopen
                            </button>
                            <button
                              onClick={() => setPending({ period: p, to: "CLOSED" })}
                              className="inline-flex items-center gap-1 rounded-lg bg-neutral-800 px-2.5 py-1 text-xs font-medium text-white hover:bg-neutral-900 dark:bg-neutral-600"
                            >
                              <FiArchive className="h-3.5 w-3.5" /> Close
                            </button>
                          </>
                        )}
                        {p.status === "CLOSED" && (
                          <button
                            onClick={() => setPending({ period: p, to: "OPEN" })}
                            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-neutral-500 hover:bg-neutral-50 dark:hover:bg-neutral-700"
                          >
                            <FiUnlock className="h-3.5 w-3.5" /> Reopen
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Callout tone="info" icon={FiInfo} className="mt-6">
        Corrections to a closed month are posted in the current open period as reversing or adjusting entries, so the
        figures you already reported stay exactly as issued.
      </Callout>

      <Modal
        open={!!pending}
        onClose={() => setPending(null)}
        title={pending ? `${VERB[pending.to].label} ${pending.period.name}?` : ""}
        description={pending ? VERB[pending.to].description : ""}
        buttons={[
          { label: "Cancel", onClick: () => setPending(null), className: BTN_SECONDARY },
          {
            label: pending ? VERB[pending.to].label : "",
            onClick: confirm,
            className: pending?.to === "OPEN" ? BTN_DANGER : BTN_PRIMARY,
            disabled: busy,
          },
        ]}
      />
    </div>
  );
}
