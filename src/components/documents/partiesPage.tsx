"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { FiDownload, FiEdit2, FiFileText, FiPlus, FiUsers } from "react-icons/fi";
import { Button, DetailRow, PageHeader } from "@/components/ui";
import { Tabs } from "@/components/tabs";
import StatCard from "@/components/statCard";
import StatusBadge from "@/components/statusBadge";
import SourceBadge from "@/components/sourceBadge";
import RightDrawer from "@/components/rightDrawer";
import DataTable, { type Column } from "@/components/dataTable";
import PartyFormModal from "./partyFormModal";
import DocumentFormModal from "./documentFormModal";
import { QueryError, Skeleton } from "@/components/queryState";
import { useLedger } from "@/store/ledgerStore";
import { useReport } from "@/services/useApiQuery";
import type { ListData } from "@/core/apiClient";
import type { Party } from "@/models/accounting";
import type { DocumentListItem, PartyBalance, PartyBalances } from "@/models/lists";
import { matchesSearch, useGlobalState } from "@/utils/globalStateContext";
import { useQueryParam } from "@/utils/useQueryParam";
import { BASE_CURRENCY, fmtCurrency, fmtDate, fmtDateTime, fmtMoney } from "@/utils/format";
import { downloadCsv } from "@/utils/csv";
import { todayIso } from "@/utils/dates";
import {
  CustomFieldDetails,
  CustomFieldFilters,
  EditCustomFieldsModal,
  customCsvHeaders,
  customCsvValues,
  customFieldColumns,
  customSearchText,
  matchesCustomFilters,
  useEntityFields,
} from "@/components/customFields";

type Row = Party & Omit<PartyBalance, "party_id">;

const NO_BALANCE: Omit<PartyBalance, "party_id"> = { outstanding: 0, overdue: 0, open_count: 0, outstanding_fc: 0 };
const RECENT_DOCUMENTS = 6;

const PartiesPage = ({ kind }: { kind: "customer" | "supplier" }) => {
  const { state } = useLedger();
  const { searchQuery } = useGlobalState();
  const isCustomer = kind === "customer";
  const [tab, setTab] = useState("ALL");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Party | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [docOpen, setDocOpen] = useState(false);
  const [editCustom, setEditCustom] = useState(false);
  const [cfFilters, setCfFilters] = useState<Record<string, string>>({});
  useQueryParam("open", setViewId);
  const entity = isCustomer ? "Customer" : "Supplier";
  const fields = useEntityFields(entity);

  const balancesQuery = useReport<PartyBalances>(isCustomer ? "/customers/balances" : "/suppliers/balances", {});
  const balances = useMemo(() => new Map((balancesQuery.data?.items ?? []).map((b) => [b.party_id, b])), [balancesQuery.data]);
  const balancesReady = !!balancesQuery.data;
  const parties = isCustomer ? state.customers : state.suppliers;
  const rows: Row[] = parties.map((p) => {
    const b = balances.get(p.id) ?? NO_BALANCE;
    return { ...p, outstanding: b.outstanding, overdue: b.overdue, open_count: b.open_count, outstanding_fc: b.outstanding_fc };
  });

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
    .filter((r) => matchesCustomFilters(r.custom_fields, cfFilters))
    .filter((r) =>
      matchesSearch(searchQuery, r.code, r.name, r.email, r.city, r.tin, r.external_reference, r.currency, customSearchText(r.custom_fields)),
    );

  const exportCsv = () =>
    downloadCsv(`${label}s-${todayIso()}.csv`, [
      ["Code", "Name", "Email", "Phone", "City", "TIN", "Currency", "Terms (days)", "Outstanding (GHS)", "Overdue (GHS)", "Status", ...customCsvHeaders(fields)],
      ...filtered.map((r) => [
        r.code,
        r.name,
        r.email,
        r.phone,
        r.city,
        r.tin,
        r.currency,
        r.payment_terms_days,
        r.outstanding,
        r.overdue,
        r.status,
        ...customCsvValues(fields, r.custom_fields),
      ]),
    ]);

  const totals = balancesQuery.data?.totals;
  const synced = rows.filter((r) => r.source !== "MANUAL").length;
  const viewing = rows.find((r) => r.id === viewId);
  const label = isCustomer ? "customer" : "supplier";
  const docBase = isCustomer ? "/sales/invoices" : "/purchases/bills";
  const recent = useReport<ListData<DocumentListItem>>(viewing ? (isCustomer ? "/invoices/list" : "/bills/list") : null, {
    [isCustomer ? "customer_id" : "supplier_id"]: viewing?.id ?? "",
    size: RECENT_DOCUMENTS,
  });
  const recentDocs = (recent.data?.items ?? []).filter((d) => ("customer_id" in d ? d.customer_id : d.supplier_id) === viewing?.id);
  const balanceCell = (v: number, node: ReactNode) =>
    balancesQuery.error ? <span className="text-xs text-red-600">Unavailable</span> : !balancesReady ? <span className="text-neutral-300">…</span> : v ? node : "—";

  const columns: Column<Row>[] = [
    { accessorKey: "code", header: "Code", cell: ({ row }) => <span className="font-mono text-xs">{row.original.code}</span> },
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <div>
          <p className="flex items-center gap-1.5 font-medium">
            {row.original.name}
            {row.original.currency !== BASE_CURRENCY && (
              <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                {row.original.currency}
              </span>
            )}
          </p>
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
      cell: ({ row }) =>
        balanceCell(
          row.original.outstanding,
          <div className="whitespace-nowrap tabular-nums">
            <p>{fmtCurrency(row.original.outstanding)}</p>
            {row.original.outstanding_fc > 0 && (
              <p className="text-xs text-neutral-500 dark:text-neutral-400">{fmtMoney(row.original.outstanding_fc, row.original.currency)}</p>
            )}
          </div>,
        ),
    },
    {
      accessorKey: "overdue",
      header: "Overdue",
      align: "right",
      cell: ({ row }) =>
        balanceCell(
          row.original.overdue,
          <span className="font-medium whitespace-nowrap tabular-nums text-orange-600 dark:text-orange-400">{fmtCurrency(row.original.overdue)}</span>,
        ),
    },
    {
      id: "source",
      header: "Source",
      accessorFn: (r) => r.source,
      cell: ({ row }) => <SourceBadge type={row.original.source} />,
    },
    ...customFieldColumns<Row>(fields, (r) => r.custom_fields),
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
          <>
            <Button variant="secondary" icon={FiDownload} onClick={exportCsv}>
              Export
            </Button>
            <Button
              icon={FiPlus}
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              New {label}
            </Button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" data-tour="stats">
        <StatCard label={`Active ${label}s`} value={rows.filter((r) => r.status === "ACTIVE").length} sub={`${rows.length} in total`} />
        <StatCard
          label={isCustomer ? "Owed to you" : "You owe"}
          value={totals ? fmtCurrency(totals.outstanding) : balancesQuery.error ? "—" : "…"}
          sub={totals ? `${totals.with_balance_count} with a balance` : (balancesQuery.error ?? "Loading balances")}
        />
        <StatCard
          label="Overdue"
          value={totals ? fmtCurrency(totals.overdue) : balancesQuery.error ? "—" : "…"}
          tone={totals?.overdue ? "warning" : "default"}
          sub={totals ? `${totals.overdue_count} ${label}s` : undefined}
        />
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
          { id: "BALANCE", label: "With balance", count: totals?.with_balance_count },
          { id: "OVERDUE", label: "Overdue", count: totals?.overdue_count },
          { id: "INACTIVE", label: "Inactive", count: rows.filter((r) => r.status === "INACTIVE").length },
        ]}
        value={tab}
        onChange={setTab}
        actions={<CustomFieldFilters fields={fields} value={cfFilters} onChange={setCfFilters} />}
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
              <Link
                href={`/reports/statements?kind=${kind}&party=${viewing.id}`}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700"
              >
                <FiFileText className="h-4 w-4" />
                Statement
              </Link>
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
                {viewing.outstanding_fc > 0 && (
                  <p className="text-xs tabular-nums text-brand-700/80 dark:text-brand-300/80">
                    incl. {fmtMoney(viewing.outstanding_fc, viewing.currency)} at booking rates
                  </p>
                )}
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
              <DetailRow label="Default currency">{viewing.currency}</DetailRow>
              <DetailRow label="Source">
                <SourceBadge type={viewing.source} reference={viewing.external_reference ?? undefined} />
              </DetailRow>
              <DetailRow label="Status">
                <StatusBadge status={viewing.status} />
              </DetailRow>
            </div>
            <CustomFieldDetails entity={entity} values={viewing.custom_fields} onEdit={() => setEditCustom(true)} />
            <div>
              <h4 className="mb-2 text-sm font-semibold">Recent {isCustomer ? "invoices" : "bills"}</h4>
              {recent.error && !recent.loading ? (
                <QueryError message={recent.error} onRetry={recent.refetch} />
              ) : !recent.data || (recent.loading && recentDocs.length === 0) ? (
                <Skeleton rows={3} />
              ) : (
                <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 dark:divide-neutral-700 dark:border-neutral-700">
                  {recentDocs.map((d) => (
                    <li key={d.id}>
                      <Link href={`${docBase}?open=${d.id}`} className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-700/40">
                        <span>
                          <span className="font-mono text-xs">{d.number}</span>
                          <span className="ml-2 text-neutral-500">{fmtDate(d.issue_date)}</span>
                        </span>
                        <span className="flex items-center gap-3">
                          <span className="whitespace-nowrap tabular-nums">{fmtMoney(d.total, d.currency)}</span>
                          <StatusBadge status={d.status} />
                        </span>
                      </Link>
                    </li>
                  ))}
                  {recentDocs.length === 0 && <li className="px-4 py-3 text-sm text-neutral-500">None yet.</li>}
                </ul>
              )}
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Created by {viewing.created_by ?? "—"} · {fmtDateTime(viewing.created_at)} · Updated by {viewing.updated_by ?? "—"} ·{" "}
              {fmtDateTime(viewing.updated_at)}
            </p>
          </div>
        )}
      </RightDrawer>

      {viewing && (
        <EditCustomFieldsModal
          entity={entity}
          recordId={viewing.id}
          recordLabel={viewing.name}
          values={viewing.custom_fields}
          open={editCustom}
          onClose={() => setEditCustom(false)}
        />
      )}
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
