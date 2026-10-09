"use client";

import { useState } from "react";
import { FiAlertTriangle, FiCheckCircle } from "react-icons/fi";
import { Callout, PageHeader, compactInputClass } from "@/components/ui";
import { QueryState, Skeleton } from "@/components/queryState";
import {
  ReportSheet,
  ReportToolbar,
  StatementHeading,
  StatementSection,
  TotalRow,
  useReportPresets,
  withPrior,
} from "@/components/reports/reportKit";
import { useLedger } from "@/store/ledgerStore";
import { useReport } from "@/services/useApiQuery";
import { fiscalYearFor } from "@/lib/fiscalYears";
import type { BalanceSheetReport } from "@/models/reports";
import { downloadCsv } from "@/utils/csv";
import { fmtCurrency, fmtDate } from "@/utils/format";
import { addDays, todayIso } from "@/utils/dates";

const short = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default function BalanceSheetPage() {
  const { state } = useLedger();
  const presets = useReportPresets();
  const today = todayIso();
  const [asAt, setAsAt] = useState(today);
  const priorYearEnd = addDays(fiscalYearFor(state.org, today).start_date, -1);
  const [compareTo, setCompareTo] = useState(priorYearEnd);

  const current = useReport<BalanceSheetReport>("/reports/balance-sheet", { as_at: asAt });
  const prior = useReport<BalanceSheetReport>(compareTo ? "/reports/balance-sheet" : null, { as_at: compareTo });
  const priorHasBalances =
    !!prior.data &&
    [prior.data.current_assets, prior.data.fixed_assets, prior.data.current_liabilities, prior.data.long_term_liabilities, prior.data.equity].some(
      (s) => s.length > 0,
    );
  const compare = !!compareTo && priorHasBalances;
  const ledgerHref = (id: string) => `/accounting/general-ledger?account=${id}&to=${asAt}`;
  const earningsFrom = fiscalYearFor(state.org, asAt).start_date;

  const compareOptions = [...new Set([...presets.asAt.filter((p) => p.to !== today).map((p) => p.to), compareTo].filter(Boolean))].sort().reverse();

  const exportCsv = () => {
    const bs = current.data;
    if (!bs) return;
    const p = compare ? prior.data! : null;
    const rows: (string | number)[][] = [["Section", "Code", "Account", asAt, ...(p ? [compareTo] : [])]];
    const add = (section: string, cur: BalanceSheetReport["equity"], pr: BalanceSheetReport["equity"]) =>
      withPrior(cur, pr).forEach((l) => rows.push([section, l.code ?? "", l.label, l.amount, ...(p ? [l.prior ?? 0] : [])]));
    add("Current assets", bs.current_assets, p?.current_assets ?? []);
    add("Non-current assets", bs.fixed_assets, p?.fixed_assets ?? []);
    add("Current liabilities", bs.current_liabilities, p?.current_liabilities ?? []);
    add("Non-current liabilities", bs.long_term_liabilities, p?.long_term_liabilities ?? []);
    add("Equity", bs.equity, p?.equity ?? []);
    rows.push(["Equity", "", "Current year earnings", bs.current_earnings, ...(p ? [p.current_earnings] : [])]);
    downloadCsv(`balance-sheet-${asAt}.csv`, rows);
  };

  return (
    <div>
      <PageHeader
        title="Balance sheet"
        description="What the business owns and owes at a point in time. Built directly from the posted ledger."
        backHref="/reports"
        backLabel="Reports"
      />
      <ReportToolbar to={asAt} onTo={setAsAt} onExport={current.data ? exportCsv : undefined} presets={presets.asAt} />

      <QueryState query={current} className="mx-auto max-w-4xl" skeleton={<Skeleton rows={14} />}>
        {(bs) => {
          const p = compare ? prior.data! : null;
          const balanced = Math.abs(bs.difference) < 0.005;
          return (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3" data-no-print>
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-neutral-500 dark:text-neutral-400">Compare with</span>
                  <select value={compareTo} onChange={(e) => setCompareTo(e.target.value)} className={`${compactInputClass} w-48`}>
                    <option value="">No comparison</option>
                    {compareOptions.map((d) => (
                      <option key={d} value={d}>
                        {short(d)}
                        {d === priorYearEnd ? " (prior year end)" : ""}
                      </option>
                    ))}
                  </select>
                  {compareTo && prior.data && !priorHasBalances && (
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">No balances on {short(compareTo)}</span>
                  )}
                </label>
                {balanced ? (
                  <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
                    <FiCheckCircle /> Assets equal liabilities plus equity
                  </span>
                ) : (
                  <Callout tone="danger" icon={FiAlertTriangle}>
                    Out of balance by {fmtCurrency(bs.difference)}
                  </Callout>
                )}
              </div>

              <ReportSheet title="Statement of Financial Position" period={`As at ${fmtDate(asAt)}`}>
                <StatementHeading current={short(asAt)} prior={p ? short(compareTo) : undefined} />
                <StatementSection
                  title="Current assets"
                  lines={withPrior(bs.current_assets, p?.current_assets ?? [], ledgerHref)}
                  totalLabel="Total current assets"
                  total={bs.total_current_assets}
                  priorTotal={p?.total_current_assets}
                  compare={!!p}
                />
                <StatementSection
                  title="Non-current assets"
                  lines={withPrior(bs.fixed_assets, p?.fixed_assets ?? [], ledgerHref)}
                  totalLabel="Total non-current assets"
                  total={bs.total_fixed_assets}
                  priorTotal={p?.total_fixed_assets}
                  compare={!!p}
                />
                <TotalRow label="Total assets" amount={bs.total_assets} prior={p?.total_assets} strong className="mb-10" />

                <StatementSection
                  title="Current liabilities"
                  lines={withPrior(bs.current_liabilities, p?.current_liabilities ?? [], ledgerHref)}
                  totalLabel="Total current liabilities"
                  total={bs.total_current_liabilities}
                  priorTotal={p?.total_current_liabilities}
                  compare={!!p}
                />
                <StatementSection
                  title="Non-current liabilities"
                  lines={withPrior(bs.long_term_liabilities, p?.long_term_liabilities ?? [], ledgerHref)}
                  totalLabel="Total non-current liabilities"
                  total={bs.total_long_term_liabilities}
                  priorTotal={p?.total_long_term_liabilities}
                  compare={!!p}
                />
                <TotalRow label="Total liabilities" amount={bs.total_liabilities} prior={p?.total_liabilities} className="mb-6" />

                <StatementSection
                  title="Equity"
                  lines={[
                    ...withPrior(bs.equity, p?.equity ?? [], ledgerHref),
                    {
                      label: "Current year earnings",
                      amount: bs.current_earnings,
                      prior: p?.current_earnings,
                      href: `/reports/income-statement?from=${earningsFrom}&to=${asAt}`,
                    },
                  ]}
                  totalLabel="Total equity"
                  total={bs.total_equity}
                  priorTotal={p?.total_equity}
                  compare={!!p}
                />
                <TotalRow label="Total liabilities and equity" amount={bs.total_liabilities_and_equity} prior={p?.total_liabilities_and_equity} strong />
              </ReportSheet>
            </>
          );
        }}
      </QueryState>
    </div>
  );
}
