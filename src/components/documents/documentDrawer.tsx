"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { FiCheck, FiCornerUpLeft, FiDollarSign, FiPrinter, FiSlash } from "react-icons/fi";
import Link from "next/link";
import RightDrawer from "@/components/rightDrawer";
import StatusBadge from "@/components/statusBadge";
import SourceBadge from "@/components/sourceBadge";
import { Button, DetailRow } from "@/components/ui";
import ReasonModal from "@/components/accounting/reasonModal";
import { useJournalViewer } from "@/components/accounting/journalViewer";
import PaymentModal from "./paymentModal";
import CreditNoteModal from "./creditNoteModal";
import { useLedger } from "@/store/ledgerStore";
import { billRows, dimensionName, invoiceRows } from "@/store/selectors";
import { documentTotals, lineAmount } from "@/lib/documents";
import type { PurchaseBill, SalesInvoice } from "@/models/accounting";
import { BASE_CURRENCY, classNames, fmtCurrency, fmtDate, fmtDateTime, fmtMoney, fmtRate, humanize } from "@/utils/format";
import { CustomFieldDetails, EditCustomFieldsModal } from "@/components/customFields";

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
  const [creditOpen, setCreditOpen] = useState(false);
  const [editCustom, setEditCustom] = useState(false);
  const isInvoice = kind === "invoice";

  const rows = isInvoice ? invoiceRows(state) : billRows(state);
  const row = rows.find((r) => r.doc.id === documentId);
  const doc = row?.doc as (SalesInvoice | PurchaseBill) | undefined;
  const payments = (isInvoice ? state.receipts : state.supplierPayments).filter((p) => p.document_id === documentId);
  const credits = (isInvoice ? state.creditNotes : state.supplierCredits).filter((c) => c.document_id === documentId);
  const liveCredits = credits.filter((c) => c.state === "APPROVED");
  const accounts = new Map(state.accounts.map((a) => [a.id, a]));
  const taxCodes = new Map(state.taxCodes.map((t) => [t.id, t]));
  const cur = row?.currency ?? BASE_CURRENCY;
  const foreign = cur !== BASE_CURRENCY;
  const m = (v: number) => fmtMoney(v, cur);
  const fxTotal = payments.reduce((t, p) => t + p.fx_gain_loss, 0);

  const approve = async () => {
    if (!doc) return;
    const res = await (isInvoice ? actions.approveInvoice(doc.id) : actions.approveBill(doc.id));
    if (res.ok) toast.success(res.message ?? "Approved");
    else toast.error(res.error);
  };

  const footer = row && doc && (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {doc.state !== "VOID" && doc.amount_paid === 0 && doc.source.type !== "OPENING_BALANCE" && (
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
        <Button variant="secondary" icon={FiCornerUpLeft} onClick={() => setCreditOpen(true)}>
          {isInvoice ? "Credit note" : "Supplier credit"}
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
                <p className="mt-0.5 font-semibold tabular-nums">{m(row.totals.total)}</p>
                {foreign && <p className="text-xs tabular-nums text-neutral-500">{fmtCurrency(row.total_base)}</p>}
              </div>
              <div className="rounded-xl bg-neutral-50 p-3 dark:bg-neutral-900/40">
                <p className="text-xs text-neutral-500 dark:text-neutral-400">{liveCredits.length ? "Paid & credited" : "Paid"}</p>
                <p className="mt-0.5 font-semibold tabular-nums">{m(doc.amount_paid)}</p>
                {foreign && doc.amount_paid > 0 && (
                  <p className="text-xs tabular-nums text-neutral-500">{fmtCurrency(doc.amount_paid_base)} at booking rate</p>
                )}
              </div>
              <div className="rounded-xl bg-brand-50 p-3 dark:bg-brand-900/20">
                <p className="text-xs text-brand-700 dark:text-brand-300">Outstanding</p>
                <p className="mt-0.5 font-semibold tabular-nums text-brand-800 dark:text-brand-200">
                  {m(row.outstanding_fc)}
                </p>
                {foreign && row.outstanding > 0 && (
                  <p className="text-xs tabular-nums text-brand-700/80 dark:text-brand-300/80">{fmtCurrency(row.outstanding)}</p>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-neutral-200 px-4 py-1 divide-y divide-neutral-100 dark:border-neutral-700 dark:divide-neutral-700">
              <DetailRow label={isInvoice ? "Customer" : "Supplier"}>
                {row.party?.name} <span className="text-neutral-400">({row.party?.code})</span>
              </DetailRow>
              {!isInvoice && <DetailRow label="Supplier invoice no.">{(doc as PurchaseBill).supplier_reference}</DetailRow>}
              <DetailRow label="Issue date">{fmtDate(doc.issue_date)}</DetailRow>
              {foreign && (
                <DetailRow label="Currency">
                  {cur} · 1 {cur} = {fmtRate(doc.exchange_rate)} GH₵
                  <p className="text-xs font-normal text-neutral-500">Posted to the ledger as {fmtCurrency(row.total_base)}</p>
                </DetailRow>
              )}
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
                      <td className="px-4 py-2.5 text-right tabular-nums">{m(l.unit_price)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{m(lineAmount(l))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <dl className="space-y-1 border-t border-neutral-200 bg-neutral-50 px-4 py-3 text-sm dark:border-neutral-700 dark:bg-neutral-900/40">
                <div className="flex justify-between">
                  <dt className="text-neutral-500">Subtotal</dt>
                  <dd className="tabular-nums">{m(row.totals.subtotal)}</dd>
                </div>
                {row.totals.taxByCode.map((t) => (
                  <div key={t.tax_code_id} className="flex justify-between">
                    <dt className="text-neutral-500">{taxCodes.get(t.tax_code_id)?.name}</dt>
                    <dd className="tabular-nums">{m(t.amount)}</dd>
                  </div>
                ))}
                <div className="flex justify-between font-semibold">
                  <dt>Total</dt>
                  <dd className="tabular-nums">{m(row.totals.total)}</dd>
                </div>
                {foreign && (
                  <div className="flex justify-between text-xs text-neutral-500">
                    <dt>In GH₵ at {fmtRate(doc.exchange_rate)}</dt>
                    <dd className="tabular-nums">{fmtCurrency(row.total_base)}</dd>
                  </div>
                )}
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
                      <div className="text-right">
                        <span className="font-medium tabular-nums">{fmtMoney(p.amount, p.currency)}</span>
                        {p.currency !== BASE_CURRENCY && (
                          <p className="text-xs tabular-nums text-neutral-500">
                            {fmtCurrency(p.base_amount)} at {fmtRate(p.exchange_rate)}
                            {p.fx_gain_loss !== 0 && (
                              <span className={p.fx_gain_loss > 0 ? "text-emerald-600" : "text-red-600"}>
                                {" "}
                                · {p.fx_gain_loss > 0 ? "gain" : "loss"} {fmtCurrency(Math.abs(p.fx_gain_loss))}
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {foreign && fxTotal !== 0 && (
                <p className={classNames("mt-2 text-xs", fxTotal > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400")}>
                  Net realised exchange {fxTotal > 0 ? "gain" : "loss"} on this {isInvoice ? "invoice" : "bill"}: {fmtCurrency(Math.abs(fxTotal))}
                </p>
              )}
            </div>

            {credits.length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-semibold">{isInvoice ? "Credit notes" : "Supplier credits"}</h4>
                <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 dark:divide-neutral-700 dark:border-neutral-700">
                  {credits.map((c) => (
                    <li key={c.id} className={classNames("flex items-center justify-between px-4 py-2.5 text-sm", c.state === "VOID" && "opacity-50")}>
                      <div>
                        <Link
                          href={`${isInvoice ? "/sales/credit-notes" : "/purchases/supplier-credits"}?open=${c.id}`}
                          onClick={onClose}
                          className="font-mono text-brand-700 hover:underline dark:text-brand-300"
                        >
                          {c.number}
                        </Link>
                        {c.state === "VOID" && <span className="ml-2 text-xs font-medium text-red-600">Void</span>}
                        <p className="text-xs text-neutral-500 dark:text-neutral-400">
                          {fmtDate(c.date)} · {c.reason}
                        </p>
                      </div>
                      <span className="font-medium tabular-nums">{fmtMoney(documentTotals(c.lines, state.taxCodes).total, c.currency)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <CustomFieldDetails entity={isInvoice ? "Invoice" : "Bill"} values={doc.custom_fields} onEdit={doc.state === "VOID" ? undefined : () => setEditCustom(true)} />

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
      <CreditNoteModal kind={isInvoice ? "customer" : "supplier"} open={creditOpen} onClose={() => setCreditOpen(false)} documentId={documentId} />
      {doc && (
        <EditCustomFieldsModal
          entity={isInvoice ? "Invoice" : "Bill"}
          recordId={doc.id}
          recordLabel={doc.number}
          values={doc.custom_fields}
          open={editCustom}
          onClose={() => setEditCustom(false)}
        />
      )}
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
