"use client";

import { useMemo, useState } from "react";
import { FiBookOpen, FiDownload, FiPlus } from "react-icons/fi";
import { Button, PageHeader, compactInputClass } from "@/components/ui";
import { Tabs } from "@/components/tabs";
import StatCard from "@/components/statCard";
import StatusBadge from "@/components/statusBadge";
import SourceBadge, { SOURCE_TYPES, sourceLabel } from "@/components/sourceBadge";
import DataTable, { type Column } from "@/components/dataTable";
import { useJournalViewer } from "@/components/accounting/journalViewer";
import { useLedger } from "@/store/ledgerStore";
import { lineTotals } from "@/lib/ledger";
import type { JournalEntry, JournalStatus } from "@/models/accounting";
import { matchesSearch, useGlobalState } from "@/utils/globalStateContext";
import { useQueryParam } from "@/utils/useQueryParam";
import { fmtCurrency, fmtDate } from "@/utils/format";
import { monthKey, todayIso } from "@/utils/dates";
import { downloadCsv } from "@/utils/csv";
import {
  CustomFieldFilters,
  customCsvHeaders,
  customCsvValues,
  customFieldColumns,
  customSearchText,
  matchesCustomFilters,
  useEntityFields,
} from "@/components/customFields";

type Row = JournalEntry & { total: number };
const TABS: { id: "ALL" | JournalStatus; label: string }[] = [
  { id: "ALL", label: "All" },
  { id: "DRAFT", label: "Drafts" },
  { id: "PENDING_APPROVAL", label: "Awaiting approval" },
  { id: "POSTED", label: "Posted" },
  { id: "REVERSED", label: "Reversed" },
];

export default function JournalsPage() {
  const { state } = useLedger();
  const { openJournal, newJournal } = useJournalViewer();
  const { searchQuery } = useGlobalState();
  const [tab, setTab] = useState<string>("ALL");
  const [source, setSource] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [cfFilters, setCfFilters] = useState<Record<string, string>>({});
  const fields = useEntityFields("Journal");
  useQueryParam("tab", setTab);
  useQueryParam("open", openJournal);

  const rows: Row[] = useMemo(
    () =>
      state.journals
        .map((j) => ({ ...j, total: lineTotals(j.lines).debit }))
        .sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number)),
    [state.journals],
  );

  const filtered = rows.filter(
    (j) =>
      (tab === "ALL" || j.status === tab) &&
      (!source || j.source.type === source) &&
      (!from || j.date >= from) &&
      (!to || j.date <= to) &&
      matchesCustomFilters(j.custom_fields, cfFilters) &&
      matchesSearch(searchQuery, j.number, j.memo, j.reference, j.created_by, sourceLabel(j.source.type), customSearchText(j.custom_fields)),
  );

  const exportCsv = () =>
    downloadCsv(`journals-${todayIso()}.csv`, [
      ["Entry", "Date", "Memo", "Reference", "Source", "Amount (GHS)", "Status", "Prepared by", ...customCsvHeaders(fields)],
      ...filtered.map((j) => [
        j.number,
        j.date,
        j.memo,
        j.reference,
        sourceLabel(j.source.type),
        j.total,
        j.status,
        j.created_by,
        ...customCsvValues(fields, j.custom_fields),
      ]),
    ]);

  const count = (s: JournalStatus) => rows.filter((j) => j.status === s).length;
  const thisMonth = rows.filter((j) => monthKey(j.date) === monthKey(todayIso()) && j.status === "POSTED");
  const pending = rows.filter((j) => j.status === "PENDING_APPROVAL");
  const integrationShare = Math.round(
    (rows.filter((j) => !["MANUAL", "SALES", "PURCHASES", "BANKING", "FX_REVALUATION", "OPENING_BALANCE", "YEAR_END"].includes(j.source.type)).length / rows.length) * 100,
  );

  const columns: Column<Row>[] = [
    {
      accessorKey: "number",
      header: "Entry",
      cell: ({ row }) => <span className="font-mono text-xs font-medium">{row.original.number}</span>,
    },
    { accessorKey: "date", header: "Date", cell: ({ row }) => fmtDate(row.original.date) },
    {
      accessorKey: "memo",
      header: "Memo",
      cell: ({ row }) => (
        <div className="max-w-md">
          <p className="truncate">{row.original.memo}</p>
          {row.original.reversal_of_id && <p className="text-xs text-brand-600 dark:text-brand-400">Reversal entry</p>}
        </div>
      ),
    },
    {
      id: "source",
      header: "Source",
      accessorFn: (r) => r.source.type,
      cell: ({ row }) => <SourceBadge type={row.original.source.type} reference={row.original.source.reference} />,
    },
    {
      accessorKey: "total",
      header: "Amount",
      align: "right",
      cell: ({ row }) => <span className="tabular-nums">{fmtCurrency(row.original.total)}</span>,
    },
    ...customFieldColumns<Row>(fields, (r) => r.custom_fields),
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    {
      accessorKey: "created_by",
      header: "Prepared by",
      cell: ({ row }) => <span className="text-neutral-600 dark:text-neutral-300">{row.original.created_by}</span>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Journal entries"
        description="Every posting in the ledger, whether typed here, generated by a document or received from an integration."
        actions={
          <>
            <Button variant="secondary" icon={FiDownload} onClick={exportCsv}>
              Export
            </Button>
            <Button icon={FiPlus} onClick={newJournal} data-tour="journal-new">
              New journal entry
            </Button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" data-tour="stats">
        <StatCard label="Posted this month" value={thisMonth.length} sub={fmtCurrency(thisMonth.reduce((s, j) => s + j.total, 0))} />
        <StatCard
          label="Awaiting approval"
          value={pending.length}
          tone={pending.length ? "warning" : "default"}
          sub={fmtCurrency(pending.reduce((s, j) => s + j.total, 0))}
          info={`Manual entries of ${fmtCurrency(state.org.approval_threshold)} or more need a second person to approve them.`}
        />
        <StatCard label="Drafts" value={count("DRAFT")} sub="Not yet in the ledger" />
        <StatCard
          label="From integrations"
          value={`${integrationShare}%`}
          sub="Store, LoanDrift, ZelosHR and imports"
          info="Share of all entries created automatically by connected systems and imports."
        />
      </div>

      <Tabs
        tabs={TABS.map((t) => ({ ...t, count: t.id === "ALL" ? rows.length : count(t.id as JournalStatus) }))}
        value={tab}
        onChange={setTab}
        actions={
          <>
            <select value={source} onChange={(e) => setSource(e.target.value)} className={`${compactInputClass} w-44`}>
              <option value="">All sources</option>
              {SOURCE_TYPES.map((s) => (
                <option key={s} value={s}>
                  {sourceLabel(s)}
                </option>
              ))}
            </select>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${compactInputClass} w-40`} aria-label="From" />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${compactInputClass} w-40`} aria-label="To" />
            <CustomFieldFilters fields={fields} value={cfFilters} onChange={setCfFilters} />
          </>
        }
      />

      <div className="mt-4">
        <DataTable
          columns={columns}
          data={filtered}
          onRowClick={(r) => openJournal(r.id)}
          emptyIcon={FiBookOpen}
          emptyTitle="No journal entries match"
          emptyDescription="Try another tab, source or date range."
        />
      </div>
    </div>
  );
}
