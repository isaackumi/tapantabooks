"use client";

import { useState } from "react";
import Link from "next/link";
import { FiEdit2, FiInfo, FiPlus } from "react-icons/fi";
import { Button, Callout, PageHeader, Panel } from "@/components/ui";
import TaxCodeModal from "@/components/tax/taxCodeModal";
import type { TaxCode } from "@/models/accounting";
import StatCard from "@/components/statCard";
import StatusBadge from "@/components/statusBadge";
import { useJournalViewer } from "@/components/accounting/journalViewer";
import { QueryState, Skeleton } from "@/components/queryState";
import { ReportToolbar, useReportPresets } from "@/components/reports/reportKit";
import { useLedger } from "@/store/ledgerStore";
import { useReport } from "@/services/useApiQuery";
import type { TaxAccountBalance, TaxReturnStatus, TaxSummaryMonth, TaxSummaryReport } from "@/models/reports";
import { fiscalYearFor } from "@/lib/fiscalYears";
import { downloadCsv } from "@/utils/csv";
import { fmtCurrency, fmtDate, humanize } from "@/utils/format";
import { addDays, endOfMonth, isIsoDate, monthName, todayIso } from "@/utils/dates";
import { useQueryParam } from "@/utils/useQueryParam";

const pct = (rate: number) => `${Math.round(rate * 1000) / 10}%`;

const STATUS_BADGE: Record<TaxReturnStatus, { status: string; label: string }> = {
  FILED: { status: "PAID", label: "Filed & paid" },
  IN_PROGRESS: { status: "DRAFT", label: "Month in progress" },
  DUE: { status: "OPEN", label: "Ready to file" },
  OVERDUE: { status: "OVERDUE", label: "Overdue" },
  NOTHING_DUE: { status: "NEUTRAL", label: "Nothing to pay" },
};

const sumBalances = (rows: TaxAccountBalance[]) => rows.reduce((t, r) => t + r.balance, 0);
const accountCodes = (rows: TaxAccountBalance[]) => (rows.length ? `Balance on ${rows.map((r) => r.code).join(", ")}` : "No tax account set up");

export default function TaxPage() {
  const { state } = useLedger();
  const { openJournal } = useJournalViewer();
  const presets = useReportPresets();
  const today = todayIso();
  const [from, setFrom] = useState(() => fiscalYearFor(state.org, today).start_date);
  const [to, setTo] = useState(today);
  useQueryParam("from", (v) => {
    if (isIsoDate(v)) setFrom(v);
  });
  useQueryParam("to", (v) => {
    if (isIsoDate(v)) setTo(v);
  });

  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<TaxCode | null>(null);
  const summary = useReport<TaxSummaryReport>("/reports/tax-summary", { from_date: from, to_date: to });
  const accounts = new Map(state.accounts.map((a) => [a.id, a]));

  /** Drill to the ledger when the figure comes from a single account. */
  const ledgerLink = (rows: TaxAccountBalance[], month: string, value: string) => {
    if (rows.length !== 1) return value;
    const monthFrom = `${month}-01`;
    const monthTo = endOfMonth(month) < to ? endOfMonth(month) : to;
    return (
      <Link
        href={`/accounting/general-ledger?account=${rows[0].account_id}&from=${monthFrom > from ? monthFrom : from}&to=${monthTo}`}
        className="hover:text-brand-700 hover:underline dark:hover:text-brand-300"
      >
        {value}
      </Link>
    );
  };

  const exportCsv = () => {
    const s = summary.data;
    if (!s) return;
    downloadCsv(`tax-summary-${from}-to-${to}.csv`, [
      ["Month", "Output tax", "Input tax", "Net payable", "WHT deducted", "Due", "Status", "Filing journal"],
      ...s.months.map((m) => [m.month, m.output_tax, m.input_tax, m.net_payable, m.withholding_tax, m.due_date, m.status, m.filing?.number ?? ""]),
      ["Total", s.totals.output_tax, s.totals.input_tax, s.totals.net_payable, s.totals.withholding_tax, "", "", ""],
    ]);
  };

  const returnCell = (m: TaxSummaryMonth) =>
    m.filing ? (
      <button onClick={() => openJournal(m.filing!.journal_id)} className="flex items-center gap-2" title={`Paid ${fmtCurrency(m.filing.amount)} on ${fmtDate(m.filing.date)}`}>
        <StatusBadge {...STATUS_BADGE.FILED} />
        <span className="font-mono text-xs text-brand-700 dark:text-brand-300">{m.filing.number}</span>
      </button>
    ) : (
      <StatusBadge {...STATUS_BADGE[m.status]} />
    );

  return (
    <div>
      <PageHeader
        title="Tax"
        description="VAT, levies and withholding tax from posted transactions. Each month's return is settled with the tax authority by the due date shown."
      />
      <ReportToolbar from={from} to={to} onFrom={setFrom} onTo={setTo} presets={presets.period} onExport={summary.data ? exportCsv : undefined} />

      <QueryState
        query={summary}
        skeleton={
          <div className="space-y-6">
            <Skeleton rows={2} />
            <Skeleton rows={8} />
          </div>
        }
      >
        {(s) => {
          const next = s.next_return;
          return (
            <>
              <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  label="VAT & levies payable"
                  value={fmtCurrency(sumBalances(s.accounts.output))}
                  sub={accountCodes(s.accounts.output)}
                  info={`Output tax charged on sales and not yet paid to the tax authority, as at ${fmtDate(s.to_date)}.`}
                />
                <StatCard label="Input VAT recoverable" value={fmtCurrency(sumBalances(s.accounts.input))} sub={accountCodes(s.accounts.input)} />
                <StatCard
                  label="Next return"
                  value={next ? fmtCurrency(next.net_payable) : "—"}
                  tone={next ? (next.status === "OVERDUE" ? "danger" : "warning") : "default"}
                  sub={next ? `${monthName(next.month)} · due ${fmtDate(next.due_date)}` : "Nothing due"}
                />
                <StatCard label="Withholding tax held" value={fmtCurrency(sumBalances(s.accounts.withholding))} sub={accountCodes(s.accounts.withholding)} />
              </div>

              {next && next.due_date <= addDays(today, 14) && (
                <Callout
                  tone={next.status === "OVERDUE" ? "danger" : "warning"}
                  icon={FiInfo}
                  title={next.status === "OVERDUE" ? `Return overdue since ${fmtDate(next.due_date)}` : `Return due ${fmtDate(next.due_date)}`}
                  className="mb-6"
                >
                  Net VAT and levies of {fmtCurrency(next.net_payable)} for {monthName(next.month)}. Review the output and input figures below before filing.
                </Callout>
              )}

              <Panel
                title="VAT & levies by month"
                subtitle={`${fmtDate(s.from_date)} to ${fmtDate(s.to_date)} · returns due on day ${s.return_due_day} of the following month`}
                bodyClassName="p-0 pt-2"
              >
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm [&_td]:whitespace-nowrap">
                    <thead className="text-left text-neutral-500 dark:text-neutral-400">
                      <tr className="border-b border-neutral-100 dark:border-neutral-700">
                        <th className="px-4 py-2.5 font-normal">Month</th>
                        <th className="px-4 py-2.5 text-right font-normal">Output tax</th>
                        <th className="px-4 py-2.5 text-right font-normal">Input tax</th>
                        <th className="px-4 py-2.5 text-right font-normal">Net payable</th>
                        <th className="px-4 py-2.5 text-right font-normal">WHT deducted</th>
                        <th className="px-4 py-2.5 font-normal">Due</th>
                        <th className="px-4 py-2.5 font-normal">Return</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700">
                      {s.months.map((m) => (
                        <tr key={m.month}>
                          <td className="px-4 py-3 font-medium whitespace-nowrap">{monthName(m.month)}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{ledgerLink(s.accounts.output, m.month, fmtCurrency(m.output_tax))}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{ledgerLink(s.accounts.input, m.month, fmtCurrency(m.input_tax))}</td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums">{fmtCurrency(m.net_payable)}</td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {m.withholding_tax ? ledgerLink(s.accounts.withholding, m.month, fmtCurrency(m.withholding_tax)) : "—"}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">{fmtDate(m.due_date)}</td>
                          <td className="px-4 py-3">{returnCell(m)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-neutral-200 font-semibold dark:border-neutral-600">
                        <td className="px-4 py-3">Total</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmtCurrency(s.totals.output_tax)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmtCurrency(s.totals.input_tax)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmtCurrency(s.totals.net_payable)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmtCurrency(s.totals.withholding_tax)}</td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Panel>
            </>
          );
        }}
      </QueryState>

      <Panel
        title="Tax codes"
        subtitle="Applied to invoice and bill lines; each posts to its own liability or recoverable account"
        className="mt-6"
        bodyClassName="p-0 pt-2"
        actions={
          <Button variant="secondary" icon={FiPlus} onClick={() => setAdding(true)}>
            Add tax code
          </Button>
        }
      >
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-neutral-500 dark:text-neutral-400">
              <tr className="border-b border-neutral-100 dark:border-neutral-700">
                <th className="px-6 py-2.5 font-normal">Code</th>
                <th className="px-6 py-2.5 font-normal">Name</th>
                <th className="px-6 py-2.5 text-right font-normal">Rate</th>
                <th className="px-6 py-2.5 font-normal">Kind</th>
                <th className="px-6 py-2.5 font-normal">Sales post to</th>
                <th className="px-6 py-2.5 font-normal">Purchases post to</th>
                <th className="px-6 py-2.5 font-normal">Status</th>
                <th className="px-6 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700">
              {state.taxCodes.map((t) => (
                <tr key={t.id} className={t.is_active ? "" : "opacity-60"}>
                  <td className="px-6 py-3 font-mono text-xs font-medium">{t.code}</td>
                  <td className="px-6 py-3">
                    <p className="font-medium">{t.name}</p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">{t.description}</p>
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums">{pct(t.rate)}</td>
                  <td className="px-6 py-3">{humanize(t.kind)}</td>
                  {[t.output_account_id, t.input_account_id].map((id, i) => (
                    <td key={i} className="px-6 py-3">
                      {id ? (
                        <Link href={`/accounting/general-ledger?account=${id}`} className="hover:text-brand-700 dark:hover:text-brand-300">
                          <span className="font-mono text-xs text-neutral-400">{accounts.get(id)?.code}</span> {accounts.get(id)?.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                  ))}
                  <td className="px-6 py-3">
                    <StatusBadge status={t.is_active ? "ACTIVE" : "INACTIVE"} />
                  </td>
                  <td className="px-6 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setEditing(t)}
                      aria-label={`Edit ${t.code}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline dark:text-brand-300"
                    >
                      <FiEdit2 className="h-3 w-3" /> Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <TaxCodeModal open={adding} onClose={() => setAdding(false)} />
      <TaxCodeModal open={!!editing} onClose={() => setEditing(null)} taxCode={editing && state.taxCodes.find((t) => t.id === editing.id)} />
    </div>
  );
}
