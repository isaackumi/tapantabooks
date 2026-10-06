"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { FiChevronDown, FiChevronRight } from "react-icons/fi";
import { PageHeader } from "@/components/ui";
import StatCard from "@/components/statCard";
import { ReportToolbar } from "./reportKit";
import { useLedger } from "@/store/ledgerStore";
import { billRows, invoiceRows } from "@/store/selectors";
import { AGEING_BUCKETS, ageingBucket, emptyAgeing, type AgeingBucket } from "@/lib/documents";
import { matchesSearch, useGlobalState } from "@/utils/globalStateContext";
import { downloadCsv } from "@/utils/csv";
import { fmtAccounting, fmtCurrency, fmtDate, round2 } from "@/utils/format";
import { daysBetween, todayIso } from "@/utils/dates";

const BUCKET_TONE: Record<AgeingBucket, string> = {
  Current: "",
  "1–30 days": "text-amber-600 dark:text-amber-400",
  "31–60 days": "text-orange-600 dark:text-orange-400",
  "61–90 days": "text-red-600 dark:text-red-400",
  "90+ days": "text-red-700 font-semibold dark:text-red-400",
};

const AgeingReport = ({ kind }: { kind: "receivable" | "payable" }) => {
  const { state } = useLedger();
  const { searchQuery } = useGlobalState();
  const isAr = kind === "receivable";
  const [asAt, setAsAt] = useState(todayIso());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { parties, totals } = useMemo(() => {
    const rows = (isAr ? invoiceRows(state) : billRows(state)).filter((r) => r.outstanding > 0 && r.doc.issue_date <= asAt);
    const map = new Map<string, { id: string; name: string; code: string; buckets: Record<AgeingBucket, number>; total: number; docs: typeof rows }>();
    for (const r of rows) {
      if (!r.party) continue;
      const entry = map.get(r.party.id) ?? { id: r.party.id, name: r.party.name, code: r.party.code, buckets: emptyAgeing(), total: 0, docs: [] };
      const b = ageingBucket(r.doc.due_date, asAt);
      entry.buckets[b] = round2(entry.buckets[b] + r.outstanding);
      entry.total = round2(entry.total + r.outstanding);
      entry.docs.push(r);
      map.set(r.party.id, entry);
    }
    const parties = [...map.values()].sort((a, b) => b.total - a.total);
    const totals = emptyAgeing();
    for (const p of parties) for (const b of AGEING_BUCKETS) totals[b] = round2(totals[b] + p.buckets[b]);
    return { parties, totals };
  }, [state, isAr, asAt]);

  const shown = parties.filter((p) => matchesSearch(searchQuery, p.name, p.code));
  const grand = round2(AGEING_BUCKETS.reduce((s, b) => s + totals[b], 0));
  const overdue = round2(grand - totals.Current);
  const docBase = isAr ? "/sales/invoices" : "/purchases/bills";

  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const exportCsv = () =>
    downloadCsv(`${isAr ? "ar" : "ap"}-ageing-${asAt}.csv`, [
      [isAr ? "Customer" : "Supplier", "Code", ...AGEING_BUCKETS, "Total"],
      ...parties.map((p) => [p.name, p.code, ...AGEING_BUCKETS.map((b) => p.buckets[b]), p.total]),
      ["Total", "", ...AGEING_BUCKETS.map((b) => totals[b]), grand],
    ]);

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
      <ReportToolbar to={asAt} onTo={setAsAt} onExport={exportCsv} />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={isAr ? "Total receivable" : "Total payable"} value={fmtCurrency(grand)} sub={`${parties.length} ${isAr ? "customers" : "suppliers"}`} />
        <StatCard label="Overdue" value={fmtCurrency(overdue)} tone={overdue ? "warning" : "default"} sub={grand ? `${Math.round((overdue / grand) * 100)}% of the balance` : undefined} />
        <StatCard label="Over 60 days" value={fmtCurrency(round2(totals["61–90 days"] + totals["90+ days"]))} tone={totals["61–90 days"] + totals["90+ days"] > 0 ? "danger" : "default"} />
      </div>

      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800">
        <table className="min-w-full text-sm">
          <thead className="bg-neutral-50/60 text-left text-neutral-500 dark:bg-neutral-800 dark:text-neutral-300">
            <tr>
              <th className="px-4 py-3 font-normal">{isAr ? "Customer" : "Supplier"}</th>
              {AGEING_BUCKETS.map((b) => (
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
                <td colSpan={7} className="px-4 py-10 text-center text-neutral-500">
                  Nothing outstanding.
                </td>
              </tr>
            )}
            {shown.map((p) => (
              <Fragment key={p.id}>
                <tr onClick={() => toggle(p.id)} className="cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-700/40">
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2 font-medium">
                      {expanded.has(p.id) ? <FiChevronDown className="text-neutral-400" /> : <FiChevronRight className="text-neutral-400" />}
                      {p.name}
                      <span className="text-xs font-normal text-neutral-400">{p.docs.length}</span>
                    </span>
                  </td>
                  {AGEING_BUCKETS.map((b) => (
                    <td key={b} className={`px-4 py-3 text-right tabular-nums ${p.buckets[b] ? BUCKET_TONE[b] : ""}`}>
                      {fmtAccounting(p.buckets[b])}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{fmtAccounting(p.total)}</td>
                </tr>
                {expanded.has(p.id) &&
                  p.docs.map((r) => {
                    const b = ageingBucket(r.doc.due_date, asAt);
                    const late = daysBetween(r.doc.due_date, asAt);
                    return (
                      <tr key={r.doc.id} className="bg-neutral-50/60 text-xs dark:bg-neutral-900/30">
                        <td className="px-4 py-2 pl-10">
                          <Link href={`${docBase}?open=${r.doc.id}`} className="font-mono text-brand-700 hover:underline dark:text-brand-300">
                            {r.doc.number}
                          </Link>
                          <span className="ml-2 text-neutral-500">
                            due {fmtDate(r.doc.due_date)}
                            {late > 0 && ` · ${late}d late`}
                          </span>
                        </td>
                        {AGEING_BUCKETS.map((x) => (
                          <td key={x} className="px-4 py-2 text-right tabular-nums">
                            {x === b ? fmtAccounting(r.outstanding) : ""}
                          </td>
                        ))}
                        <td />
                      </tr>
                    );
                  })}
              </Fragment>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-neutral-200 bg-neutral-50 font-semibold dark:border-neutral-600 dark:bg-neutral-900/40">
            <tr>
              <td className="px-4 py-3">Total</td>
              {AGEING_BUCKETS.map((b) => (
                <td key={b} className="px-4 py-3 text-right tabular-nums">
                  {fmtAccounting(totals[b])}
                </td>
              ))}
              <td className="px-4 py-3 text-right tabular-nums">{fmtAccounting(grand)}</td>
            </tr>
            <tr className="text-xs font-normal text-neutral-500">
              <td className="px-4 pb-3">Share</td>
              {AGEING_BUCKETS.map((b) => (
                <td key={b} className="px-4 pb-3 text-right">
                  {grand ? `${Math.round((totals[b] / grand) * 100)}%` : "—"}
                </td>
              ))}
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
        Ageing uses the current amount still owed on each document. Click a row to see the documents behind it.
      </p>
    </div>
  );
};

export default AgeingReport;
