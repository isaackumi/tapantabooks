"use client";

import { useState } from "react";
import Link from "next/link";
import { FiDollarSign, FiPlus, FiSlash } from "react-icons/fi";
import { Button, DetailRow, PageHeader, filterInputClass } from "@/components/ui";
import StatCard from "@/components/statCard";
import DataTable, { serverPaging, type Column } from "@/components/dataTable";
import RightDrawer from "@/components/rightDrawer";
import { QueryError, QueryState, Skeleton } from "@/components/queryState";
import ReasonModal from "@/components/accounting/reasonModal";
import PaymentModal from "./paymentModal";
import { useJournalViewer } from "@/components/accounting/journalViewer";
import type { PaymentMethod } from "@/models/accounting";
import type { PaymentDetail, PaymentListData, PaymentListItem, PaymentStatistics } from "@/models/lists";
import { useLedger } from "@/store/ledgerStore";
import { useDebouncedValue, usePagedList, useReport } from "@/services/useApiQuery";
import { useGlobalState } from "@/utils/globalStateContext";
import { useQueryParam } from "@/utils/useQueryParam";
import { BASE_CURRENCY, classNames, fmtCurrency, fmtDate, fmtDateTime, fmtMoney, fmtRate, humanize } from "@/utils/format";
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
  const { actions } = useLedger();
  const { openJournal } = useJournalViewer();
  const { searchQuery } = useGlobalState();
  const isReceipt = kind === "receipt";
  const base = isReceipt ? "/receipts" : "/supplier-payments";
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState("");
  const [month, setMonth] = useState("");
  const [status, setStatus] = useState("");
  const [viewId, setViewId] = useState<string | null>(null);
  const [voidOpen, setVoidOpen] = useState(false);
  useQueryParam("open", setViewId);
  const search = useDebouncedValue(searchQuery.trim());

  const list = usePagedList<Row, PaymentListData>(`${base}/list`, {
    method,
    state: status,
    from_date: month ? `${month}-01` : "",
    to_date: month ? endOfMonth(month) : "",
    search,
  });
  const stats = useReport<PaymentStatistics>(`${base}/statistics`, {});
  const detail = useReport<PaymentDetail>(viewId ? `${base}/get` : null, { [isReceipt ? "receipt_id" : "supplier_payment_id"]: viewId ?? "" });
  const viewing = detail.data?.id === viewId ? detail.data : null;
  const docBase = isReceipt ? "/sales/invoices" : "/purchases/bills";
  const noun = isReceipt ? "receipt" : "payment";
  const filtered = !!method || !!month || !!status || !!search;

  const columns: Column<Row>[] = [
    {
      accessorKey: "number",
      header: isReceipt ? "Receipt" : "Payment",
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-2">
          <span className={classNames("font-mono text-xs font-medium", row.original.state === "VOID" && "line-through opacity-60")}>
            {row.original.number}
          </span>
          {row.original.state === "VOID" && (
            <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-300">VOID</span>
          )}
        </span>
      ),
    },
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
            ? "Money received from customers against invoices. Click a row for details, its ledger entry, or to void it."
            : "Money paid to suppliers against bills. Click a row for details, its ledger entry, or to void it."
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
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${filterInputClass} w-36`} aria-label="Status">
          <option value="">All statuses</option>
          <option value="POSTED">Posted</option>
          <option value="VOID">Void</option>
        </select>
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
            onRowClick={(r) => setViewId(r.id)}
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
      <RightDrawer
        open={!!viewId}
        onClose={() => setViewId(null)}
        title={viewing ? <span className="font-mono">{viewing.number}</span> : <span className="text-neutral-400">{isReceipt ? "Receipt" : "Supplier payment"}</span>}
        subtitle={viewing?.party_name}
        footer={
          viewing &&
          viewing.state === "POSTED" && (
            <div className="flex items-center justify-end gap-2">
              <Button
                variant="ghost"
                icon={FiSlash}
                className="mr-auto text-red-600"
                disabled={viewing.is_reconciled}
                title={viewing.is_reconciled ? "Matched to a bank statement line. Unmatch it in Reconciliation first." : undefined}
                onClick={() => setVoidOpen(true)}
              >
                Void {noun}
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
                Voided{viewing.void_reason ? `: ${viewing.void_reason}` : ""}. Its ledger entry was reversed and {viewing.document_number} is owed
                again.
              </p>
            )}
            {viewing.state === "POSTED" && viewing.is_reconciled && (
              <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                This {noun} is matched to a bank statement line. To void it, first unmatch it in{" "}
                <Link href="/banking/reconciliation" className="font-medium underline">
                  Reconciliation
                </Link>
                .
              </p>
            )}
            <div className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 px-4 py-1 dark:divide-neutral-700 dark:border-neutral-700">
              <DetailRow label={isReceipt ? "Against invoice" : "Against bill"}>
                <Link href={`${docBase}?open=${viewing.document_id}`} className="font-mono text-brand-700 hover:underline dark:text-brand-300">
                  {viewing.document_number}
                </Link>
              </DetailRow>
              <DetailRow label="Date">{fmtDate(viewing.date)}</DetailRow>
              <DetailRow label="Amount">
                <span className="tabular-nums">{fmtMoney(viewing.amount, viewing.currency)}</span>
              </DetailRow>
              {viewing.currency !== BASE_CURRENCY && (
                <>
                  <DetailRow label="Rate on the day">{fmtRate(viewing.exchange_rate)}</DetailRow>
                  <DetailRow label={`In ${BASE_CURRENCY}`}>
                    <span className="tabular-nums">{fmtCurrency(viewing.base_amount)}</span>
                  </DetailRow>
                  {viewing.fx_gain_loss !== 0 && (
                    <DetailRow label={viewing.fx_gain_loss > 0 ? "Exchange gain" : "Exchange loss"}>
                      <span className="tabular-nums">{fmtCurrency(Math.abs(viewing.fx_gain_loss))}</span>
                    </DetailRow>
                  )}
                </>
              )}
              <DetailRow label="Method">{humanize(viewing.method)}</DetailRow>
              <DetailRow label={isReceipt ? "Deposited to" : "Paid from"}>{viewing.bank_account_name || "—"}</DetailRow>
              <DetailRow label="Reference">{viewing.reference ?? "—"}</DetailRow>
              <DetailRow label="Ledger entry">
                <button onClick={() => openJournal(viewing.journal_id)} className="font-mono text-brand-700 hover:underline dark:text-brand-300">
                  {viewing.journal_number ?? "View"}
                </button>
              </DetailRow>
            </div>
            <p className="text-xs text-neutral-500">
              Recorded by {viewing.created_by ?? "—"} · {fmtDateTime(viewing.created_at)}
              {viewing.state === "VOID" && <> · voided by {viewing.updated_by ?? "—"} · {fmtDateTime(viewing.updated_at)}</>}
            </p>
          </div>
        )}
      </RightDrawer>

      <PaymentModal kind={kind} open={open} onClose={() => setOpen(false)} />
      {viewing && (
        <ReasonModal
          open={voidOpen}
          onClose={() => setVoidOpen(false)}
          danger
          title={`Void ${viewing.number}`}
          description={`Posts a reversing entry dated today and puts ${fmtMoney(viewing.amount, viewing.currency)} back on ${viewing.document_number} as owed. Use this when ${isReceipt ? "a cheque bounces or the money was recorded against the wrong invoice" : "a payment failed or was recorded against the wrong bill"}.`}
          confirmLabel={`Void ${noun}`}
          placeholder={isReceipt ? "e.g. Cheque returned unpaid" : "e.g. Transfer was rejected by the bank"}
          onConfirm={(reason) => actions.voidPayment(kind, viewing.id, reason)}
        />
      )}
    </div>
  );
};

export default PaymentsPage;
