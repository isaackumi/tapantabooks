"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { FiCheckCircle, FiAlertTriangle } from "react-icons/fi";
import { Callout, PageHeader } from "@/components/ui";
import { ReportSheet, ReportToolbar } from "@/components/reports/reportKit";
import { useLedger } from "@/store/ledgerStore";
import { ACCOUNT_TYPE_LABEL, ACCOUNT_TYPE_ORDER, lineTotals, trialBalance } from "@/lib/ledger";
import { downloadCsv } from "@/utils/csv";
import { fmtAccounting, fmtCurrency, fmtDate } from "@/utils/format";
import { endOfMonth, todayIso } from "@/utils/dates";

export default function TrialBalancePage() {
  const { state } = useLedger();
  const [asAt, setAsAt] = useState(todayIso());
  const tb = useMemo(() => trialBalance(state.accounts, state.journals, asAt), [state, asAt]);
  const balanced = Math.abs(tb.totals.difference) < 0.005;

  const exportCsv = () =>
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
      <ReportToolbar
        to={asAt}
        onTo={setAsAt}
        onExport={exportCsv}
        presets={[
          { label: "Today", to: todayIso() },
          { label: "30 Sep", to: endOfMonth("2026-09") },
          { label: "30 Jun", to: endOfMonth("2026-06") },
          { label: "31 Mar", to: endOfMonth("2026-03") },
        ]}
      />

      <div className="mx-auto mb-4 max-w-4xl" data-no-print>
        {balanced ? (
          <Callout tone="success" icon={FiCheckCircle} title="In balance">
            Debits and credits both total {fmtCurrency(tb.totals.debit)} across {tb.rows.length} accounts.
          </Callout>
        ) : (
          <Callout tone="danger" icon={FiAlertTriangle} title="Out of balance">
            Difference of {fmtCurrency(Math.abs(tb.totals.difference))}. Check recent imports and manual entries.
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
              const rows = tb.rows.filter((r) => r.account.type === type);
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
                          href={`/accounting/general-ledger?account=${r.account.id}`}
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
                {fmtAccounting(tb.totals.debit)}
              </td>
              <td className="border-b-4 border-t-2 border-double border-neutral-800 pt-3 pb-1 pl-4 text-right tabular-nums dark:border-neutral-300">
                {fmtAccounting(tb.totals.credit)}
              </td>
            </tr>
          </tfoot>
        </table>
      </ReportSheet>
    </div>
  );
}
