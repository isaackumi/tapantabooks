"use client";

import { useState } from "react";
import Link from "next/link";
import { FiCornerUpLeft, FiPlus, FiPrinter, FiSlash } from "react-icons/fi";
import { Button, DetailRow, PageHeader, compactInputClass } from "@/components/ui";
import StatCard from "@/components/statCard";
import DataTable, { serverPaging, type Column } from "@/components/dataTable";
import RightDrawer from "@/components/rightDrawer";
import { QueryError, QueryState, Skeleton } from "@/components/queryState";
import ReasonModal from "@/components/accounting/reasonModal";
import { useJournalViewer } from "@/components/accounting/journalViewer";
import CreditNoteModal from "./creditNoteModal";
import { useLedger } from "@/store/ledgerStore";
import { useDebouncedValue, usePagedList, useReport } from "@/services/useApiQuery";
import { lineAmount } from "@/lib/documents";
import type { CreditListItem, CreditStatistics } from "@/models/lists";
import { useGlobalState } from "@/utils/globalStateContext";
import { useQueryParam } from "@/utils/useQueryParam";
import { classNames, fmtCurrency, fmtDate, fmtDateTime, fmtMoney } from "@/utils/format";
import { monthName } from "@/utils/dates";

type Row = CreditListItem;

const CreditNotesPage = ({ kind }: { kind: "customer" | "supplier" }) => {
  const { state, actions } = useLedger();
  const { openJournal } = useJournalViewer();
  const { searchQuery } = useGlobalState();
  const isCustomer = kind === "customer";
  const [newOpen, setNewOpen] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);
  const [voidOpen, setVoidOpen] = useState(false);
  const [status, setStatus] = useState("");
  useQueryParam("open", setViewId);
  const docBase = isCustomer ? "/sales/invoices" : "/purchases/bills";
  const base = isCustomer ? "/credit-notes" : "/supplier-credits";
  const search = useDebouncedValue(searchQuery.trim());

  const list = usePagedList<Row>(`${base}/list`, { state: status, search });
  const stats = useReport<CreditStatistics>(`${base}/statistics`, {});
  const detail = useReport<Row>(viewId ? `${base}/get` : null, { [isCustomer ? "credit_note_id" : "supplier_credit_id"]: viewId ?? "" });
  const viewing = detail.data?.id === viewId ? detail.data : null;
  const filtered = !!status || !!search;

  const columns: Column<Row>[] = [
    {
      accessorKey: "number",
      header: isCustomer ? "Credit note" : "Credit",
      cell: ({ row }) => (
        <span className={classNames("font-mono text-xs font-medium", row.original.state === "VOID" && "line-through opacity-60")}>
          {row.original.number}
        </span>
      ),
    },
    { accessorKey: "date", header: "Date", cell: ({ row }) => fmtDate(row.original.date) },
    {
      accessorKey: "party_name",
      header: isCustomer ? "Customer" : "Supplier",
      cell: ({ row }) => (
        <p className="max-w-56 truncate font-medium" title={row.original.party_name}>
          {row.original.party_name || "—"}
        </p>
      ),
    },
    {
      accessorKey: "document_number",
      header: isCustomer ? "Invoice" : "Bill",
      cell: ({ row }) => (
        <Link
          href={`${docBase}?open=${row.original.document_id}`}
          onClick={(e) => e.stopPropagation()}
          className="font-mono text-xs text-brand-700 hover:underline dark:text-brand-300"
        >
          {row.original.document_number || "—"}
        </Link>
      ),
    },
    ...(isCustomer
      ? []
      : [
          {
            accessorKey: "supplier_reference",
            header: "Their ref.",
            cell: ({ row }) => <span className="font-mono text-xs text-neutral-500">{row.original.supplier_reference ?? "—"}</span>,
          } as Column<Row>,
        ]),
    {
      accessorKey: "reason",
      header: "Reason",
      cell: ({ row }) => (
        <p className="max-w-64 truncate text-neutral-600 dark:text-neutral-300" title={row.original.reason}>
          {row.original.reason}
        </p>
      ),
    },
    {
      accessorKey: "state",
      header: "Status",
      cell: ({ row }) =>
        row.original.state === "VOID" ? (
          <span className="rounded bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300">Void</span>
        ) : (
          <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
            {isCustomer ? "Issued" : "Recorded"}
          </span>
        ),
    },
    {
      accessorKey: "total",
      header: "Amount",
      align: "right",
      cell: ({ row }) => <span className="font-medium whitespace-nowrap tabular-nums">{fmtMoney(row.original.total, row.original.currency)}</span>,
    },
  ];

  return (
    <div>
      <PageHeader
        title={isCustomer ? "Credit notes" : "Supplier credits"}
        description={
          isCustomer
            ? "Credits issued to customers against invoices for returns, price corrections and agreed discounts. Each one reduces the invoice balance and reverses its revenue and VAT."
            : "Credit notes received from suppliers against bills. Each one reduces what you owe and reverses the cost and input VAT."
        }
        actions={
          <Button icon={FiPlus} onClick={() => setNewOpen(true)}>
            {isCustomer ? "Issue credit note" : "Record supplier credit"}
          </Button>
        }
      />

      <QueryState query={stats} skeleton={<Skeleton rows={2} />} className="mb-6">
        {(st) => (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="This month"
              value={fmtCurrency(st.this_month.total)}
              sub={`${st.this_month.count} ${isCustomer ? "issued" : "recorded"} in ${monthName(st.this_month.month)}`}
            />
            <StatCard
              label="Year to date"
              value={fmtCurrency(st.year_to_date.total)}
              sub={`${st.year_to_date.count} since ${fmtDate(st.year_to_date.from_date)}`}
            />
            <StatCard
              label={isCustomer ? "Output VAT reversed" : "Input VAT reversed"}
              value={fmtCurrency(st.year_to_date.tax)}
              sub="Year to date; flows into the VAT return"
            />
            <StatCard label="Voided" value={String(st.state_counts.VOID)} sub="Reversed in the ledger" />
          </div>
        )}
      </QueryState>

      <div className="mb-4 flex justify-end">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${compactInputClass} w-40`} aria-label="Status">
          <option value="">All statuses</option>
          <option value="APPROVED">{isCustomer ? "Issued" : "Recorded"}</option>
          <option value="VOID">Void</option>
        </select>
      </div>

      <QueryState query={list} skeleton={<Skeleton rows={10} />}>
        {() => (
          <DataTable
            columns={columns}
            data={list.items}
            server={serverPaging(list)}
            dense
            nowrap
            onRowClick={(r) => setViewId(r.id)}
            emptyIcon={FiCornerUpLeft}
            emptyTitle={filtered ? "Nothing matches" : isCustomer ? "No credit notes" : "No supplier credits"}
            emptyDescription={
              filtered
                ? "Try another status or clear the search."
                : isCustomer
                  ? "Issue one from an invoice, or with the button above."
                  : "Record one from a bill, or with the button above."
            }
          />
        )}
      </QueryState>

      <RightDrawer
        open={!!viewId}
        onClose={() => setViewId(null)}
        widthClass="max-w-2xl"
        title={viewing ? <span className="font-mono">{viewing.number}</span> : <span className="text-neutral-400">{isCustomer ? "Credit note" : "Supplier credit"}</span>}
        subtitle={viewing?.party_name}
        footer={
          viewing && (
            <div className="flex items-center justify-end gap-2">
              {viewing.state === "APPROVED" && (
                <Button variant="ghost" icon={FiSlash} className="mr-auto text-red-600" onClick={() => setVoidOpen(true)}>
                  Void
                </Button>
              )}
              <Button variant="secondary" icon={FiPrinter} onClick={() => window.print()}>
                Print
              </Button>
            </div>
          )
        }
      >
        {!viewing &&
          (detail.error && !detail.loading ? <QueryError message={detail.error} onRetry={detail.refetch} /> : <Skeleton rows={6} />)}
        {viewing && (
          <div className="space-y-5">
            {viewing.state === "VOID" && (
              <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
                Voided. Its ledger entry was reversed and {viewing.document_number} is owed again.
              </p>
            )}
            <div className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 px-4 py-1 dark:divide-neutral-700 dark:border-neutral-700">
              <DetailRow label={isCustomer ? "Against invoice" : "Against bill"}>
                <Link href={`${docBase}?open=${viewing.document_id}`} className="font-mono text-brand-700 hover:underline dark:text-brand-300">
                  {viewing.document_number}
                </Link>
              </DetailRow>
              {!isCustomer && <DetailRow label="Supplier's credit no.">{viewing.supplier_reference ?? "—"}</DetailRow>}
              <DetailRow label="Date">{fmtDate(viewing.date)}</DetailRow>
              <DetailRow label="Reason">{viewing.reason}</DetailRow>
              <DetailRow label="Ledger entry">
                {viewing.journal_id ? (
                  <button onClick={() => openJournal(viewing.journal_id!)} className="font-mono text-brand-700 hover:underline dark:text-brand-300">
                    {viewing.journal_number ?? "View"}
                  </button>
                ) : (
                  "—"
                )}
              </DetailRow>
            </div>
            <div className="overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-700">
              <table className="min-w-full text-sm">
                <thead className="bg-neutral-50 text-neutral-500 dark:bg-neutral-900/40">
                  <tr>
                    <th className="px-4 py-2 text-left font-normal">Item</th>
                    <th className="px-4 py-2 text-right font-normal">Qty</th>
                    <th className="px-4 py-2 text-right font-normal">Price</th>
                    <th className="px-4 py-2 text-right font-normal">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700">
                  {viewing.lines.map((l) => (
                    <tr key={l.id}>
                      <td className="px-4 py-2.5">
                        <p className="font-medium">{l.description}</p>
                        <p className="text-xs text-neutral-500">
                          {state.accounts.find((a) => a.id === l.account_id)?.name} · {state.taxCodes.find((t) => t.id === l.tax_code_id)?.code}
                        </p>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{l.quantity}</td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap tabular-nums">{fmtMoney(l.unit_price, viewing.currency)}</td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap tabular-nums">{fmtMoney(lineAmount(l), viewing.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <dl className="space-y-1 border-t border-neutral-200 bg-neutral-50 px-4 py-3 text-sm dark:border-neutral-700 dark:bg-neutral-900/40">
                <div className="flex justify-between">
                  <dt className="text-neutral-500">Subtotal</dt>
                  <dd className="tabular-nums">{fmtMoney(viewing.subtotal, viewing.currency)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-neutral-500">Tax</dt>
                  <dd className="tabular-nums">{fmtMoney(viewing.tax, viewing.currency)}</dd>
                </div>
                <div className="flex justify-between font-semibold">
                  <dt>Total credited</dt>
                  <dd className="tabular-nums">{fmtMoney(viewing.total, viewing.currency)}</dd>
                </div>
              </dl>
            </div>
            <p className="text-xs text-neutral-500">
              Created by {viewing.created_by ?? "—"} · {fmtDateTime(viewing.created_at)}
            </p>
          </div>
        )}
      </RightDrawer>

      <CreditNoteModal kind={kind} open={newOpen} onClose={() => setNewOpen(false)} />
      {viewing && (
        <ReasonModal
          open={voidOpen}
          onClose={() => setVoidOpen(false)}
          danger
          title={`Void ${viewing.number}`}
          description={`Posts a reversing entry dated today and puts ${fmtMoney(viewing.total, viewing.currency)} back on ${viewing.document_number}.`}
          confirmLabel="Void credit"
          placeholder="e.g. Raised against the wrong invoice"
          onConfirm={(reason) => actions.voidCreditNote(kind, viewing.id, reason)}
        />
      )}
    </div>
  );
};

export default CreditNotesPage;
