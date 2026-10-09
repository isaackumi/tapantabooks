"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { FiBookOpen, FiDownload, FiPlus } from "react-icons/fi";
import { Button, PageHeader, filterInputClass } from "@/components/ui";
import { Tabs } from "@/components/tabs";
import StatCard from "@/components/statCard";
import StatusBadge from "@/components/statusBadge";
import SourceBadge, { SOURCE_TYPES, sourceLabel } from "@/components/sourceBadge";
import DataTable, { serverPaging, type Column } from "@/components/dataTable";
import { QueryState, Skeleton } from "@/components/queryState";
import { useJournalViewer } from "@/components/accounting/journalViewer";
import { useLedger } from "@/store/ledgerStore";
import type { JournalStatus } from "@/models/accounting";
import type { JournalListItem, JournalStatistics } from "@/models/lists";
import { fetchAll } from "@/core/apiClient";
import { useDebouncedValue, usePagedList, useReport } from "@/services/useApiQuery";
import { useGlobalState } from "@/utils/globalStateContext";
import { useQueryParam } from "@/utils/useQueryParam";
import { BASE_CURRENCY, fmtCurrency, fmtDate } from "@/utils/format";
import { todayIso } from "@/utils/dates";
import { downloadCsv } from "@/utils/csv";
import {
  CustomFieldFilters,
  customCsvHeaders,
  customCsvValues,
  customFieldColumns,
  customFilterQuery,
  useEntityFields,
} from "@/components/customFields";

type Row = JournalListItem;
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
  const [exporting, setExporting] = useState(false);
  const fields = useEntityFields("Journal");
  useQueryParam("tab", setTab);
  useQueryParam("open", openJournal);
  const search = useDebouncedValue(searchQuery.trim());

  const list = usePagedList<Row>("/journals/list", {
    status: tab === "ALL" ? "" : tab,
    source_type: source,
    from_date: from,
    to_date: to,
    search,
    ...customFilterQuery(cfFilters),
  });
  const stats = useReport<JournalStatistics>("/journals/statistics", {});

  const exportCsv = async () => {
    setExporting(true);
    try {
      const rows = await fetchAll<Row>("/journals/list", list.listQuery);
      downloadCsv(`journals-${todayIso()}.csv`, [
        ["Entry", "Date", "Memo", "Reference", "Source", `Amount (${BASE_CURRENCY})`, "Status", "Prepared by", ...customCsvHeaders(fields)],
        ...rows.map((j) => [
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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  };

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
        <div className="max-w-xs">
          <p className="truncate">{row.original.memo}</p>
          {row.original.reversal_of_id && <p className="text-xs text-brand-600 dark:text-brand-400">Reversal entry</p>}
        </div>
      ),
    },
    {
      id: "source.type",
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
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    {
      accessorKey: "created_by",
      header: "Prepared by",
      cell: ({ row }) => <span className="text-neutral-600 dark:text-neutral-300">{row.original.created_by}</span>,
    },
    ...customFieldColumns<Row>(fields, (r) => r.custom_fields),
  ];

  const filtered = tab !== "ALL" || !!source || !!from || !!to || !!search || Object.values(cfFilters).some(Boolean);

  return (
    <div>
      <PageHeader
        title="Journal entries"
        description="Every posting in the ledger, whether typed here, generated by a document or received from an integration."
        actions={
          <>
            <Button variant="secondary" icon={FiDownload} onClick={exportCsv} disabled={exporting}>
              {exporting ? "Exporting…" : "Export"}
            </Button>
            <Button icon={FiPlus} onClick={newJournal} data-tour="journal-new">
              New journal entry
            </Button>
          </>
        }
      />

      <QueryState query={stats} skeleton={<Skeleton rows={2} />} className="mb-6">
        {(st) => (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" data-tour="stats">
            <StatCard label="Posted this month" value={st.posted_this_month_count} sub={fmtCurrency(st.posted_this_month_total)} />
            <StatCard
              label="Awaiting approval"
              value={st.pending_approval_count}
              tone={st.pending_approval_count ? "warning" : "default"}
              sub={fmtCurrency(st.pending_approval_total)}
              info={`Manual entries of ${fmtCurrency(state.org.approval_threshold)} or more need a second person to approve them.`}
            />
            <StatCard label="Drafts" value={st.status_counts.DRAFT} sub="Not yet in the ledger" />
            <StatCard
              label="From integrations"
              value={`${st.integration_share_pct}%`}
              sub="Connected systems and imports"
              info="Share of all entries created automatically by connected systems and imports."
            />
          </div>
        )}
      </QueryState>

      <Tabs
        tabs={TABS.map((t) => ({ ...t, count: stats.data?.status_counts[t.id] }))}
        value={tab}
        onChange={setTab}
        actions={
          <>
            <select value={source} onChange={(e) => setSource(e.target.value)} className={`${filterInputClass} w-44`} aria-label="Source">
              <option value="">All sources</option>
              {SOURCE_TYPES.map((s) => (
                <option key={s} value={s}>
                  {sourceLabel(s)}
                </option>
              ))}
            </select>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${filterInputClass} w-40`} aria-label="From" />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${filterInputClass} w-40`} aria-label="To" />
            <CustomFieldFilters fields={fields} value={cfFilters} onChange={setCfFilters} />
          </>
        }
      />

      <QueryState query={list} skeleton={<Skeleton rows={10} />} className="mt-4">
        {() => (
          <DataTable
            columns={columns}
            data={list.items}
            server={serverPaging(list)}
            dense
            nowrap
            onRowClick={(r) => openJournal(r.id)}
            emptyIcon={FiBookOpen}
            emptyTitle={filtered ? "No journal entries match" : "No journal entries yet"}
            emptyDescription={filtered ? "Try another tab, source or date range." : "Entries appear here as documents are approved or journals are posted."}
          />
        )}
      </QueryState>
    </div>
  );
}
