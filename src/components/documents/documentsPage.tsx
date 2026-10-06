"use client";

import { useMemo, useState } from "react";
import { FiDollarSign, FiFileText, FiPlus } from "react-icons/fi";
import { Button, PageHeader } from "@/components/ui";
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
import { fmtCurrency, fmtDate } from "@/utils/format";
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
  useQueryParam("tab", setTab);
  useQueryParam("open", setViewId);
  const today = todayIso();

  const rows = useMemo<Row[]>(() => (isInvoice ? invoiceRows(state) : billRows(state)), [state, isInvoice]);
  const filtered = rows.filter(
    (r) =>
      (tab === "ALL" || r.status === tab) &&
      matchesSearch(
        searchQuery,
        r.doc.number,
        r.party?.name,
        r.doc.source.reference,
        isInvoice ? undefined : (r.doc as PurchaseBill).supplier_reference,
      ),
  );

  const outstanding = rows.reduce((s, r) => s + r.outstanding, 0);
  const overdue = rows.filter((r) => r.status === "OVERDUE");
  const payments = isInvoice ? state.receipts : state.supplierPayments;
  const settledThisMonth = payments.filter((p) => monthKey(p.date) === monthKey(today)).reduce((s, p) => s + p.amount, 0);
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
      accessorFn: (r) => r.totals.total,
      cell: ({ row }) => <span className="tabular-nums">{fmtCurrency(row.original.totals.total)}</span>,
    },
    {
      accessorKey: "outstanding",
      header: "Balance due",
      align: "right",
      cell: ({ row }) => (
        <span className="tabular-nums font-medium">{row.original.outstanding ? fmtCurrency(row.original.outstanding) : "—"}</span>
      ),
    },
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
