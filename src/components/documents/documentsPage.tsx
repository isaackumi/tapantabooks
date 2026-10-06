"use client";

import { useMemo, useState } from "react";
import { FiDollarSign, FiDownload, FiFileText, FiPlus } from "react-icons/fi";
import { Button, PageHeader, compactInputClass } from "@/components/ui";
import { Tabs } from "@/components/tabs";
import StatCard from "@/components/statCard";
import StatusBadge from "@/components/statusBadge";
import SourceBadge from "@/components/sourceBadge";
import DataTable, { type Column } from "@/components/dataTable";
import DocumentFormModal from "./documentFormModal";
import DocumentDrawer from "./documentDrawer";
import PaymentModal from "./paymentModal";
import { useLedger } from "@/store/ledgerStore";
import { billRows, invoiceRows, type DocumentRow } from "@/store/selectors";
import type { DocumentDisplayStatus, PurchaseBill, SalesInvoice } from "@/models/accounting";
import { matchesSearch, useGlobalState } from "@/utils/globalStateContext";
import { useQueryParam } from "@/utils/useQueryParam";
import { BASE_CURRENCY, fmtCurrency, fmtDate, fmtMoney, fmtRate } from "@/utils/format";
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
import { addDays, daysBetween, monthKey, todayIso } from "@/utils/dates";

type Doc = SalesInvoice | PurchaseBill;
type Row = DocumentRow<Doc>;

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
  const { state } = useLedger();
  const { searchQuery } = useGlobalState();
  const isInvoice = kind === "invoice";
  const [tab, setTab] = useState<string>("ALL");
  const [newOpen, setNewOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);
  const [currency, setCurrency] = useState("");
  const [cfFilters, setCfFilters] = useState<Record<string, string>>({});
  useQueryParam("tab", setTab);
  useQueryParam("open", setViewId);
  const today = todayIso();
  const entity = isInvoice ? "Invoice" : "Bill";
  const fields = useEntityFields(entity);

  const rows = useMemo<Row[]>(() => (isInvoice ? invoiceRows(state) : billRows(state)), [state, isInvoice]);
  const filtered = rows.filter(
    (r) =>
      (tab === "ALL" || r.status === tab) &&
      (!currency || r.currency === currency) &&
      matchesCustomFilters(r.doc.custom_fields, cfFilters) &&
      matchesSearch(
        searchQuery,
        r.doc.number,
        r.party?.name,
        r.doc.source.reference,
        r.currency,
        customSearchText(r.doc.custom_fields),
        isInvoice ? undefined : (r.doc as PurchaseBill).supplier_reference,
      ),
  );
  const currenciesInUse = [...new Set(rows.map((r) => r.currency))].sort();

  const exportCsv = () =>
    downloadCsv(`${isInvoice ? "invoices" : "bills"}-${today}.csv`, [
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
        "Total (GHS)",
        "Balance due (GHS)",
        "Status",
        ...customCsvHeaders(fields),
      ],
      ...filtered.map((r) => [
        r.doc.number,
        ...(isInvoice ? [] : [(r.doc as PurchaseBill).supplier_reference]),
        r.party?.name,
        r.doc.issue_date,
        r.doc.due_date,
        r.currency,
        r.doc.exchange_rate,
        r.totals.total,
        r.outstanding_fc,
        r.total_base,
        r.outstanding,
        r.status,
        ...customCsvValues(fields, r.doc.custom_fields),
      ]),
    ]);

  const outstanding = rows.reduce((s, r) => s + r.outstanding, 0);
  const overdue = rows.filter((r) => r.status === "OVERDUE");
  const payments = isInvoice ? state.receipts : state.supplierPayments;
  const settledThisMonth = payments.filter((p) => monthKey(p.date) === monthKey(today)).reduce((s, p) => s + p.base_amount, 0);
  const dueThisWeek = rows
    .filter((r) => r.outstanding > 0 && r.doc.due_date >= today && r.doc.due_date <= addDays(today, 7))
    .reduce((s, r) => s + r.outstanding, 0);

  const columns: Column<Row>[] = [
    {
      id: "number",
      header: isInvoice ? "Invoice" : "Bill",
      accessorFn: (r) => r.doc.number,
      cell: ({ row }) => (
        <div>
          <p className="font-mono text-xs font-medium">{row.original.doc.number}</p>
          {!isInvoice && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400">{(row.original.doc as PurchaseBill).supplier_reference}</p>
          )}
        </div>
      ),
    },
    {
      id: "party",
      header: isInvoice ? "Customer" : "Supplier",
      accessorFn: (r) => r.party?.name ?? "",
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.original.party?.name}</p>
          {row.original.doc.source.type !== "MANUAL" && <SourceBadge type={row.original.doc.source.type} />}
        </div>
      ),
    },
    { id: "issue", header: "Date", accessorFn: (r) => r.doc.issue_date, cell: ({ row }) => fmtDate(row.original.doc.issue_date) },
    {
      id: "due",
      header: "Due",
      accessorFn: (r) => r.doc.due_date,
      cell: ({ row }) => {
        const late = row.original.status === "OVERDUE" ? daysBetween(row.original.doc.due_date, today) : 0;
        return (
          <div>
            <p>{fmtDate(row.original.doc.due_date)}</p>
            {late > 0 && <p className="text-xs text-orange-600 dark:text-orange-400">{late} days late</p>}
          </div>
        );
      },
    },
    {
      id: "total",
      header: "Total",
      align: "right",
      accessorFn: (r) => r.total_base,
      cell: ({ row }) => {
        const r = row.original;
        return (
          <div className="tabular-nums">
            <p>{fmtMoney(r.totals.total, r.currency)}</p>
            {r.currency !== BASE_CURRENCY && (
              <p className="text-xs text-neutral-500 dark:text-neutral-400" title={`Booked at ${fmtRate(r.doc.exchange_rate)}`}>
                {fmtCurrency(r.total_base)}
              </p>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "outstanding",
      header: "Balance due",
      align: "right",
      cell: ({ row }) => {
        const r = row.original;
        if (!r.outstanding) return <span className="text-neutral-400">—</span>;
        return (
          <div className="tabular-nums">
            <p className="font-medium">{fmtMoney(r.outstanding_fc, r.currency)}</p>
            {r.currency !== BASE_CURRENCY && <p className="text-xs text-neutral-500 dark:text-neutral-400">{fmtCurrency(r.outstanding)}</p>}
          </div>
        );
      },
    },
    ...customFieldColumns<Row>(fields, (r) => r.doc.custom_fields),
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
  ];

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
            <Button variant="secondary" icon={FiDownload} onClick={exportCsv}>
              Export
            </Button>
            <Button variant="secondary" icon={FiDollarSign} onClick={() => setPayOpen(true)}>
              {isInvoice ? "Record receipt" : "Record payment"}
            </Button>
            <Button icon={FiPlus} onClick={() => setNewOpen(true)}>
              {isInvoice ? "New invoice" : "New bill"}
            </Button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Outstanding" value={fmtCurrency(outstanding)} sub={`${rows.filter((r) => r.outstanding > 0).length} open documents`} />
        <StatCard
          label="Overdue"
          value={fmtCurrency(overdue.reduce((s, r) => s + r.outstanding, 0))}
          tone={overdue.length ? "warning" : "default"}
          sub={`${overdue.length} past due date`}
        />
        <StatCard label="Due in 7 days" value={fmtCurrency(dueThisWeek)} />
        <StatCard
          label={isInvoice ? "Collected this month" : "Paid this month"}
          value={fmtCurrency(settledThisMonth)}
          sub={`${payments.filter((p) => monthKey(p.date) === monthKey(today)).length} ${isInvoice ? "receipts" : "payments"}`}
        />
      </div>

      <Tabs
        tabs={TABS.map((t) => ({ ...t, count: t.id === "ALL" ? rows.length : rows.filter((r) => r.status === t.id).length }))}
        value={tab}
        onChange={setTab}
        actions={
          <div className="flex flex-wrap gap-2">
            {currenciesInUse.length > 1 && (
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={`${compactInputClass.replace("w-full ", "")} w-auto`} aria-label="Currency">
                <option value="">All currencies</option>
                {currenciesInUse.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            )}
            <CustomFieldFilters fields={fields} value={cfFilters} onChange={setCfFilters} />
          </div>
        }
      />
      <div className="mt-4">
        <DataTable
          columns={columns}
          data={filtered}
          onRowClick={(r) => setViewId(r.doc.id)}
          rowClassName={(r) => (r.status === "VOID" ? "opacity-60" : "")}
          emptyIcon={FiFileText}
          emptyTitle={`No ${isInvoice ? "invoices" : "bills"} here`}
          emptyDescription="Try another tab or clear the search."
          emptyActions={[{ label: isInvoice ? "New invoice" : "New bill", onClick: () => setNewOpen(true) }]}
        />
      </div>

      <DocumentFormModal kind={kind} open={newOpen} onClose={() => setNewOpen(false)} onSaved={setViewId} />
      <DocumentDrawer kind={kind} documentId={viewId} onClose={() => setViewId(null)} />
      <PaymentModal kind={isInvoice ? "receipt" : "payment"} open={payOpen} onClose={() => setPayOpen(false)} />
    </div>
  );
};

export default DocumentsPage;
