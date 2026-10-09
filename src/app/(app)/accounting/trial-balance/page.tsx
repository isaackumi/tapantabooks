"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { FiCheckCircle, FiAlertTriangle, FiBookOpen } from "react-icons/fi";
import { Callout, PageHeader } from "@/components/ui";
import EmptyState from "@/components/emptyState";
import { QueryState } from "@/components/queryState";
import { ReportSheet, ReportToolbar, useReportPresets } from "@/components/reports/reportKit";
import { useReport } from "@/services/useApiQuery";
import { ACCOUNT_TYPE_LABEL, ACCOUNT_TYPE_ORDER, lineTotals } from "@/lib/ledger";
import type { TrialBalanceReport } from "@/models/reports";
import { downloadCsv } from "@/utils/csv";
import { fmtAccounting, fmtCurrency, fmtDate } from "@/utils/format";
import { todayIso } from "@/utils/dates";

export default function TrialBalancePage() {
  const [asAt, setAsAt] = useState(todayIso());
  const presets = useReportPresets();
  const query = useReport<TrialBalanceReport>("/reports/trial-balance", { as_at: asAt });
  const tb = query.data;

  const exportCsv = () =>
    tb &&
    downloadCsv(`trial-balance-${asAt}.csv`, [
      ["Code", "Account", "Type", "Debit", "Credit"],
      ...tb.rows.map((r) => [r.account.code, r.account.name, r.account.type, r.debit || "", r.credit || ""]),
      ["", "Total", "", tb.totals.debit, tb.totals.credit],
    ]);

  return (
    <div>
      <PageHeader
        title="Trial balance"
        description="Closing debit and credit balance of every account. If the ledger is sound, the two columns agree."
      />
      <ReportToolbar to={asAt} onTo={setAsAt} onExport={tb ? exportCsv : undefined} presets={presets.asAt} />

      <QueryState
        query={query}
        className="mx-auto max-w-4xl"
        isEmpty={(d) => d.rows.length === 0}
        empty={<EmptyState icon={FiBookOpen} title="No balances yet" description={`No posted journals on or before ${fmtDate(asAt)}.`} />}
      >
        {(data) => {
          const balanced = Math.abs(data.totals.difference) < 0.005;
          return (
            <>
              <div className="mb-4" data-no-print data-tour="tb-status">
                {balanced ? (
                  <Callout tone="success" icon={FiCheckCircle} title="In balance">
                    Debits and credits both total {fmtCurrency(data.totals.debit)} across {data.rows.length} accounts.
                  </Callout>
                ) : (
                  <Callout tone="danger" icon={FiAlertTriangle} title="Out of balance">
                    Difference of {fmtCurrency(Math.abs(data.totals.difference))}. Check recent imports and manual entries.
                  </Callout>
                )}
              </div>

              <ReportSheet title="Trial Balance" period={`As at ${fmtDate(asAt)}`}>
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-300 text-left text-neutral-500 dark:border-neutral-600 dark:text-neutral-400">
                      <th className="py-2 pr-4 font-medium w-20">Code</th>
                      <th className="py-2 pr-4 font-medium">Account</th>
                      <th className="py-2 pl-4 text-right font-medium w-36">Debit</th>
                      <th className="py-2 pl-4 text-right font-medium w-36">Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ACCOUNT_TYPE_ORDER.map((type) => {
                      const rows = data.rows.filter((r) => r.account.type === type);
                      if (rows.length === 0) return null;
                      const sub = lineTotals(rows);
                      return (
                        <Fragment key={type}>
                          <tr>
                            <td colSpan={4} className="pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                              {ACCOUNT_TYPE_LABEL[type]}
                            </td>
                          </tr>
                          {rows.map((r) => (
                            <tr key={r.account.id} className="hover:bg-neutral-50 dark:hover:bg-neutral-700/30">
                              <td className="py-1.5 pr-4 font-mono text-xs text-neutral-500">{r.account.code}</td>
                              <td className="py-1.5 pr-4">
                                <Link
                                  href={`/accounting/general-ledger?account=${r.account.id}&to=${asAt}`}
                                  className="hover:text-brand-700 dark:hover:text-brand-300"
                                >
                                  {r.account.name}
                                </Link>
                              </td>
                              <td className="py-1.5 pl-4 text-right tabular-nums">{fmtAccounting(r.debit)}</td>
                              <td className="py-1.5 pl-4 text-right tabular-nums">{fmtAccounting(r.credit)}</td>
                            </tr>
                          ))}
                          <tr className="text-neutral-500 dark:text-neutral-400">
                            <td />
                            <td className="py-1 pr-4 text-xs">Subtotal</td>
                            <td className="border-t border-neutral-100 py-1 pl-4 text-right text-xs tabular-nums dark:border-neutral-700">
                              {fmtAccounting(sub.debit)}
                            </td>
                            <td className="border-t border-neutral-100 py-1 pl-4 text-right text-xs tabular-nums dark:border-neutral-700">
                              {fmtAccounting(sub.credit)}
                            </td>
                          </tr>
                        </Fragment>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="text-base font-bold">
                      <td />
                      <td className="pt-4 pr-4">Total</td>
                      <td className="border-b-4 border-t-2 border-double border-neutral-800 pt-3 pb-1 pl-4 text-right tabular-nums dark:border-neutral-300">
                        {fmtAccounting(data.totals.debit)}
                      </td>
                      <td className="border-b-4 border-t-2 border-double border-neutral-800 pt-3 pb-1 pl-4 text-right tabular-nums dark:border-neutral-300">
                        {fmtAccounting(data.totals.credit)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </ReportSheet>
            </>
          );
        }}
      </QueryState>
    </div>
  );
}
