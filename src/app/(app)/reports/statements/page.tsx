"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FiFileText } from "react-icons/fi";
import { PageHeader, compactInputClass } from "@/components/ui";
import EmptyState from "@/components/emptyState";
import { ReportToolbar } from "@/components/reports/reportKit";
import { useLedger } from "@/store/ledgerStore";
import { partyStatement, type StatementEntryType } from "@/lib/statements";
import { AGEING_BUCKETS } from "@/lib/documents";
import { downloadCsv } from "@/utils/csv";
import { classNames, fmtAccounting, fmtDate, fmtMoney } from "@/utils/format";
import { startOfYear, todayIso } from "@/utils/dates";

type Kind = "customer" | "supplier";

const TYPE_LABEL: Record<StatementEntryType, string> = {
  INVOICE: "Invoice",
  BILL: "Bill",
  RECEIPT: "Receipt",
  PAYMENT: "Payment",
  CREDIT_NOTE: "Credit note",
  SUPPLIER_CREDIT: "Supplier credit",
};

const LINK_BASE: Record<StatementEntryType, string> = {
  INVOICE: "/sales/invoices",
  BILL: "/purchases/bills",
  RECEIPT: "/sales/invoices",
  PAYMENT: "/purchases/bills",
  CREDIT_NOTE: "/sales/invoices",
  SUPPLIER_CREDIT: "/purchases/bills",
};

const TH = "px-3 py-2 font-normal";
const NUM = "px-3 py-2 text-right tabular-nums";

export default function StatementsPage() {
  const { state } = useLedger();
  const params = useSearchParams();
  const today = todayIso();
  const [kind, setKind] = useState<Kind>(params.get("kind") === "supplier" ? "supplier" : "customer");
  const parties = kind === "customer" ? state.customers : state.suppliers;
  const [partyId, setPartyId] = useState(params.get("party") ?? "");
  const [currency, setCurrency] = useState("");
  const [from, setFrom] = useState(startOfYear(today));
  const [to, setTo] = useState(today);

  const activeId = parties.some((p) => p.id === partyId) ? partyId : (parties[0]?.id ?? "");
  const statement = useMemo(
    () => (activeId ? partyStatement(state, kind === "customer" ? "CUSTOMER" : "SUPPLIER", activeId, from, to, currency || undefined) : null),
    [state, kind, activeId, from, to, currency],
  );
  const party = parties.find((p) => p.id === activeId);
  const isCustomer = kind === "customer";
  const money = (v: number) => fmtMoney(v, statement?.currency);

  const switchKind = (k: Kind) => {
    setKind(k);
    setPartyId("");
    setCurrency("");
  };

  const exportCsv = () => {
    if (!statement) return;
    downloadCsv(`statement-${statement.party_code}-${statement.currency}-${to}.csv`, [
      ["Date", "Type", "Number", "Description", "Charges", "Payments & credits", "Balance"],
      [from, "", "", "Opening balance", "", "", statement.opening_balance],
      ...statement.entries.map((e) => [e.date, TYPE_LABEL[e.type], e.number, e.description, e.charge || "", e.credit || "", e.balance]),
      [to, "", "", "Closing balance", statement.total_charges, statement.total_credits, statement.closing_balance],
    ]);
  };

  return (
    <div>
      <PageHeader
        title="Statements"
        description="Statement of account for a customer or supplier: opening balance, every invoice, payment and credit in the period, and what is still due."
        backHref="/reports"
        backLabel="Reports"
      />

      <div className="mb-4 flex flex-wrap items-end gap-3" data-no-print>
        <div className="flex gap-1 rounded-lg bg-neutral-100 p-1 dark:bg-neutral-700">
          {(["customer", "supplier"] as Kind[]).map((k) => (
            <button
              key={k}
              onClick={() => switchKind(k)}
              className={classNames(
                "rounded-md px-3 py-1.5 text-sm font-medium",
                kind === k ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-800 dark:text-white" : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-300",
              )}
            >
              {k === "customer" ? "Customer" : "Supplier"}
            </button>
          ))}
        </div>
        <label className="text-sm">
          <span className="mb-1 block text-neutral-500 dark:text-neutral-400">{isCustomer ? "Customer" : "Supplier"}</span>
          <select
            value={activeId}
            onChange={(e) => {
              setPartyId(e.target.value);
              setCurrency("");
            }}
            className={`${compactInputClass} w-72`}
          >
            {parties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.code})
              </option>
            ))}
          </select>
        </label>
        {statement && statement.currencies.length > 1 && (
          <label className="text-sm">
            <span className="mb-1 block text-neutral-500 dark:text-neutral-400">Currency</span>
            <select value={statement.currency} onChange={(e) => setCurrency(e.target.value)} className={`${compactInputClass} w-28`}>
              {statement.currencies.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      <ReportToolbar
        from={from}
        to={to}
        onFrom={setFrom}
        onTo={setTo}
        onExport={statement ? exportCsv : undefined}
        presets={[
          { label: "Year to date", from: startOfYear(today), to: today },
          { label: "Q3", from: "2026-07-01", to: "2026-09-30" },
          { label: "September", from: "2026-09-01", to: "2026-09-30" },
        ]}
      />

      {!statement || !party ? (
        <EmptyState icon={FiFileText} title={`No ${kind}s yet`} description={`Add a ${kind} to produce a statement.`} />
      ) : (
        <div className="mx-auto max-w-5xl rounded-xl border border-neutral-200 bg-white px-6 py-8 sm:px-10 dark:border-neutral-700 dark:bg-neutral-800 print:border-0 print:px-0">
          <div className="mb-8 flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-brand-700 dark:text-brand-300">{state.org.legal_name}</p>
              <p className="mt-1 whitespace-pre-line text-xs text-neutral-500 dark:text-neutral-400">{state.org.address}</p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {state.org.email} · {state.org.phone}
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">TIN {state.org.tin}</p>
            </div>
            <div className="text-right">
              <h2 className="text-xl font-bold">Statement of account</h2>
              <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                {fmtDate(from)} – {fmtDate(to)}
              </p>
              <p className="text-xs text-neutral-400">Amounts in {statement.currency}</p>
            </div>
          </div>

          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-neutral-200 p-4 text-sm dark:border-neutral-700">
              <p className="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400">{isCustomer ? "Statement for" : "Supplier"}</p>
              <p className="mt-1 font-semibold">{party.name}</p>
              <p className="text-neutral-500 dark:text-neutral-400">
                {party.code} · {party.city}
              </p>
              <p className="text-neutral-500 dark:text-neutral-400">{party.email}</p>
              {party.tin && <p className="text-neutral-500 dark:text-neutral-400">TIN {party.tin}</p>}
            </div>
            <div className="rounded-xl bg-brand-50 p-4 text-sm dark:bg-brand-900/20">
              <div className="flex justify-between py-0.5">
                <span className="text-neutral-600 dark:text-neutral-300">Opening balance</span>
                <span className="tabular-nums">{money(statement.opening_balance)}</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="text-neutral-600 dark:text-neutral-300">{isCustomer ? "Invoiced" : "Billed"}</span>
                <span className="tabular-nums">{money(statement.total_charges)}</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="text-neutral-600 dark:text-neutral-300">Payments & credits</span>
                <span className="tabular-nums">{money(-statement.total_credits)}</span>
              </div>
              <div className="mt-1 flex justify-between border-t border-brand-200 pt-2 font-bold dark:border-brand-800">
                <span>{isCustomer ? "Balance due" : "Balance owed"}</span>
                <span className="tabular-nums text-brand-700 dark:text-brand-300">{money(statement.closing_balance)}</span>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
                <tr>
                  <th className={TH}>Date</th>
                  <th className={TH}>Type</th>
                  <th className={TH}>Number</th>
                  <th className={TH}>Description</th>
                  <th className={`${TH} text-right`}>Charges</th>
                  <th className={`${TH} text-right`}>Payments & credits</th>
                  <th className={`${TH} text-right`}>Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700">
                <tr className="bg-neutral-50/60 dark:bg-neutral-900/20">
                  <td className="px-3 py-2 whitespace-nowrap">{fmtDate(from)}</td>
                  <td className="px-3 py-2" colSpan={3}>
                    Opening balance
                  </td>
                  <td className={NUM} />
                  <td className={NUM} />
                  <td className={`${NUM} font-medium`}>{fmtAccounting(statement.opening_balance)}</td>
                </tr>
                {statement.entries.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-neutral-500">
                      No activity in this period.
                    </td>
                  </tr>
                )}
                {statement.entries.map((e, i) => (
                  <tr key={`${e.number}-${i}`}>
                    <td className="px-3 py-2 whitespace-nowrap">{fmtDate(e.date)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-neutral-500 dark:text-neutral-400">{TYPE_LABEL[e.type]}</td>
                    <td className="px-3 py-2 whitespace-nowrap font-mono text-xs">
                      <Link href={`${LINK_BASE[e.type]}?open=${e.document_id}`} className="hover:text-brand-700 dark:hover:text-brand-300">
                        {e.number}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-neutral-600 dark:text-neutral-300">{e.description}</td>
                    <td className={NUM}>{e.charge ? fmtAccounting(e.charge) : ""}</td>
                    <td className={NUM}>{e.credit ? fmtAccounting(e.credit) : ""}</td>
                    <td className={`${NUM} font-medium`}>{fmtAccounting(e.balance)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-neutral-800 font-semibold dark:border-neutral-300">
                  <td className="px-3 py-2" colSpan={4}>
                    Closing balance at {fmtDate(to)}
                  </td>
                  <td className={NUM}>{fmtAccounting(statement.total_charges)}</td>
                  <td className={NUM}>{fmtAccounting(statement.total_credits)}</td>
                  <td className={NUM}>{fmtAccounting(statement.closing_balance)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <h3 className="mt-8 mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Ageing at {fmtDate(to)}</h3>
          <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-neutral-200 bg-neutral-200 text-sm sm:grid-cols-6 dark:border-neutral-700 dark:bg-neutral-700">
            {AGEING_BUCKETS.map((b) => (
              <div key={b} className="bg-white p-3 dark:bg-neutral-800">
                <p className="text-xs text-neutral-500 dark:text-neutral-400">{b}</p>
                <p className={classNames("mt-0.5 tabular-nums", b !== "Current" && statement.ageing[b] > 0 && "font-semibold text-red-600 dark:text-red-400")}>
                  {fmtAccounting(statement.ageing[b])}
                </p>
              </div>
            ))}
            <div className="bg-neutral-50 p-3 dark:bg-neutral-900/40">
              <p className="text-xs text-neutral-500 dark:text-neutral-400">Total due</p>
              <p className="mt-0.5 font-semibold tabular-nums">{fmtAccounting(statement.ageing.total)}</p>
            </div>
          </div>

          {statement.open_documents.length > 0 && (
            <>
              <h3 className="mt-8 mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                Open {isCustomer ? "invoices" : "bills"}
              </h3>
              <table className="min-w-full text-sm">
                <thead className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
                  <tr>
                    <th className={TH}>Number</th>
                    <th className={TH}>Issued</th>
                    <th className={TH}>Due</th>
                    <th className={TH}>Age</th>
                    <th className={`${TH} text-right`}>Total</th>
                    <th className={`${TH} text-right`}>Outstanding</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700">
                  {statement.open_documents.map((d) => (
                    <tr key={d.document_id}>
                      <td className="px-3 py-2 font-mono text-xs">
                        <Link href={`${isCustomer ? "/sales/invoices" : "/purchases/bills"}?open=${d.document_id}`} className="hover:text-brand-700 dark:hover:text-brand-300">
                          {d.number}
                        </Link>
                      </td>
                      <td className="px-3 py-2">{fmtDate(d.issue_date)}</td>
                      <td className="px-3 py-2">{fmtDate(d.due_date)}</td>
                      <td className={classNames("px-3 py-2", d.bucket !== "Current" && "text-red-600 dark:text-red-400")}>{d.bucket}</td>
                      <td className={NUM}>{fmtAccounting(d.total)}</td>
                      <td className={`${NUM} font-medium`}>{fmtAccounting(d.outstanding)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <p className="mt-8 border-t border-neutral-100 pt-4 text-xs text-neutral-500 dark:border-neutral-700">
            {isCustomer
              ? `Please quote the invoice number with your payment. Questions about this statement: ${state.org.email}.`
              : "Balances are as recorded in our books. Please send a copy of your own statement if your figures differ."}{" "}
            Draft and voided documents are not shown.
          </p>
        </div>
      )}
    </div>
  );
}
