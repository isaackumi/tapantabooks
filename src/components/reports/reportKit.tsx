"use client";

import Link from "next/link";
import { FiDownload, FiPrinter } from "react-icons/fi";
import { Button, compactInputClass } from "@/components/ui";
import { useLedger } from "@/store/ledgerStore";
import { fiscalYearFor } from "@/lib/fiscalYears";
import { classNames, fmtAccounting } from "@/utils/format";
import { addDays, addMonths, endOfMonth, monthName, startOfMonth, startOfQuarter, todayIso } from "@/utils/dates";

/** Printable report sheet with the company heading. */
export const ReportSheet = ({
  title,
  period,
  children,
  footnote,
}: {
  title: string;
  period: string;
  children: React.ReactNode;
  footnote?: React.ReactNode;
}) => {
  const { state } = useLedger();
  return (
    <div className="mx-auto max-w-4xl rounded-xl border border-neutral-200 bg-white px-6 py-8 sm:px-10 dark:border-neutral-700 dark:bg-neutral-800 print:border-0 print:px-0">
      <div className="mb-8 text-center">
        <p className="text-sm font-medium uppercase tracking-wider text-brand-700 dark:text-brand-300">{state.org.legal_name}</p>
        <h2 className="mt-1 text-xl font-bold">{title}</h2>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{period}</p>
        <p className="text-xs text-neutral-400">Amounts in {state.org.base_currency}</p>
      </div>
      {children}
      {footnote && <div className="mt-8 border-t border-neutral-100 pt-4 text-xs text-neutral-500 dark:border-neutral-700">{footnote}</div>}
    </div>
  );
};

export interface StatementLineItem {
  label: string;
  amount: number;
  /** Comparative figure; rendered when the section has `compare`. */
  prior?: number;
  code?: string;
  href?: string;
}

const AMOUNT_COL = "w-32 text-right tabular-nums";

/** Column headings for statements with a comparative column. */
export const StatementHeading = ({ current, prior }: { current: string; prior?: string }) => (
  <div className="mb-2 flex justify-end gap-4 text-xs font-semibold text-neutral-500 dark:text-neutral-400">
    <span className={AMOUNT_COL}>{current}</span>
    {prior && <span className={AMOUNT_COL}>{prior}</span>}
  </div>
);

export const StatementSection = ({
  title,
  lines,
  totalLabel,
  total,
  priorTotal,
  compare,
  emptyText = "None",
}: {
  title: string;
  lines: StatementLineItem[];
  totalLabel?: string;
  total?: number;
  priorTotal?: number;
  compare?: boolean;
  emptyText?: string;
}) => (
  <div className="mb-6">
    <h3 className="mb-1 border-b border-neutral-200 pb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
      {title}
    </h3>
    {lines.length === 0 ? (
      <p className="py-1.5 text-sm text-neutral-400">{emptyText}</p>
    ) : (
      lines.map((l) => (
        <div key={l.label} className="flex items-center gap-4 py-1.5 text-sm">
          <span className="flex-1">
            {l.href ? (
              <Link href={l.href} className="hover:text-brand-700 dark:hover:text-brand-300">
                {l.code && <span className="mr-2 font-mono text-xs text-neutral-400">{l.code}</span>}
                {l.label}
              </Link>
            ) : (
              <>
                {l.code && <span className="mr-2 font-mono text-xs text-neutral-400">{l.code}</span>}
                {l.label}
              </>
            )}
          </span>
          <span className={AMOUNT_COL}>{fmtAccounting(l.amount)}</span>
          {compare && <span className={classNames(AMOUNT_COL, "text-neutral-500 dark:text-neutral-400")}>{fmtAccounting(l.prior ?? 0)}</span>}
        </div>
      ))
    )}
    {totalLabel !== undefined && total !== undefined && (
      <TotalRow label={totalLabel} amount={total} prior={compare ? priorTotal ?? 0 : undefined} />
    )}
  </div>
);

export const TotalRow = ({
  label,
  amount,
  prior,
  strong,
  className,
}: {
  label: string;
  amount: number;
  prior?: number;
  strong?: boolean;
  className?: string;
}) => (
  <div
    className={classNames(
      "flex items-center gap-4 border-t border-neutral-200 py-2 text-sm dark:border-neutral-700",
      strong ? "border-t-2 border-b-4 border-double border-neutral-800 text-base font-bold dark:border-neutral-300" : "font-semibold",
      className,
    )}
  >
    <span className="flex-1">{label}</span>
    <span className={AMOUNT_COL}>{fmtAccounting(amount)}</span>
    {prior !== undefined && <span className={classNames(AMOUNT_COL, "text-neutral-500 dark:text-neutral-400")}>{fmtAccounting(prior)}</span>}
  </div>
);

/** Merges current and prior statement lines by account so both columns line up. */
export const withPrior = (
  current: { account: { id: string; code: string; name: string }; amount: number }[],
  prior: { account: { id: string; code: string; name: string }; amount: number }[],
  href?: (id: string) => string,
): StatementLineItem[] => {
  const map = new Map<string, StatementLineItem>();
  for (const l of current) map.set(l.account.id, { label: l.account.name, code: l.account.code, amount: l.amount, prior: 0, href: href?.(l.account.id) });
  for (const l of prior) {
    const existing = map.get(l.account.id);
    if (existing) existing.prior = l.amount;
    else map.set(l.account.id, { label: l.account.name, code: l.account.code, amount: 0, prior: l.amount, href: href?.(l.account.id) });
  }
  return [...map.values()].sort((a, b) => (a.code ?? "").localeCompare(b.code ?? ""));
};

export interface ReportPreset {
  label: string;
  from?: string;
  to: string;
}

const dayMonth = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** Date presets derived from today and the organisation's financial year, for range and as-at reports. */
export const useReportPresets = (): { period: ReportPreset[]; asAt: ReportPreset[] } => {
  const { state } = useLedger();
  const today = todayIso();
  const fy = fiscalYearFor(state.org, today);
  const priorFy = fiscalYearFor(state.org, addDays(fy.start_date, -1));
  const lastMonth = addMonths(today.slice(0, 7), -1);
  const quarterStart = startOfQuarter(today);
  const lastQuarterEnd = addDays(quarterStart, -1);
  const fyLabel = fy.start_date.endsWith("-01-01") ? "Year to date" : `${fy.name} to date`;
  return {
    period: [
      { label: "This month", from: startOfMonth(today), to: today },
      { label: monthName(lastMonth).split(" ")[0], from: `${lastMonth}-01`, to: endOfMonth(lastMonth) },
      { label: "Quarter to date", from: quarterStart, to: today },
      { label: fyLabel, from: fy.start_date, to: today },
      { label: priorFy.name, from: priorFy.start_date, to: priorFy.end_date },
    ],
    asAt: [
      { label: "Today", to: today },
      { label: dayMonth(endOfMonth(lastMonth)), to: endOfMonth(lastMonth) },
      ...(lastQuarterEnd !== endOfMonth(lastMonth) ? [{ label: dayMonth(lastQuarterEnd), to: lastQuarterEnd }] : []),
      { label: `End ${priorFy.name}`, to: priorFy.end_date },
    ],
  };
};

/** Date controls and export/print actions shown above a report. */
export const ReportToolbar = ({
  from,
  to,
  onFrom,
  onTo,
  presets,
  onExport,
}: {
  from?: string;
  to: string;
  onFrom?: (v: string) => void;
  onTo: (v: string) => void;
  presets?: { label: string; from?: string; to: string }[];
  onExport?: () => void;
}) => (
  <div className="mb-6 flex flex-wrap items-end justify-between gap-3" data-no-print>
    <div className="flex flex-wrap items-end gap-3">
      {onFrom && (
        <label className="text-sm">
          <span className="mb-1 block text-neutral-500 dark:text-neutral-400">From</span>
          <input type="date" value={from} onChange={(e) => onFrom(e.target.value)} className={`${compactInputClass} w-40`} />
        </label>
      )}
      <label className="text-sm">
        <span className="mb-1 block text-neutral-500 dark:text-neutral-400">{onFrom ? "To" : "As at"}</span>
        <input type="date" value={to} onChange={(e) => onTo(e.target.value)} className={`${compactInputClass} w-40`} />
      </label>
      {presets && (
        <div className="flex flex-wrap gap-1 rounded-lg bg-neutral-100 p-1 dark:bg-neutral-700">
          {presets.map((p) => {
            const active = p.to === to && (p.from === undefined || p.from === from);
            return (
              <button
                key={p.label}
                onClick={() => {
                  if (p.from && onFrom) onFrom(p.from);
                  onTo(p.to);
                }}
                className={classNames(
                  "rounded-md px-2.5 py-1 text-xs font-medium",
                  active
                    ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-800 dark:text-white"
                    : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-300",
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
    <div className="flex gap-2">
      {onExport && (
        <Button variant="secondary" icon={FiDownload} onClick={onExport}>
          Export CSV
        </Button>
      )}
      <Button variant="secondary" icon={FiPrinter} onClick={() => window.print()}>
        Print
      </Button>
    </div>
  </div>
);
