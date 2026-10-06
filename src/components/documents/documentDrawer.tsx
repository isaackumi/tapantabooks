"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { FiCheck, FiDollarSign, FiPrinter, FiSlash } from "react-icons/fi";
import RightDrawer from "@/components/rightDrawer";
import StatusBadge from "@/components/statusBadge";
import SourceBadge from "@/components/sourceBadge";
import { Button, DetailRow } from "@/components/ui";
import ReasonModal from "@/components/accounting/reasonModal";
import { useJournalViewer } from "@/components/accounting/journalViewer";
import PaymentModal from "./paymentModal";
import { useLedger } from "@/store/ledgerStore";
import { billRows, dimensionName, invoiceRows } from "@/store/selectors";
import { lineAmount } from "@/lib/documents";
import type { PurchaseBill, SalesInvoice } from "@/models/accounting";
import { fmtCurrency, fmtDate, fmtDateTime, humanize } from "@/utils/format";

interface DocumentDrawerProps {
  kind: "invoice" | "bill";
  documentId: string | null;
  onClose: () => void;
}

const DocumentDrawer = ({ kind, documentId, onClose }: DocumentDrawerProps) => {
  const { state, actions } = useLedger();
  const { openJournal } = useJournalViewer();
  const [payOpen, setPayOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const isInvoice = kind === "invoice";

  const rows = isInvoice ? invoiceRows(state) : billRows(state);
  const row = rows.find((r) => r.doc.id === documentId);
  const doc = row?.doc as (SalesInvoice | PurchaseBill) | undefined;
  const payments = (isInvoice ? state.receipts : state.supplierPayments).filter((p) => p.document_id === documentId);
  const accounts = new Map(state.accounts.map((a) => [a.id, a]));
  const taxCodes = new Map(state.taxCodes.map((t) => [t.id, t]));

  const approve = () => {
    if (!doc) return;
    const res = isInvoice ? actions.approveInvoice(doc.id) : actions.approveBill(doc.id);
    if (res.ok) toast.success(res.message ?? "Approved");
    else toast.error(res.error);
  };

  const footer = row && doc && (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {doc.state !== "VOID" && doc.amount_paid === 0 && (
        <Button variant="ghost" icon={FiSlash} className="mr-auto text-red-600" onClick={() => setVoidOpen(true)}>
          Void
        </Button>
      )}
      <Button variant="secondary" icon={FiPrinter} onClick={() => window.print()}>
        Print
      </Button>
      {doc.state === "DRAFT" && (
        <Button icon={FiCheck} onClick={approve}>
          Approve &amp; post
        </Button>
      )}
      {row.outstanding > 0 && (
        <Button icon={FiDollarSign} onClick={() => setPayOpen(true)}>
          {isInvoice ? "Record receipt" : "Record payment"}
        </Button>
      )}
    </div>
  );

  return (
    <>
      <RightDrawer
        open={!!row}
        onClose={onClose}
        widthClass="max-w-2xl"
        title={
          row && (
            <span className="flex items-center gap-2">
              <span className="font-mono">{row.doc.number}</span>
              <StatusBadge status={row.status} />
            </span>
          )
        }
        subtitle={row?.party?.name}
        footer={footer}
      >
        {row && doc && (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-neutral-50 p-3 dark:bg-neutral-900/40">
                <p className="text-xs text-neutral-500 dark:text-neutral-400">Total</p>
                <p className="mt-0.5 font-semibold tabular-nums">{fmtCurrency(row.totals.total)}</p>
              </div>
              <div className="rounded-xl bg-neutral-50 p-3 dark:bg-neutral-900/40">
                <p className="text-xs text-neutral-500 dark:text-neutral-400">Paid</p>
                <p className="mt-0.5 font-semibold tabular-nums">{fmtCurrency(doc.amount_paid)}</p>
              </div>
              <div className="rounded-xl bg-brand-50 p-3 dark:bg-brand-900/20">
                <p className="text-xs text-brand-700 dark:text-brand-300">Outstanding</p>
                <p className="mt-0.5 font-semibold tabular-nums text-brand-800 dark:text-brand-200">
                  {fmtCurrency(row.outstanding)}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-neutral-200 px-4 py-1 divide-y divide-neutral-100 dark:border-neutral-700 dark:divide-neutral-700">
              <DetailRow label={isInvoice ? "Customer" : "Supplier"}>
                {row.party?.name} <span className="text-neutral-400">({row.party?.code})</span>
              </DetailRow>
              {!isInvoice && <DetailRow label="Supplier invoice no.">{(doc as PurchaseBill).supplier_reference}</DetailRow>}
              <DetailRow label="Issue date">{fmtDate(doc.issue_date)}</DetailRow>
              <DetailRow label="Due date">{fmtDate(doc.due_date)}</DetailRow>
              <DetailRow label="Branch">{dimensionName(state, doc.branch_id)}</DetailRow>
              <DetailRow label="Source">
                <SourceBadge type={doc.source.type} reference={doc.source.reference} />
              </DetailRow>
              <DetailRow label="Ledger entry">
                {doc.journal_id ? (
                  <button
                    onClick={() => openJournal(doc.journal_id!)}
                    className="font-mono text-brand-700 hover:underline dark:text-brand-300"
                  >
                    {state.journals.find((j) => j.id === doc.journal_id)?.number ?? "View"}
                  </button>
                ) : (
                  <span className="text-neutral-400">Not posted (draft)</span>
                )}
              </DetailRow>
            </div>

            <div className="overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-700">
              <table className="min-w-full text-sm">
                <thead className="bg-neutral-50 text-neutral-500 dark:bg-neutral-900/40 dark:text-neutral-400">
                  <tr>
                    <th className="px-4 py-2 text-left font-normal">Item</th>
                    <th className="px-4 py-2 text-right font-normal">Qty</th>
                    <th className="px-4 py-2 text-right font-normal">Price</th>
                    <th className="px-4 py-2 text-right font-normal">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700">
                  {doc.lines.map((l) => (
                    <tr key={l.id}>
                      <td className="px-4 py-2.5">
                        <p className="font-medium">{l.description}</p>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">
                          {accounts.get(l.account_id)?.name} · {taxCodes.get(l.tax_code_id)?.code}
                        </p>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{l.quantity}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmtCurrency(l.unit_price)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{fmtCurrency(lineAmount(l))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <dl className="space-y-1 border-t border-neutral-200 bg-neutral-50 px-4 py-3 text-sm dark:border-neutral-700 dark:bg-neutral-900/40">
                <div className="flex justify-between">
                  <dt className="text-neutral-500">Subtotal</dt>
                  <dd className="tabular-nums">{fmtCurrency(row.totals.subtotal)}</dd>
                </div>
                {row.totals.taxByCode.map((t) => (
                  <div key={t.tax_code_id} className="flex justify-between">
                    <dt className="text-neutral-500">{taxCodes.get(t.tax_code_id)?.name}</dt>
                    <dd className="tabular-nums">{fmtCurrency(t.amount)}</dd>
                  </div>
                ))}
                <div className="flex justify-between font-semibold">
                  <dt>Total</dt>
                  <dd className="tabular-nums">{fmtCurrency(row.totals.total)}</dd>
                </div>
              </dl>
            </div>

            <div>
              <h4 className="mb-2 text-sm font-semibold">{isInvoice ? "Receipts" : "Payments"}</h4>
              {payments.length === 0 ? (
                <p className="text-sm text-neutral-500 dark:text-neutral-400">Nothing recorded yet.</p>
              ) : (
                <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 dark:divide-neutral-700 dark:border-neutral-700">
                  {payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <div>
                        <button
                          onClick={() => openJournal(p.journal_id)}
                          className="font-mono text-brand-700 hover:underline dark:text-brand-300"
                        >
                          {p.number}
                        </button>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">
                          {fmtDate(p.date)} · {humanize(p.method)}
                          {p.reference && ` · ${p.reference}`}
                        </p>
                      </div>
                      <span className="font-medium tabular-nums">{fmtCurrency(p.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {doc.notes && (
              <p className="rounded-xl bg-neutral-50 px-4 py-3 text-sm text-neutral-600 dark:bg-neutral-900/40 dark:text-neutral-300">
                {doc.notes}
              </p>
            )}

            <div className="text-xs text-neutral-500 dark:text-neutral-400">
              Created by {doc.created_by ?? "—"} · {fmtDateTime(doc.created_at)} · Updated by {doc.updated_by ?? "—"} ·{" "}
              {fmtDateTime(doc.updated_at)}
            </div>
          </div>
        )}
      </RightDrawer>

      <PaymentModal
        kind={isInvoice ? "receipt" : "payment"}
        open={payOpen}
        onClose={() => setPayOpen(false)}
        documentId={documentId}
      />
      {doc && (
        <ReasonModal
          open={voidOpen}
          onClose={() => setVoidOpen(false)}
          danger
          title={`Void ${doc.number}`}
          description={
            doc.state === "APPROVED"
              ? "Posts a reversing entry dated today so the original stays visible in the ledger."
              : "The draft never posted, so nothing changes in the ledger."
          }
          confirmLabel="Void document"
          placeholder="e.g. Raised against the wrong customer"
          onConfirm={(reason) => actions.voidDocument(kind, doc.id, reason)}
        />
      )}
    </>
  );
};

export default DocumentDrawer;
