"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FiEdit2, FiPlus, FiUsers } from "react-icons/fi";
import { Button, DetailRow, PageHeader } from "@/components/ui";
import { Tabs } from "@/components/tabs";
import StatCard from "@/components/statCard";
import StatusBadge from "@/components/statusBadge";
import SourceBadge from "@/components/sourceBadge";
import RightDrawer from "@/components/rightDrawer";
import DataTable, { type Column } from "@/components/dataTable";
import PartyFormModal from "./partyFormModal";
import DocumentFormModal from "./documentFormModal";
import { useLedger } from "@/store/ledgerStore";
import { billRows, invoiceRows, outstandingByParty } from "@/store/selectors";
import type { Party } from "@/models/accounting";
import { matchesSearch, useGlobalState } from "@/utils/globalStateContext";
import { useQueryParam } from "@/utils/useQueryParam";
import { fmtCurrency, fmtDate, fmtDateTime, humanize } from "@/utils/format";

type Row = Party & { outstanding: number; overdue: number; open: number };

const PartiesPage = ({ kind }: { kind: "customer" | "supplier" }) => {
  const { state } = useLedger();
  const { searchQuery } = useGlobalState();
  const isCustomer = kind === "customer";
  const [tab, setTab] = useState("ALL");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Party | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [docOpen, setDocOpen] = useState(false);
  useQueryParam("open", setViewId);

  const docs = useMemo(() => (isCustomer ? invoiceRows(state) : billRows(state)), [state, isCustomer]);
  const balances = useMemo(
    () =>
      isCustomer
        ? outstandingByParty(invoiceRows(state), (d) => d.customer_id)
        : outstandingByParty(billRows(state), (d) => d.supplier_id),
    [state, isCustomer],
  );
  const parties = isCustomer ? state.customers : state.suppliers;
  const rows: Row[] = parties.map((p) => ({ ...p, ...(balances.get(p.id) ?? { outstanding: 0, overdue: 0, open: 0 }) }));

  const filtered = rows
    .filter((r) =>
      tab === "ALL"
        ? r.status === "ACTIVE"
        : tab === "BALANCE"
          ? r.outstanding > 0
          : tab === "OVERDUE"
            ? r.overdue > 0
            : r.status === "INACTIVE",
    )
    .filter((r) => matchesSearch(searchQuery, r.code, r.name, r.email, r.city, r.tin, r.external_reference));

  const totalOutstanding = rows.reduce((s, r) => s + r.outstanding, 0);
  const totalOverdue = rows.reduce((s, r) => s + r.overdue, 0);
  const synced = rows.filter((r) => r.source !== "MANUAL").length;
  const viewing = rows.find((r) => r.id === viewId);
  const label = isCustomer ? "customer" : "supplier";
  const docBase = isCustomer ? "/sales/invoices" : "/purchases/bills";

  const columns: Column<Row>[] = [
    { accessorKey: "code", header: "Code", cell: ({ row }) => <span className="font-mono text-xs">{row.original.code}</span> },
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.original.name}</p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">{row.original.email || row.original.phone}</p>
        </div>
      ),
    },
    { accessorKey: "city", header: "City" },
    { accessorKey: "payment_terms_days", header: "Terms", cell: ({ row }) => `${row.original.payment_terms_days} days` },
    {
      accessorKey: "outstanding",
      header: "Outstanding",
      align: "right",
      cell: ({ row }) => <span className="tabular-nums">{row.original.outstanding ? fmtCurrency(row.original.outstanding) : "—"}</span>,
    },
    {
      accessorKey: "overdue",
      header: "Overdue",
      align: "right",
      cell: ({ row }) => (
        <span className={`tabular-nums ${row.original.overdue ? "font-medium text-orange-600 dark:text-orange-400" : ""}`}>
          {row.original.overdue ? fmtCurrency(row.original.overdue) : "—"}
        </span>
      ),
    },
    {
      id: "source",
      header: "Source",
      accessorFn: (r) => r.source,
      cell: ({ row }) => <SourceBadge type={row.original.source} />,
    },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
  ];

  return (
    <div>
      <PageHeader
        title={isCustomer ? "Customers" : "Suppliers"}
        description={
          isCustomer
            ? "Who you sell to. Balances come from approved invoices less receipts."
            : "Who you buy from. Balances come from approved bills less payments."
        }
        actions={
          <Button
            icon={FiPlus}
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            New {label}
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={`Active ${label}s`} value={rows.filter((r) => r.status === "ACTIVE").length} sub={`${rows.length} in total`} />
        <StatCard label={isCustomer ? "Owed to you" : "You owe"} value={fmtCurrency(totalOutstanding)} sub={`${rows.filter((r) => r.outstanding > 0).length} with a balance`} />
        <StatCard label="Overdue" value={fmtCurrency(totalOverdue)} tone={totalOverdue ? "warning" : "default"} sub={`${rows.filter((r) => r.overdue > 0).length} ${label}s`} />
        <StatCard
          label="Synced from other systems"
          value={synced}
          sub="Store Management, QuickBooks, imports"
          info={`${label[0].toUpperCase() + label.slice(1)}s created by an integration keep their external reference so updates match the same record.`}
        />
      </div>

      <Tabs
        tabs={[
          { id: "ALL", label: "Active", count: rows.filter((r) => r.status === "ACTIVE").length },
          { id: "BALANCE", label: "With balance", count: rows.filter((r) => r.outstanding > 0).length },
          { id: "OVERDUE", label: "Overdue", count: rows.filter((r) => r.overdue > 0).length },
          { id: "INACTIVE", label: "Inactive", count: rows.filter((r) => r.status === "INACTIVE").length },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div className="mt-4">
        <DataTable
          columns={columns}
          data={filtered}
          onRowClick={(r) => setViewId(r.id)}
          emptyIcon={FiUsers}
          emptyTitle={`No ${label}s here`}
          emptyDescription="Try another tab or clear the search."
        />
      </div>

      <RightDrawer
        open={!!viewing}
        onClose={() => setViewId(null)}
        widthClass="max-w-xl"
        title={viewing?.name}
        subtitle={viewing && `${viewing.code} · ${viewing.city}`}
        footer={
          viewing && (
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                icon={FiEdit2}
                onClick={() => {
                  setEditing(viewing);
                  setFormOpen(true);
                }}
              >
                Edit
              </Button>
              {viewing.status === "ACTIVE" && (
                <Button icon={FiPlus} onClick={() => setDocOpen(true)}>
                  New {isCustomer ? "invoice" : "bill"}
                </Button>
              )}
            </div>
          )
        }
      >
        {viewing && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-brand-50 p-3 dark:bg-brand-900/20">
                <p className="text-xs text-brand-700 dark:text-brand-300">Outstanding</p>
                <p className="mt-0.5 font-semibold tabular-nums">{fmtCurrency(viewing.outstanding)}</p>
              </div>
              <div className="rounded-xl bg-orange-50 p-3 dark:bg-orange-900/20">
                <p className="text-xs text-orange-700 dark:text-orange-300">Overdue</p>
                <p className="mt-0.5 font-semibold tabular-nums">{fmtCurrency(viewing.overdue)}</p>
              </div>
            </div>
            {viewing.credit_limit > 0 && isCustomer && (
              <div>
                <div className="mb-1 flex justify-between text-xs text-neutral-500">
                  <span>Credit used</span>
                  <span>
                    {fmtCurrency(viewing.outstanding)} of {fmtCurrency(viewing.credit_limit)}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-neutral-100 dark:bg-neutral-700">
                  <div
                    className={`h-2 rounded-full ${viewing.outstanding > viewing.credit_limit ? "bg-red-500" : "bg-brand-500"}`}
                    style={{ width: `${Math.min(100, (viewing.outstanding / viewing.credit_limit) * 100)}%` }}
                  />
                </div>
              </div>
            )}
            <div className="rounded-xl border border-neutral-200 px-4 py-1 divide-y divide-neutral-100 dark:border-neutral-700 dark:divide-neutral-700">
              <DetailRow label="Email">{viewing.email || "—"}</DetailRow>
              <DetailRow label="Phone">{viewing.phone || "—"}</DetailRow>
              <DetailRow label="TIN">{viewing.tin || "—"}</DetailRow>
              <DetailRow label="Payment terms">{viewing.payment_terms_days} days</DetailRow>
              <DetailRow label="Source">
                <SourceBadge type={viewing.source} reference={viewing.external_reference ?? undefined} />
              </DetailRow>
              <DetailRow label="Status">
                <StatusBadge status={viewing.status} />
              </DetailRow>
            </div>
            {viewing.custom_fields && Object.keys(viewing.custom_fields).length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-semibold">Custom fields</h4>
                <div className="rounded-xl border border-neutral-200 px-4 py-1 divide-y divide-neutral-100 dark:border-neutral-700 dark:divide-neutral-700">
                  {Object.entries(viewing.custom_fields).map(([k, v]) => (
                    <DetailRow key={k} label={state.customFields.find((f) => f.key === k)?.label ?? humanize(k)}>
                      {v}
                    </DetailRow>
                  ))}
                </div>
              </div>
            )}
            <div>
              <h4 className="mb-2 text-sm font-semibold">Recent {isCustomer ? "invoices" : "bills"}</h4>
              <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 dark:divide-neutral-700 dark:border-neutral-700">
                {docs
                  .filter((d) => d.party?.id === viewing.id)
                  .slice(0, 6)
                  .map((d) => (
                    <li key={d.doc.id}>
                      <Link href={`${docBase}?open=${d.doc.id}`} className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-700/40">
                        <span>
                          <span className="font-mono text-xs">{d.doc.number}</span>
                          <span className="ml-2 text-neutral-500">{fmtDate(d.doc.issue_date)}</span>
                        </span>
                        <span className="flex items-center gap-3">
                          <span className="tabular-nums">{fmtCurrency(d.totals.total)}</span>
                          <StatusBadge status={d.status} />
                        </span>
                      </Link>
                    </li>
                  ))}
                {docs.every((d) => d.party?.id !== viewing.id) && (
                  <li className="px-4 py-3 text-sm text-neutral-500">None yet.</li>
                )}
              </ul>
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Created by {viewing.created_by ?? "—"} · {fmtDateTime(viewing.created_at)} · Updated by {viewing.updated_by ?? "—"} ·{" "}
              {fmtDateTime(viewing.updated_at)}
            </p>
          </div>
        )}
      </RightDrawer>

      <PartyFormModal kind={kind} open={formOpen} onClose={() => setFormOpen(false)} party={editing} />
      <DocumentFormModal
        kind={isCustomer ? "invoice" : "bill"}
        open={docOpen}
        onClose={() => setDocOpen(false)}
        defaultPartyId={viewing?.id}
      />
    </div>
  );
};

export default PartiesPage;
