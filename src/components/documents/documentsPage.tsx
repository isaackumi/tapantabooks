"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { FiDollarSign, FiDownload, FiFileText, FiPlus } from "react-icons/fi";
import { Button, PageHeader, filterInputClass } from "@/components/ui";
import { Tabs } from "@/components/tabs";
import StatCard from "@/components/statCard";
import StatusBadge from "@/components/statusBadge";
import SourceBadge from "@/components/sourceBadge";
import DataTable, { serverPaging, type Column } from "@/components/dataTable";
import { QueryState, Skeleton } from "@/components/queryState";
import DocumentFormModal from "./documentFormModal";
import DocumentDrawer from "./documentDrawer";
import PaymentModal from "./paymentModal";
import type { DocumentDisplayStatus } from "@/models/accounting";
import type { BillListItem, DocumentListItem, DocumentStatistics } from "@/models/lists";
import { fetchAll } from "@/core/apiClient";
import { useDebouncedValue, usePagedList, useReport } from "@/services/useApiQuery";
import { useGlobalState } from "@/utils/globalStateContext";
import { useQueryParam } from "@/utils/useQueryParam";
import { BASE_CURRENCY, fmtCurrency, fmtDate, fmtMoney, fmtRate } from "@/utils/format";
import { downloadCsv } from "@/utils/csv";
import {
  CustomFieldFilters,
  customCsvHeaders,
  customCsvValues,
  customFieldColumns,
  customFilterQuery,
  useEntityFields,
} from "@/components/customFields";
import { todayIso } from "@/utils/dates";

type Row = DocumentListItem;

const TABS: { id: "ALL" | DocumentDisplayStatus; label: string }[] = [
  { id: "ALL", label: "All" },
  { id: "DRAFT", label: "Draft" },
  { id: "OPEN", label: "Open" },
  { id: "PARTIALLY_PAID", label: "Part paid" },
  { id: "OVERDUE", label: "Overdue" },
  { id: "PAID", label: "Paid" },
  { id: "VOID", label: "Void" },
];

const DocumentsPage = ({ kind }: { kind: "invoice" | "bill" }) => {
  const { searchQuery } = useGlobalState();
  const isInvoice = kind === "invoice";
  const base = isInvoice ? "/invoices" : "/bills";
  const [tab, setTab] = useState<string>("ALL");
  const [newOpen, setNewOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);
  const [currency, setCurrency] = useState("");
  const [cfFilters, setCfFilters] = useState<Record<string, string>>({});
  const [exporting, setExporting] = useState(false);
  useQueryParam("tab", setTab);
  useQueryParam("open", setViewId);
  const entity = isInvoice ? "Invoice" : "Bill";
  const fields = useEntityFields(entity);
  const search = useDebouncedValue(searchQuery.trim());

  const list = usePagedList<Row>(`${base}/list`, {
    status: tab === "ALL" ? "" : tab,
    currency,
    search,
    ...customFilterQuery(cfFilters),
  });
  const stats = useReport<DocumentStatistics>(`${base}/statistics`, {});

  const exportCsv = async () => {
    setExporting(true);
    try {
      const rows = await fetchAll<Row>(`${base}/list`, list.listQuery);
      downloadCsv(`${isInvoice ? "invoices" : "bills"}-${todayIso()}.csv`, [
        [
          isInvoice ? "Invoice" : "Bill",
          ...(isInvoice ? [] : ["Supplier invoice no."]),
          isInvoice ? "Customer" : "Supplier",
          "Issue date",
          "Due date",
          "Currency",
          "Rate",
          "Total",
          "Balance due",
          `Total (${BASE_CURRENCY})`,
          `Balance due (${BASE_CURRENCY})`,
          "Status",
          ...customCsvHeaders(fields),
        ],
        ...rows.map((r) => [
          r.number,
          ...(isInvoice ? [] : [(r as BillListItem).supplier_reference]),
          r.party_name,
          r.issue_date,
          r.due_date,
          r.currency,
          r.exchange_rate,
          r.total,
          r.outstanding,
          r.total_base,
          r.outstanding_base,
          r.status,
          ...customCsvValues(fields, r.custom_fields),
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
      id: "number",
      header: isInvoice ? "Invoice" : "Bill",
      accessorFn: (r) => r.number,
      cell: ({ row }) => (
        <div>
          <p className="font-mono text-xs font-medium">{row.original.number}</p>
          {!isInvoice && <p className="text-xs text-neutral-500 dark:text-neutral-400">{(row.original as BillListItem).supplier_reference}</p>}
        </div>
      ),
    },
    {
      id: "party_name",
      header: isInvoice ? "Customer" : "Supplier",
      accessorFn: (r) => r.party_name,
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.original.party_name}</p>
          {row.original.source.type !== "MANUAL" && <SourceBadge type={row.original.source.type} />}
        </div>
      ),
    },
    { id: "issue_date", header: "Date", accessorFn: (r) => r.issue_date, cell: ({ row }) => fmtDate(row.original.issue_date) },
    {
      id: "due_date",
      header: "Due",
      accessorFn: (r) => r.due_date,
      cell: ({ row }) => (
        <div>
          <p>{fmtDate(row.original.due_date)}</p>
          {row.original.days_overdue > 0 && (
            <p className="text-xs text-orange-600 dark:text-orange-400">
              {row.original.days_overdue} {row.original.days_overdue === 1 ? "day" : "days"} late
            </p>
          )}
        </div>
      ),
    },
    {
      id: "total_base",
      header: "Total",
      align: "right",
      accessorFn: (r) => r.total_base,
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className="tabular-nums">
            <p>{fmtMoney(r.total, r.currency)}</p>
            {r.currency !== BASE_CURRENCY && (
              <p className="text-xs text-neutral-500 dark:text-neutral-400" title={`Booked at ${fmtRate(r.exchange_rate)}`}>
                {fmtCurrency(r.total_base)}
              </p>
            )}
          </div>
        );
      },
    },
    {
      id: "outstanding_base",
      header: "Balance due",
      align: "right",
      accessorFn: (r) => r.outstanding_base,
      cell: ({ row }) => {
        const r = row.original;
        if (!r.outstanding_base) return <span className="text-neutral-400">—</span>;
        return (
          <div className="tabular-nums">
            <p className="font-medium">{fmtMoney(r.outstanding, r.currency)}</p>
            {r.currency !== BASE_CURRENCY && <p className="text-xs text-neutral-500 dark:text-neutral-400">{fmtCurrency(r.outstanding_base)}</p>}
          </div>
        );
      },
    },
    { id: "status", accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    ...customFieldColumns<Row>(fields, (r) => r.custom_fields),
  ];

  const s = stats.data;
  const filtered = tab !== "ALL" || !!currency || !!search || Object.values(cfFilters).some(Boolean);

  return (
    <div>
      <PageHeader
        title={isInvoice ? "Sales invoices" : "Supplier bills"}
        description={
          isInvoice
            ? "Credit sales to customers. Each approved invoice posts to Accounts Receivable automatically."
            : "What suppliers have billed you. Each approved bill posts to Accounts Payable automatically."
        }
        actions={
          <>
            <Button variant="secondary" icon={FiDownload} onClick={exportCsv} disabled={exporting} data-tour="export">
              {exporting ? "Exporting…" : "Export"}
            </Button>
            <Button variant="secondary" icon={FiDollarSign} onClick={() => setPayOpen(true)} data-tour="doc-pay">
              {isInvoice ? "Record receipt" : "Record payment"}
            </Button>
            <Button icon={FiPlus} onClick={() => setNewOpen(true)} data-tour="doc-new">
              {isInvoice ? "New invoice" : "New bill"}
            </Button>
          </>
        }
      />

      <QueryState query={stats} skeleton={<Skeleton rows={2} className="mb-6" />} className="mb-6">
        {(st) => (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" data-tour="stats">
            <StatCard label="Outstanding" value={fmtCurrency(st.outstanding)} sub={`${st.open_count} open ${st.open_count === 1 ? "document" : "documents"}`} />
            <StatCard
              label="Overdue"
              value={fmtCurrency(st.overdue)}
              tone={st.overdue_count ? "warning" : "default"}
              sub={`${st.overdue_count} past due date`}
            />
            <StatCard label="Due in 7 days" value={fmtCurrency(st.due_7_days)} />
            <StatCard
              label={isInvoice ? "Collected this month" : "Paid this month"}
              value={fmtCurrency(st.settled_this_month)}
              sub={`${st.settled_this_month_count} ${isInvoice ? "receipts" : "payments"}`}
            />
          </div>
        )}
      </QueryState>

      <Tabs
        tabs={TABS.map((t) => ({ ...t, count: s?.status_counts[t.id] }))}
        value={tab}
        onChange={setTab}
        actions={
          <div className="flex flex-wrap gap-2">
            {(s?.currencies.length ?? 0) > 1 && (
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={`${filterInputClass} w-auto`} aria-label="Currency">
                <option value="">All currencies</option>
                {s!.currencies.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            )}
            <CustomFieldFilters fields={fields} value={cfFilters} onChange={setCfFilters} />
          </div>
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
            onRowClick={(r) => setViewId(r.id)}
            rowClassName={(r) => (r.status === "VOID" ? "opacity-60" : "")}
            emptyIcon={FiFileText}
            emptyTitle={filtered ? `No ${isInvoice ? "invoices" : "bills"} match` : `No ${isInvoice ? "invoices" : "bills"} yet`}
            emptyDescription={filtered ? "Try another tab or clear the search." : `Raise the first ${isInvoice ? "invoice" : "bill"} to see it here.`}
            emptyActions={[{ label: isInvoice ? "New invoice" : "New bill", onClick: () => setNewOpen(true) }]}
          />
        )}
      </QueryState>

      <DocumentFormModal kind={kind} open={newOpen} onClose={() => setNewOpen(false)} onSaved={setViewId} />
      <DocumentDrawer kind={kind} documentId={viewId} onClose={() => setViewId(null)} />
      <PaymentModal kind={isInvoice ? "receipt" : "payment"} open={payOpen} onClose={() => setPayOpen(false)} />
    </div>
  );
};

export default DocumentsPage;
