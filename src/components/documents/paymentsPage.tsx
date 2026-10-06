"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FiDollarSign, FiPlus } from "react-icons/fi";
import { Button, PageHeader, compactInputClass } from "@/components/ui";
import StatCard from "@/components/statCard";
import DataTable, { type Column } from "@/components/dataTable";
import PaymentModal from "./paymentModal";
import { useJournalViewer } from "@/components/accounting/journalViewer";
import { useLedger } from "@/store/ledgerStore";
import type { Payment, PaymentMethod } from "@/models/accounting";
import { matchesSearch, useGlobalState } from "@/utils/globalStateContext";
import { BASE_CURRENCY, fmtCurrency, fmtDate, fmtMoney, fmtRate, humanize } from "@/utils/format";
import { monthKey, todayIso } from "@/utils/dates";

type Row = Payment & { party: string; document: string; account: string };

const METHOD_STYLE: Record<PaymentMethod, string> = {
  BANK_TRANSFER: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  MOBILE_MONEY: "bg-yellow-50 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  CASH: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  CHEQUE: "bg-neutral-100 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200",
};

const PaymentsPage = ({ kind }: { kind: "receipt" | "payment" }) => {
  const { state } = useLedger();
  const { openJournal } = useJournalViewer();
  const { searchQuery } = useGlobalState();
  const isReceipt = kind === "receipt";
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState("");
  const [month, setMonth] = useState("");
  const today = todayIso();

  const rows: Row[] = useMemo(() => {
    const parties = new Map((isReceipt ? state.customers : state.suppliers).map((p) => [p.id, p.name]));
    const docs = new Map((isReceipt ? state.invoices : state.bills).map((d) => [d.id, d.number]));
    const banks = new Map(state.bankAccounts.map((b) => [b.id, b.name]));
    return (isReceipt ? state.receipts : state.supplierPayments)
      .map((p) => ({
        ...p,
        party: parties.get(p.party_id) ?? "—",
        document: docs.get(p.document_id) ?? "—",
        account: banks.get(p.bank_account_id) ?? "—",
      }))
      .sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number));
  }, [state, isReceipt]);

  const months = [...new Set(rows.map((r) => monthKey(r.date)))];
  const filtered = rows.filter(
    (r) =>
      (!method || r.method === method) &&
      (!month || monthKey(r.date) === month) &&
      matchesSearch(searchQuery, r.number, r.party, r.document, r.reference),
  );
  const thisMonth = rows.filter((r) => monthKey(r.date) === monthKey(today));
  const lastMonth = rows.filter((r) => monthKey(r.date) === "2026-09");
  const total = (rs: Row[]) => rs.reduce((s, r) => s + r.base_amount, 0);
  const momoShare = rows.length ? Math.round((rows.filter((r) => r.method === "MOBILE_MONEY").length / rows.length) * 100) : 0;
  const docBase = isReceipt ? "/sales/invoices" : "/purchases/bills";

  const columns: Column<Row>[] = [
    { accessorKey: "number", header: isReceipt ? "Receipt" : "Payment", cell: ({ row }) => <span className="font-mono text-xs font-medium">{row.original.number}</span> },
    { accessorKey: "date", header: "Date", cell: ({ row }) => fmtDate(row.original.date) },
    { accessorKey: "party", header: isReceipt ? "Customer" : "Supplier", cell: ({ row }) => <span className="font-medium">{row.original.party}</span> },
    {
      accessorKey: "document",
      header: isReceipt ? "Invoice" : "Bill",
      cell: ({ row }) => (
        <Link href={`${docBase}?open=${row.original.document_id}`} className="font-mono text-xs text-brand-700 hover:underline dark:text-brand-300">
          {row.original.document}
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
    { accessorKey: "account", header: isReceipt ? "Deposited to" : "Paid from" },
    {
      accessorKey: "reference",
      header: "Reference",
      cell: ({ row }) => <span className="font-mono text-xs text-neutral-500">{row.original.reference ?? "—"}</span>,
    },
    {
      accessorKey: "amount",
      header: "Amount",
      align: "right",
      cell: ({ row }) => {
        const r = row.original;
        if (r.currency === BASE_CURRENCY) return <span className="font-medium tabular-nums">{fmtCurrency(r.amount)}</span>;
        return (
          <div className="tabular-nums">
            <p className="font-medium">{fmtMoney(r.amount, r.currency)}</p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {fmtCurrency(r.base_amount)} at {fmtRate(r.exchange_rate)}
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
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="This month" value={fmtCurrency(total(thisMonth))} sub={`${thisMonth.length} so far`} />
        <StatCard label="Last month" value={fmtCurrency(total(lastMonth))} sub={`${lastMonth.length} in September`} />
        <StatCard label="Year to date" value={fmtCurrency(total(rows))} sub={`${rows.length} in total`} />
        <StatCard label="Mobile money share" value={`${momoShare}%`} sub="Of all transactions by count" />
      </div>

      <div className="mb-4 flex flex-wrap justify-end gap-2">
        <select value={method} onChange={(e) => setMethod(e.target.value)} className={`${compactInputClass} w-44`}>
          <option value="">All methods</option>
          {(["BANK_TRANSFER", "MOBILE_MONEY", "CASH", "CHEQUE"] as PaymentMethod[]).map((m) => (
            <option key={m} value={m}>
              {humanize(m)}
            </option>
          ))}
        </select>
        <select value={month} onChange={(e) => setMonth(e.target.value)} className={`${compactInputClass} w-40`}>
          <option value="">All months</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {new Date(`${m}-01T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
            </option>
          ))}
        </select>
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        onRowClick={(r) => openJournal(r.journal_id)}
        emptyIcon={FiDollarSign}
        emptyTitle={`No ${isReceipt ? "receipts" : "payments"} match`}
        emptyDescription="Try another method or month."
        footer={
          filtered.length > 0 && (
            <tr>
              <td colSpan={7} className="px-6 py-3 text-sm font-semibold">
                Total ({filtered.length}) in GH₵
              </td>
              <td className="px-6 py-3 text-right text-sm font-semibold tabular-nums">{fmtCurrency(total(filtered))}</td>
            </tr>
          )
        }
      />
      <PaymentModal kind={kind} open={open} onClose={() => setOpen(false)} />
    </div>
  );
};

export default PaymentsPage;
