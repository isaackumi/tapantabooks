"use client";

import { useState } from "react";
import Link from "next/link";
import { FiDollarSign, FiPlus } from "react-icons/fi";
import { Button, PageHeader, filterInputClass } from "@/components/ui";
import StatCard from "@/components/statCard";
import DataTable, { serverPaging, type Column } from "@/components/dataTable";
import { QueryState, Skeleton } from "@/components/queryState";
import PaymentModal from "./paymentModal";
import { useJournalViewer } from "@/components/accounting/journalViewer";
import type { PaymentMethod } from "@/models/accounting";
import type { PaymentListData, PaymentListItem, PaymentStatistics } from "@/models/lists";
import { useDebouncedValue, usePagedList, useReport } from "@/services/useApiQuery";
import { useGlobalState } from "@/utils/globalStateContext";
import { BASE_CURRENCY, fmtCurrency, fmtDate, fmtMoney, fmtRate, humanize } from "@/utils/format";
import { endOfMonth, monthName } from "@/utils/dates";

type Row = PaymentListItem;

const METHODS: PaymentMethod[] = ["BANK_TRANSFER", "MOBILE_MONEY", "CASH", "CHEQUE"];

const METHOD_STYLE: Record<PaymentMethod, string> = {
  BANK_TRANSFER: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  MOBILE_MONEY: "bg-yellow-50 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  CASH: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  CHEQUE: "bg-neutral-100 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200",
};

const PaymentsPage = ({ kind }: { kind: "receipt" | "payment" }) => {
  const { openJournal } = useJournalViewer();
  const { searchQuery } = useGlobalState();
  const isReceipt = kind === "receipt";
  const base = isReceipt ? "/receipts" : "/supplier-payments";
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState("");
  const [month, setMonth] = useState("");
  const search = useDebouncedValue(searchQuery.trim());

  const list = usePagedList<Row, PaymentListData>(`${base}/list`, {
    method,
    from_date: month ? `${month}-01` : "",
    to_date: month ? endOfMonth(month) : "",
    search,
  });
  const stats = useReport<PaymentStatistics>(`${base}/statistics`, {});
  const docBase = isReceipt ? "/sales/invoices" : "/purchases/bills";
  const filtered = !!method || !!month || !!search;

  const columns: Column<Row>[] = [
    { accessorKey: "number", header: isReceipt ? "Receipt" : "Payment", cell: ({ row }) => <span className="font-mono text-xs font-medium">{row.original.number}</span> },
    { accessorKey: "date", header: "Date", cell: ({ row }) => fmtDate(row.original.date) },
    {
      accessorKey: "party_name",
      header: isReceipt ? "Customer" : "Supplier",
      cell: ({ row }) => (
        <p className="max-w-56 truncate font-medium" title={row.original.party_name}>{row.original.party_name || "—"}</p>
      ),
    },
    {
      accessorKey: "document_number",
      header: isReceipt ? "Invoice" : "Bill",
      cell: ({ row }) => (
        <Link href={`${docBase}?open=${row.original.document_id}`} className="font-mono text-xs text-brand-700 hover:underline dark:text-brand-300">
          {row.original.document_number || "—"}
        </Link>
      ),
    },
    {
      accessorKey: "method",
      header: "Method",
      cell: ({ row }) => (
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${METHOD_STYLE[row.original.method]}`}>{humanize(row.original.method)}</span>
      ),
    },
    {
      accessorKey: "bank_account_name",
      header: isReceipt ? "Deposited to" : "Paid from",
      cell: ({ row }) => (
        <div className="max-w-48">
          <p className="truncate" title={row.original.bank_account_name}>{row.original.bank_account_name || "—"}</p>
          {row.original.reference && <p className="font-mono text-xs text-neutral-500">{row.original.reference}</p>}
        </div>
      ),
    },
    {
      accessorKey: "base_amount",
      header: "Amount",
      align: "right",
      cell: ({ row }) => {
        const r = row.original;
        if (r.currency === BASE_CURRENCY) return <span className="font-medium tabular-nums">{fmtCurrency(r.amount)}</span>;
        return (
          <div className="tabular-nums">
            <p className="font-medium">{fmtMoney(r.amount, r.currency)}</p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400" title={`Rate ${fmtRate(r.exchange_rate)}`}>
              {fmtCurrency(r.base_amount)} @ {fmtRate(r.exchange_rate)}
            </p>
            {r.fx_gain_loss !== 0 && (
              <p className={`text-xs ${r.fx_gain_loss > 0 ? "text-emerald-600" : "text-red-600"}`}>
                FX {r.fx_gain_loss > 0 ? "gain" : "loss"} {fmtCurrency(Math.abs(r.fx_gain_loss))}
              </p>
            )}
          </div>
        );
      },
    },
  ];

  const totals = list.data?.totals;

  return (
    <div>
      <PageHeader
        title={isReceipt ? "Receipts" : "Supplier payments"}
        description={
          isReceipt
            ? "Money received from customers against invoices. Click a row to see the ledger entry."
            : "Money paid to suppliers against bills. Click a row to see the ledger entry."
        }
        actions={
          <Button icon={FiPlus} onClick={() => setOpen(true)}>
            {isReceipt ? "Record receipt" : "Record payment"}
          </Button>
        }
      />

      <QueryState query={stats} skeleton={<Skeleton rows={2} />} className="mb-6">
        {(st) => (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="This month" value={fmtCurrency(st.this_month.total)} sub={`${st.this_month.count} so far in ${monthName(st.this_month.month).split(" ")[0]}`} />
            <StatCard label="Last month" value={fmtCurrency(st.last_month.total)} sub={`${st.last_month.count} in ${monthName(st.last_month.month)}`} />
            <StatCard label="Year to date" value={fmtCurrency(st.year_to_date.total)} sub={`${st.year_to_date.count} since ${fmtDate(st.year_to_date.from_date)}`} />
            <StatCard label="Mobile money share" value={`${st.mobile_money_share_pct}%`} sub="Of all transactions by count" />
          </div>
        )}
      </QueryState>

      <div className="mb-4 flex flex-wrap justify-end gap-2">
        <select value={method} onChange={(e) => setMethod(e.target.value)} className={`${filterInputClass} w-44`} aria-label="Method">
          <option value="">All methods</option>
          {METHODS.map((m) => (
            <option key={m} value={m}>
              {humanize(m)}
            </option>
          ))}
        </select>
        <select value={month} onChange={(e) => setMonth(e.target.value)} className={`${filterInputClass} w-48`} aria-label="Month">
          <option value="">All months</option>
          {(stats.data?.months ?? []).map((m) => (
            <option key={m} value={m}>
              {monthName(m)}
            </option>
          ))}
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
            onRowClick={(r) => openJournal(r.journal_id)}
            emptyIcon={FiDollarSign}
            emptyTitle={filtered ? `No ${isReceipt ? "receipts" : "payments"} match` : `No ${isReceipt ? "receipts" : "payments"} yet`}
            emptyDescription={filtered ? "Try another method or month, or clear the search." : `Record a ${isReceipt ? "receipt against an invoice" : "payment against a bill"} to see it here.`}
            footer={
              totals && totals.count > 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-2.5 text-sm font-semibold">
                    Total ({totals.count}) in {BASE_CURRENCY}
                  </td>
                  <td className="px-3 py-2.5 text-right text-sm font-semibold whitespace-nowrap tabular-nums">{fmtCurrency(totals.base_amount)}</td>
                </tr>
              )
            }
          />
        )}
      </QueryState>
      <PaymentModal kind={kind} open={open} onClose={() => setOpen(false)} />
    </div>
  );
};

export default PaymentsPage;
