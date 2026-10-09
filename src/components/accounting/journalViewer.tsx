"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { FiCheck, FiCornerUpLeft, FiEdit2, FiRotateCcw, FiSend, FiTrash2 } from "react-icons/fi";
import RightDrawer from "@/components/rightDrawer";
import StatusBadge from "@/components/statusBadge";
import SourceBadge from "@/components/sourceBadge";
import { Button, Callout, DetailRow } from "@/components/ui";
import { Modal, BTN_DANGER, BTN_SECONDARY } from "@/components/modal";
import ReasonModal from "./reasonModal";
import JournalFormModal from "./journalFormModal";
import { useCurrentUser, useLedger } from "@/store/ledgerStore";
import { dimensionName } from "@/store/selectors";
import { lineTotals } from "@/lib/ledger";
import type { JournalEntry } from "@/models/accounting";
import { fmtAccounting, fmtCurrency, fmtDate, fmtDateTime, fmtMoney } from "@/utils/format";
import { CustomFieldDetails, EditCustomFieldsModal } from "@/components/customFields";
import { AppConstants } from "@/core/appConstants";
import { usePending } from "@/services/usePending";
import { useReport } from "@/services/useApiQuery";
import { QueryError, Skeleton } from "@/components/queryState";
import { todayIso } from "@/utils/dates";

interface JournalViewerValue {
  openJournal: (id: string) => void;
  newJournal: () => void;
}

const JournalViewerContext = createContext<JournalViewerValue | undefined>(undefined);

export const useJournalViewer = () => {
  const ctx = useContext(JournalViewerContext);
  if (!ctx) throw new Error("useJournalViewer must be used within JournalViewerProvider");
  return ctx;
};

/** A related journal (reversal or original); null until it has loaded. */
const useJournal = (id: string | null | undefined) => {
  const { data } = useReport<JournalEntry>(id ? "/journals/get" : null, { journal_id: id ?? "" });
  return id && data?.id === id ? data : null;
};

/** Where the business document behind a journal lives in the UI. */
const documentHref = (j: JournalEntry) => {
  if (!j.source.document_id) return null;
  if (j.source.type === "SALES") return `/sales/invoices?open=${j.source.document_id}`;
  if (j.source.type === "PURCHASES") return `/purchases/bills?open=${j.source.document_id}`;
  return null;
};

const documentLabel = (j: JournalEntry) =>
  j.source.type === "SALES"
    ? "Open invoice"
    : j.source.type === "PURCHASES"
      ? "Open bill"
      : j.source.type === "OPENING_BALANCE"
        ? "Open opening balances"
        : j.source.type === "YEAR_END"
          ? "Open fiscal years"
          : "Open revaluation";

const revaluationHref = (j: JournalEntry) =>
  j.source.type === "OPENING_BALANCE"
    ? "/accounting/opening-balances"
    : j.source.type === "YEAR_END"
      ? "/accounting/periods"
      : j.source.type === "FX_REVALUATION" || j.reference?.startsWith("FX-REVAL")
        ? "/accounting/revaluation"
        : null;

export const JournalViewerProvider = ({ children }: { children: React.ReactNode }) => {
  const { state, actions } = useLedger();
  const user = useCurrentUser();
  const [openId, setOpenId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<JournalEntry | null>(null);
  const [reverseOpen, setReverseOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editCustom, setEditCustom] = useState(false);

  const journalQuery = useReport<JournalEntry>(openId ? "/journals/get" : null, { journal_id: openId ?? "" });
  const journal = openId && journalQuery.data?.id === openId ? journalQuery.data : null;
  const reversal = useJournal(journal?.reversed_by_id);
  const original = useJournal(journal?.reversal_of_id);
  const accounts = useMemo(() => new Map(state.accounts.map((a) => [a.id, a])), [state.accounts]);

  const openJournal = useCallback((id: string) => setOpenId(id), []);
  const newJournal = useCallback(() => {
    setEditing(null);
    setFormOpen(true);
  }, []);
  const value = useMemo(() => ({ openJournal, newJournal }), [openJournal, newJournal]);

  const { pending, track, anyPending } = usePending();

  const run = (res: { ok: boolean; message?: string; error?: string }) => {
    if (res.ok) toast.success(res.message ?? "Done");
    else toast.error(res.error ?? "Something went wrong");
    return res.ok;
  };

  const totals = journal ? lineTotals(journal.lines) : null;
  const ownEntry = journal?.created_by_id === user.id;
  const docLink = journal ? (documentHref(journal) ?? revaluationHref(journal)) : null;
  const canReverse =
    journal?.status === "POSTED" &&
    !journal.reversal_of_id &&
    !journal.source.document_id &&
    journal.source.type !== "OPENING_BALANCE" &&
    journal.source.type !== "YEAR_END" &&
    journal.id !== state.org.opening_balance_journal_id;

  const footer = journal && (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {journal.status === "DRAFT" && (
        <>
          <Button variant="ghost" icon={FiTrash2} className="mr-auto text-red-600" onClick={() => setDeleteOpen(true)}>
            Delete draft
          </Button>
          <Button
            variant="secondary"
            icon={FiEdit2}
            onClick={() => {
              setEditing(journal);
              setFormOpen(true);
            }}
          >
            Edit
          </Button>
          <Button icon={FiSend} disabled={anyPending} onClick={() => track("submit", async () => run(await actions.submitJournal(journal.id)))}>
            {pending("submit") ? "Posting…" : "Post"}
          </Button>
        </>
      )}
      {journal.status === "PENDING_APPROVAL" && (
        <>
          <Button variant="secondary" icon={FiCornerUpLeft} onClick={() => setRejectOpen(true)}>
            Send back
          </Button>
          <Button
            icon={FiCheck}
            disabled={ownEntry || anyPending}
            title={ownEntry ? "You prepared this entry, so another user has to approve it." : undefined}
            onClick={() => track("approve", async () => run(await actions.approveJournal(journal.id)))}
          >
            {pending("approve") ? "Posting…" : "Approve & post"}
          </Button>
        </>
      )}
      {canReverse && (
        <Button variant="secondary" icon={FiRotateCcw} onClick={() => setReverseOpen(true)}>
          Reverse entry
        </Button>
      )}
    </div>
  );

  return (
    <JournalViewerContext.Provider value={value}>
      {children}

      <RightDrawer
        open={!!openId}
        onClose={() => setOpenId(null)}
        widthClass="max-w-2xl"
        title={
          journal && (
            <span className="flex items-center gap-2">
              <span className="font-mono">{journal.number}</span>
              <StatusBadge status={journal.status} />
            </span>
          )
        }
        subtitle={journal && `${fmtDate(journal.date)} · ${journal.memo}`}
        footer={footer}
      >
        {!journal &&
          (journalQuery.error && !journalQuery.loading ? (
            <QueryError message={journalQuery.error} onRetry={journalQuery.refetch} />
          ) : (
            <Skeleton rows={8} />
          ))}
        {journal && totals && (
          <div className="space-y-5">
            {journal.status === "PENDING_APPROVAL" && (
              <Callout tone="warning" title="Awaiting approval">
                Prepared by {journal.created_by}.{" "}
                {ownEntry
                  ? AppConstants.useMockApi && state.users.length > 1
                    ? "You prepared this entry, so a different person has to approve it. Use the profile menu to switch user."
                    : `You prepared this entry, so another user with approval rights has to approve it. Entries below ${fmtCurrency(state.org.approval_threshold)} post without approval; the threshold is in Settings.`
                  : "Review the lines, then approve to post it to the ledger or send it back with a reason."}
              </Callout>
            )}
            {journal.status === "REVERSED" && reversal && (
              <Callout tone="info" title="Reversed">
                Cancelled by{" "}
                <button className="font-mono underline" onClick={() => setOpenId(reversal.id)}>
                  {reversal.number}
                </button>{" "}
                on {fmtDate(reversal.date)}. Both entries stay on the ledger.
              </Callout>
            )}
            {original && (
              <Callout tone="info" title="Reversal entry">
                Reverses{" "}
                <button className="font-mono underline" onClick={() => setOpenId(original.id)}>
                  {original.number}
                </button>
                .
              </Callout>
            )}

            <div className="rounded-xl border border-neutral-200 px-4 py-1 divide-y divide-neutral-100 dark:border-neutral-700 dark:divide-neutral-700">
              <DetailRow label="Source">
                <SourceBadge type={journal.source.type} reference={journal.source.reference} />
              </DetailRow>
              {docLink && (
                <DetailRow label="Document">
                  <Link href={docLink} onClick={() => setOpenId(null)} className="text-brand-700 hover:underline dark:text-brand-300">
                    {documentLabel(journal)}
                  </Link>
                </DetailRow>
              )}
              {journal.reference && journal.reference !== journal.source.reference && (
                <DetailRow label="Reference">{journal.reference}</DetailRow>
              )}
              <DetailRow label="Branch">{dimensionName(state, journal.branch_id)}</DetailRow>
              {journal.posted_at && (
                <DetailRow label="Posted">
                  {journal.posted_by} · {fmtDateTime(journal.posted_at)}
                </DetailRow>
              )}
              {journal.approved_by && <DetailRow label="Approved by">{journal.approved_by}</DetailRow>}
            </div>

            <div className="overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-700">
              <table className="min-w-full text-sm">
                <thead className="bg-neutral-50 text-neutral-500 dark:bg-neutral-900/40 dark:text-neutral-400">
                  <tr>
                    <th className="px-4 py-2 text-left font-normal">Account</th>
                    <th className="px-4 py-2 text-right font-normal">Debit</th>
                    <th className="px-4 py-2 text-right font-normal">Credit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700">
                  {journal.lines.map((l) => {
                    const a = accounts.get(l.account_id);
                    return (
                      <tr key={l.id}>
                        <td className="px-4 py-2.5">
                          <Link
                            href={`/accounting/general-ledger?account=${l.account_id}`}
                            onClick={() => setOpenId(null)}
                            className="font-medium text-neutral-900 hover:text-brand-700 dark:text-neutral-100 dark:hover:text-brand-300"
                          >
                            <span className="font-mono text-xs text-neutral-500 mr-2">{a?.code}</span>
                            {a?.name ?? l.account_id}
                          </Link>
                          {l.currency && l.amount_fc ? (
                            <p className="text-xs font-medium text-indigo-600 dark:text-indigo-300">
                              {fmtMoney(l.amount_fc, l.currency)} @ {(Math.max(l.debit, l.credit) / l.amount_fc).toFixed(4)}
                            </p>
                          ) : null}
                          {(l.description || l.cost_centre_id) && (
                            <p className="text-xs text-neutral-500 dark:text-neutral-400">
                              {l.description}
                              {l.cost_centre_id && ` · ${dimensionName(state, l.cost_centre_id)}`}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{fmtAccounting(l.debit)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{fmtAccounting(l.credit)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-neutral-50 font-semibold dark:bg-neutral-900/40">
                  <tr>
                    <td className="px-4 py-2.5">
                      Total{" "}
                      {Math.abs(totals.difference) < 0.005 ? (
                        <span className="ml-2 text-xs font-normal text-emerald-600">balanced</span>
                      ) : (
                        <span className="ml-2 text-xs font-normal text-red-600">
                          off by {fmtCurrency(Math.abs(totals.difference))}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmtAccounting(totals.debit)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{fmtAccounting(totals.credit)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <CustomFieldDetails entity="Journal" values={journal.custom_fields} onEdit={() => setEditCustom(true)} />

            {journal.source.document_id && journal.status === "POSTED" && (
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                This entry was generated by a document. To correct it, void or adjust the document; the ledger follows.
              </p>
            )}

            <div className="rounded-xl bg-neutral-50 px-4 py-3 text-xs text-neutral-500 dark:bg-neutral-900/40 dark:text-neutral-400">
              <p>
                Created by <span className="font-medium text-neutral-700 dark:text-neutral-200">{journal.created_by ?? "—"}</span>{" "}
                · {fmtDateTime(journal.created_at)}
              </p>
              <p className="mt-0.5">
                Last updated by{" "}
                <span className="font-medium text-neutral-700 dark:text-neutral-200">{journal.updated_by ?? "—"}</span> ·{" "}
                {fmtDateTime(journal.updated_at)}
              </p>
            </div>
          </div>
        )}
      </RightDrawer>

      <JournalFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        draft={editing}
        onSaved={(j) => setOpenId(j.id)}
      />

      {journal && (
        <>
          <EditCustomFieldsModal
            entity="Journal"
            recordId={journal.id}
            recordLabel={journal.number}
            values={journal.custom_fields}
            open={editCustom}
            onClose={() => setEditCustom(false)}
          />
          <ReasonModal
            open={reverseOpen}
            onClose={() => setReverseOpen(false)}
            title={`Reverse ${journal.number}`}
            description="Posts an equal and opposite entry. The original stays on the ledger, marked reversed."
            confirmLabel="Post reversal"
            withDate
            defaultDate={todayIso()}
            placeholder="e.g. Posted to the wrong expense account"
            onConfirm={async (reason, date) => {
              const res = await actions.reverseJournal(journal.id, date, reason);
              if (res.ok) setOpenId(res.data.id);
              return res;
            }}
          />
          <ReasonModal
            open={rejectOpen}
            onClose={() => setRejectOpen(false)}
            title={`Send ${journal.number} back`}
            description="Returns the entry to the preparer as a draft."
            confirmLabel="Send back"
            placeholder="e.g. Attach the signed bonus memo"
            onConfirm={(reason) => actions.rejectJournal(journal.id, reason)}
          />
          <Modal
            open={deleteOpen}
            onClose={() => setDeleteOpen(false)}
            title={`Delete draft ${journal.number}?`}
            description="Drafts never touched the ledger, so this cannot affect any balance."
            size="md"
            buttons={[
              { label: "Keep", onClick: () => setDeleteOpen(false), className: BTN_SECONDARY },
              {
                label: "Delete draft",
                className: BTN_DANGER,
                onClick: async () => {
                  if (run(await actions.deleteDraftJournal(journal.id))) {
                    setDeleteOpen(false);
                    setOpenId(null);
                  }
                },
              },
            ]}
          />
        </>
      )}
    </JournalViewerContext.Provider>
  );
};
