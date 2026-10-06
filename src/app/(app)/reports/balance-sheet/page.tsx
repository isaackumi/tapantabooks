"use client";

import { useMemo, useState } from "react";
import { FiAlertTriangle, FiCheckCircle } from "react-icons/fi";
import { Callout, PageHeader, compactInputClass } from "@/components/ui";
import { ReportSheet, ReportToolbar, StatementHeading, StatementSection, TotalRow, withPrior } from "@/components/reports/reportKit";
import { useLedger } from "@/store/ledgerStore";
import { balanceSheet } from "@/lib/ledger";
import { downloadCsv } from "@/utils/csv";
import { fmtCurrency, fmtDate, round2 } from "@/utils/format";
import { endOfMonth, todayIso } from "@/utils/dates";

const ledgerHref = (id: string) => `/accounting/general-ledger?account=${id}`;
const sum = (ls: { amount: number }[]) => round2(ls.reduce((s, l) => s + l.amount, 0));
const short = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default function BalanceSheetPage() {
  const { state } = useLedger();
  const [asAt, setAsAt] = useState(todayIso());
  const [compareTo, setCompareTo] = useState(endOfMonth("2026-06"));

  const bs = useMemo(() => balanceSheet(state.accounts, state.journals, asAt), [state, asAt]);
  const prior = useMemo(
    () => (compareTo ? balanceSheet(state.accounts, state.journals, compareTo) : null),
    [state, compareTo],
  );
  const compare = !!prior;
  const p = prior ?? bs;
  const balanced = Math.abs(bs.difference) < 0.005;

  const exportCsv = () => {
    const rows: (string | number)[][] = [["Section", "Code", "Account", asAt, ...(prior ? [compareTo] : [])]];
    const add = (section: string, cur: typeof bs.currentAssets, pr: typeof bs.currentAssets) =>
      withPrior(cur, pr).forEach((l) => rows.push([section, l.code ?? "", l.label, l.amount, ...(prior ? [l.prior ?? 0] : [])]));
    add("Current assets", bs.currentAssets, p.currentAssets);
    add("Non-current assets", bs.fixedAssets, p.fixedAssets);
    add("Current liabilities", bs.currentLiabilities, p.currentLiabilities);
    add("Non-current liabilities", bs.longTermLiabilities, p.longTermLiabilities);
    add("Equity", bs.equity, p.equity);
    rows.push(["Equity", "", "Current year earnings", bs.currentEarnings, ...(prior ? [p.currentEarnings] : [])]);
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
      <ReportToolbar
        to={asAt}
        onTo={setAsAt}
        onExport={exportCsv}
        presets={[
          { label: "Today", to: todayIso() },
          { label: "30 Sep", to: endOfMonth("2026-09") },
          { label: "30 Jun", to: endOfMonth("2026-06") },
        ]}
      />
      <div className="mx-auto mb-4 flex max-w-4xl flex-wrap items-center justify-between gap-3" data-no-print>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-neutral-500 dark:text-neutral-400">Compare with</span>
          <select value={compareTo} onChange={(e) => setCompareTo(e.target.value)} className={`${compactInputClass} w-44`}>
            <option value="">No comparison</option>
            <option value={endOfMonth("2026-09")}>30 Sep 2026</option>
            <option value={endOfMonth("2026-06")}>30 Jun 2026</option>
            <option value={endOfMonth("2026-03")}>31 Mar 2026</option>
            <option value="2026-01-01">1 Jan 2026 (opening)</option>
          </select>
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
        <StatementHeading current={short(asAt)} prior={compare ? short(compareTo) : undefined} />
        <StatementSection
          title="Current assets"
          lines={withPrior(bs.currentAssets, p.currentAssets, ledgerHref)}
          totalLabel="Total current assets"
          total={sum(bs.currentAssets)}
          priorTotal={sum(p.currentAssets)}
          compare={compare}
        />
        <StatementSection
          title="Non-current assets"
          lines={withPrior(bs.fixedAssets, p.fixedAssets, ledgerHref)}
          totalLabel="Total non-current assets"
          total={sum(bs.fixedAssets)}
          priorTotal={sum(p.fixedAssets)}
          compare={compare}
        />
        <TotalRow label="Total assets" amount={bs.totalAssets} prior={compare ? p.totalAssets : undefined} strong className="mb-10" />

        <StatementSection
          title="Current liabilities"
          lines={withPrior(bs.currentLiabilities, p.currentLiabilities, ledgerHref)}
          totalLabel="Total current liabilities"
          total={sum(bs.currentLiabilities)}
          priorTotal={sum(p.currentLiabilities)}
          compare={compare}
        />
        <StatementSection
          title="Non-current liabilities"
          lines={withPrior(bs.longTermLiabilities, p.longTermLiabilities, ledgerHref)}
          totalLabel="Total non-current liabilities"
          total={sum(bs.longTermLiabilities)}
          priorTotal={sum(p.longTermLiabilities)}
          compare={compare}
        />
        <TotalRow label="Total liabilities" amount={bs.totalLiabilities} prior={compare ? p.totalLiabilities : undefined} className="mb-6" />

        <StatementSection
          title="Equity"
          lines={[
            ...withPrior(bs.equity, p.equity, ledgerHref),
            { label: "Current year earnings", amount: bs.currentEarnings, prior: p.currentEarnings, href: "/reports/income-statement" },
          ]}
          totalLabel="Total equity"
          total={bs.totalEquity}
          priorTotal={p.totalEquity}
          compare={compare}
        />
        <TotalRow
          label="Total liabilities and equity"
          amount={round2(bs.totalLiabilities + bs.totalEquity)}
          prior={compare ? round2(p.totalLiabilities + p.totalEquity) : undefined}
          strong
        />
      </ReportSheet>
    </div>
  );
}
