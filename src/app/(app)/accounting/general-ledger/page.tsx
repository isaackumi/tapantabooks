"use client";

import { useState } from "react";
import { FiDownload, FiPrinter, FiBookOpen } from "react-icons/fi";
import { Button, PageHeader, Field, compactInputClass } from "@/components/ui";
import StatCard from "@/components/statCard";
import SourceBadge from "@/components/sourceBadge";
import EmptyState from "@/components/emptyState";
import { QueryState, Skeleton } from "@/components/queryState";
import AccountSelect from "@/components/accounting/accountSelect";
import { useJournalViewer } from "@/components/accounting/journalViewer";
import { useLedger } from "@/store/ledgerStore";
import { useReport } from "@/services/useApiQuery";
import { isDebitNormal } from "@/lib/ledger";
import type { GeneralLedgerReport } from "@/models/reports";
import { matchesSearch, useGlobalState } from "@/utils/globalStateContext";
import { useQueryParam } from "@/utils/useQueryParam";
import { downloadCsv } from "@/utils/csv";
import { fmtAccounting, fmtCurrency, fmtDate, humanize } from "@/utils/format";
import { isIsoDate, startOfYear, todayIso } from "@/utils/dates";

export default function GeneralLedgerPage() {
  const { state } = useLedger();
  const { openJournal } = useJournalViewer();
  const { searchQuery } = useGlobalState();
  const defaultAccount = state.bankAccounts[0]?.gl_account_id ?? "";
  const [accountId, setAccountId] = useState<string>(defaultAccount);
  const [from, setFrom] = useState(startOfYear(todayIso()));
  const [to, setTo] = useState(todayIso());
  useQueryParam("account", setAccountId);
  useQueryParam("from", (v) => {
    if (isIsoDate(v)) setFrom(v);
  });
  useQueryParam("to", (v) => {
    if (!isIsoDate(v)) return;
    setTo(v);
    if (v < from) setFrom(startOfYear(v));
  });

  const account = state.accounts.find((a) => a.id === accountId);
  const query = useReport<GeneralLedgerReport>(account ? "/reports/general-ledger" : null, {
    account_id: accountId,
    from_date: from,
    to_date: to,
  });
  const ledger = query.data;
  const rows = ledger?.rows.filter((r) =>
    matchesSearch(searchQuery, r.journal.number, r.journal.memo, r.line.description, r.journal.source.reference),
  );

  const exportCsv = () => {
    if (!account || !ledger) return;
    downloadCsv(`general-ledger-${account.code}-${from}-to-${to}.csv`, [
      ["Date", "Entry", "Memo", "Source", "Reference", "Debit", "Credit", "Balance"],
      [from, "", "Opening balance", "", "", "", "", ledger.opening],
      ...ledger.rows.map((r) => [
        r.journal.date,
        r.journal.number,
        r.line.description ? `${r.journal.memo} – ${r.line.description}` : r.journal.memo,
        r.journal.source.type,
        r.journal.source.reference ?? "",
        r.line.debit || "",
        r.line.credit || "",
        r.balance,
      ]),
    ]);
  };

  return (
    <div>
      <PageHeader
        title="General ledger"
        description="Every posted movement on one account with a running balance. Click an entry to see the full journal."
        actions={
          <>
            <Button variant="secondary" icon={FiDownload} onClick={exportCsv} disabled={!ledger}>
              Export CSV
            </Button>
            <Button variant="secondary" icon={FiPrinter} onClick={() => window.print()}>
              Print
            </Button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 rounded-xl border border-neutral-200 bg-white p-4 md:grid-cols-4 dark:border-neutral-700 dark:bg-neutral-800" data-no-print>
        <Field label="Account" className="md:col-span-2">
          <AccountSelect value={accountId} onChange={setAccountId} includeControl className={compactInputClass} />
        </Field>
        <Field label="From">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={compactInputClass} />
        </Field>
        <Field label="To">
          <input type="date" value={to} max={todayIso()} onChange={(e) => setTo(e.target.value)} className={compactInputClass} />
        </Field>
      </div>

      {!account ? (
        <EmptyState icon={FiBookOpen} title="Choose an account" description="Pick an account to see its ledger." />
      ) : (
        <>
          <div className="mb-2 flex flex-wrap items-baseline gap-x-3">
            <h2 className="text-lg font-semibold">
              <span className="font-mono text-neutral-500">{account.code}</span> {account.name}
            </h2>
            <span className="text-sm text-neutral-500 dark:text-neutral-400">
              {humanize(account.type)} · {humanize(account.subtype)} · normal {isDebitNormal(account.type) ? "debit" : "credit"} balance
            </span>
          </div>
          <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
            {fmtDate(from)} to {fmtDate(to)}
          </p>

          <QueryState query={query} skeleton={<Skeleton rows={10} />}>
            {(data) => (
              <>
                <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
                  <StatCard label="Opening balance" value={fmtCurrency(data.opening)} />
                  <StatCard label="Debits" value={fmtCurrency(data.totals.debit)} sub={`${data.rows.filter((r) => r.line.debit).length} lines`} />
                  <StatCard label="Credits" value={fmtCurrency(data.totals.credit)} sub={`${data.rows.filter((r) => r.line.credit).length} lines`} />
                  <StatCard label="Closing balance" value={fmtCurrency(data.closing)} />
                </div>

                <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800">
                  <table className="min-w-full text-sm">
                    <thead className="bg-neutral-50/60 text-left text-neutral-500 dark:bg-neutral-800 dark:text-neutral-300">
                      <tr>
                        <th className="px-4 py-3 font-normal">Date</th>
                        <th className="px-4 py-3 font-normal">Entry</th>
                        <th className="px-4 py-3 font-normal">Description</th>
                        <th className="px-4 py-3 font-normal">Source</th>
                        <th className="px-4 py-3 font-normal text-right">Debit</th>
                        <th className="px-4 py-3 font-normal text-right">Credit</th>
                        <th className="px-4 py-3 font-normal text-right">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700">
                      <tr className="bg-neutral-50/50 dark:bg-neutral-900/20">
                        <td className="px-4 py-2.5">{fmtDate(from)}</td>
                        <td />
                        <td className="px-4 py-2.5 font-medium" colSpan={4}>
                          Opening balance
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium tabular-nums">{fmtAccounting(data.opening)}</td>
                      </tr>
                      {rows?.map((r) => (
                        <tr
                          key={r.line.id}
                          onClick={() => openJournal(r.journal.id)}
                          className="cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-700/40"
                        >
                          <td className="whitespace-nowrap px-4 py-2.5">{fmtDate(r.journal.date)}</td>
                          <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs">{r.journal.number}</td>
                          <td className="w-full max-w-0 px-4 py-2.5">
                            <p className="truncate" title={r.journal.memo}>
                              {r.journal.memo}
                            </p>
                            {r.line.description && (
                              <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{r.line.description}</p>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            <SourceBadge type={r.journal.source.type} />
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{fmtAccounting(r.line.debit)}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{fmtAccounting(r.line.credit)}</td>
                          <td className="px-4 py-2.5 text-right font-medium tabular-nums">{fmtAccounting(r.balance)}</td>
                        </tr>
                      ))}
                      {rows?.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-4 py-8 text-center text-neutral-500">
                            {data.rows.length === 0 ? "No postings in this range." : "No postings match the search."}
                          </td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot className="border-t-2 border-neutral-200 bg-neutral-50 font-semibold dark:border-neutral-600 dark:bg-neutral-900/40">
                      <tr>
                        <td className="px-4 py-3" colSpan={4}>
                          Closing balance
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmtAccounting(data.totals.debit)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmtAccounting(data.totals.credit)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmtAccounting(data.closing)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            )}
          </QueryState>
        </>
      )}
    </div>
  );
}
