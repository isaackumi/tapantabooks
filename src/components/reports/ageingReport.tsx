"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { FiChevronDown, FiChevronRight } from "react-icons/fi";
import { PageHeader } from "@/components/ui";
import StatCard from "@/components/statCard";
import { QueryState, Skeleton } from "@/components/queryState";
import { ReportToolbar, useReportPresets } from "./reportKit";
import { useReport } from "@/services/useApiQuery";
import type { AgeingReport as AgeingReportData } from "@/models/reports";
import { matchesSearch, useGlobalState } from "@/utils/globalStateContext";
import { downloadCsv } from "@/utils/csv";
import { fmtAccounting, fmtCurrency, fmtDate, round2 } from "@/utils/format";
import { todayIso } from "@/utils/dates";

/** Tone by bucket position: current, then increasingly late. */
const BUCKET_TONES = [
  "",
  "text-amber-600 dark:text-amber-400",
  "text-orange-600 dark:text-orange-400",
  "text-red-600 dark:text-red-400",
  "text-red-700 font-semibold dark:text-red-400",
];

const AgeingReport = ({ kind }: { kind: "receivable" | "payable" }) => {
  const { searchQuery } = useGlobalState();
  const presets = useReportPresets();
  const isAr = kind === "receivable";
  const [asAt, setAsAt] = useState(todayIso());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const query = useReport<AgeingReportData>(isAr ? "/reports/ar-ageing" : "/reports/ap-ageing", { as_at: asAt });
  const docBase = isAr ? "/sales/invoices" : "/purchases/bills";
  const statementHref = (partyId: string) => `/reports/statements?kind=${isAr ? "customer" : "supplier"}&party=${partyId}`;

  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const exportCsv = () => {
    const data = query.data;
    if (!data) return;
    downloadCsv(`${isAr ? "ar" : "ap"}-ageing-${asAt}.csv`, [
      [isAr ? "Customer" : "Supplier", "Code", "Document", "Due date", "Days overdue", ...data.buckets, "Total"],
      ...data.rows.flatMap((p) => [
        [p.party_name, p.party_code, "", "", "", ...data.buckets.map((b) => p.buckets[b] ?? 0), p.total],
        ...p.documents.map((d) => [
          p.party_name,
          p.party_code,
          d.number,
          d.due_date,
          d.days_overdue,
          ...data.buckets.map((b) => (b === d.bucket ? d.outstanding : "")),
          "",
        ]),
      ]),
      ["Total", "", "", "", "", ...data.buckets.map((b) => data.totals[b] ?? 0), data.totals.total],
    ]);
  };

  return (
    <div>
      <PageHeader
        title={isAr ? "Receivables ageing" : "Payables ageing"}
        description={
          isAr
            ? "Unpaid customer invoices grouped by how far past their due date they are."
            : "Unpaid supplier bills grouped by how far past their due date they are."
        }
        backHref="/reports"
        backLabel="Reports"
      />
      <ReportToolbar to={asAt} onTo={setAsAt} onExport={query.data ? exportCsv : undefined} presets={presets.asAt} />

      <QueryState query={query} skeleton={<Skeleton rows={8} />}>
        {(data) => {
          const [currentBucket, , , ...over60] = data.buckets;
          const grand = data.totals.total;
          const overdue = round2(grand - (data.totals[currentBucket] ?? 0));
          const over60Total = round2(over60.reduce((s, b) => s + (data.totals[b] ?? 0), 0));
          const shown = data.rows.filter((p) => matchesSearch(searchQuery, p.party_name, p.party_code, ...p.documents.map((d) => d.number)));
          return (
            <>
              <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <StatCard
                  label={isAr ? "Total receivable" : "Total payable"}
                  value={fmtCurrency(grand)}
                  sub={`${data.rows.length} ${isAr ? "customers" : "suppliers"} as at ${fmtDate(data.as_at)}`}
                />
                <StatCard
                  label="Overdue"
                  value={fmtCurrency(overdue)}
                  tone={overdue ? "warning" : "default"}
                  sub={grand ? `${Math.round((overdue / grand) * 100)}% of the balance` : undefined}
                />
                <StatCard label="Over 60 days" value={fmtCurrency(over60Total)} tone={over60Total > 0 ? "danger" : "default"} />
              </div>

              <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800">
                <table className="min-w-full text-sm">
                  <thead className="bg-neutral-50/60 text-left text-neutral-500 dark:bg-neutral-800 dark:text-neutral-300">
                    <tr>
                      <th className="px-4 py-3 font-normal">{isAr ? "Customer" : "Supplier"}</th>
                      {data.buckets.map((b) => (
                        <th key={b} className="px-4 py-3 text-right font-normal">
                          {b}
                        </th>
                      ))}
                      <th className="px-4 py-3 text-right font-normal">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700">
                    {shown.length === 0 && (
                      <tr>
                        <td colSpan={data.buckets.length + 2} className="px-4 py-10 text-center text-neutral-500">
                          {data.rows.length === 0 ? "Nothing outstanding." : "No parties match the search."}
                        </td>
                      </tr>
                    )}
                    {shown.map((p) => (
                      <Fragment key={p.party_id}>
                        <tr onClick={() => toggle(p.party_id)} className="cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-700/40">
                          <td className="px-4 py-3">
                            <span className="flex items-center gap-2 font-medium">
                              {expanded.has(p.party_id) ? <FiChevronDown className="text-neutral-400" /> : <FiChevronRight className="text-neutral-400" />}
                              {p.party_name}
                              <span className="text-xs font-normal text-neutral-400">{p.documents.length}</span>
                            </span>
                          </td>
                          {data.buckets.map((b, i) => (
                            <td key={b} className={`px-4 py-3 text-right tabular-nums ${p.buckets[b] ? BUCKET_TONES[i] ?? "" : ""}`}>
                              {fmtAccounting(p.buckets[b] ?? 0)}
                            </td>
                          ))}
                          <td className="px-4 py-3 text-right font-semibold tabular-nums">{fmtAccounting(p.total)}</td>
                        </tr>
                        {expanded.has(p.party_id) && (
                          <>
                            {p.documents.map((d) => (
                              <tr key={d.document_id} className="bg-neutral-50/60 text-xs dark:bg-neutral-900/30">
                                <td className="px-4 py-2 pl-10">
                                  <Link href={`${docBase}?open=${d.document_id}`} className="font-mono text-brand-700 hover:underline dark:text-brand-300">
                                    {d.number}
                                  </Link>
                                  <span className="ml-2 text-neutral-500">
                                    due {fmtDate(d.due_date)}
                                    {d.days_overdue > 0 && ` · ${d.days_overdue}d late`}
                                  </span>
                                </td>
                                {data.buckets.map((b) => (
                                  <td key={b} className="px-4 py-2 text-right tabular-nums">
                                    {b === d.bucket ? fmtAccounting(d.outstanding) : ""}
                                  </td>
                                ))}
                                <td />
                              </tr>
                            ))}
                            <tr className="bg-neutral-50/60 text-xs dark:bg-neutral-900/30">
                              <td colSpan={data.buckets.length + 2} className="px-4 py-2 pl-10">
                                <Link href={statementHref(p.party_id)} className="font-medium text-brand-700 hover:underline dark:text-brand-300">
                                  Statement of account for {p.party_name}
                                </Link>
                              </td>
                            </tr>
                          </>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-neutral-200 bg-neutral-50 font-semibold dark:border-neutral-600 dark:bg-neutral-900/40">
                    <tr>
                      <td className="px-4 py-3">Total</td>
                      {data.buckets.map((b) => (
                        <td key={b} className="px-4 py-3 text-right tabular-nums">
                          {fmtAccounting(data.totals[b] ?? 0)}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-right tabular-nums">{fmtAccounting(grand)}</td>
                    </tr>
                    <tr className="text-xs font-normal text-neutral-500">
                      <td className="px-4 pb-3">Share</td>
                      {data.buckets.map((b) => (
                        <td key={b} className="px-4 pb-3 text-right">
                          {grand ? `${Math.round(((data.totals[b] ?? 0) / grand) * 100)}%` : "—"}
                        </td>
                      ))}
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
                Ageing uses the current amount still owed on each document issued on or before the date. Click a row to see the documents
                behind it.
              </p>
            </>
          );
        }}
      </QueryState>
    </div>
  );
};

export default AgeingReport;
