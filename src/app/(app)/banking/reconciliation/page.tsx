"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { FiCheck, FiCheckCircle, FiLink, FiPlus, FiSearch, FiUpload, FiX, FiZap } from "react-icons/fi";
import { Button, Callout, Field, FormError, PageHeader, Panel, compactInputClass, inputClass } from "@/components/ui";
import { Tabs } from "@/components/tabs";
import StatusBadge from "@/components/statusBadge";
import { BTN_PRIMARY, BTN_SECONDARY, Modal } from "@/components/modal";
import { QueryError, Skeleton } from "@/components/queryState";
import AccountSelect from "@/components/accounting/accountSelect";
import { useJournalViewer } from "@/components/accounting/journalViewer";
import StatementImportModal from "@/components/banking/statementImportModal";
import { useLedger } from "@/store/ledgerStore";
import { useReport } from "@/services/useApiQuery";
import type { BankAccountBalances, BankReconciliation, ReconciliationCandidate, ReconciliationLine } from "@/models/banking";
import { useQueryParam } from "@/utils/useQueryParam";
import { usePending } from "@/services/usePending";
import { fmtDate, fmtDateTime, fmtMoney } from "@/utils/format";
import { daysBetween } from "@/utils/dates";

const notCash = (a: { is_bank: boolean }) => !a.is_bank;

export default function ReconciliationPage() {
  const { state, actions } = useLedger();
  const { openJournal } = useJournalViewer();
  const balances = useReport<BankAccountBalances>("/bank-accounts/balances", {});
  const [picked, setBankId] = useState<string | null>(null);
  const [tab, setTab] = useState("REVIEW");
  const [matching, setMatching] = useState<ReconciliationLine | null>(null);
  const [creating, setCreating] = useState<ReconciliationLine | null>(null);
  const [importing, setImporting] = useState(false);
  useQueryParam("account", setBankId);

  const firstWithFeed = balances.data?.items.find((i) => i.statement_lines > 0)?.bank_account_id;
  const bankId = picked ?? (balances.data ? (firstWithFeed ?? state.bankAccounts[0]?.id ?? null) : null);
  const bank = state.bankAccounts.find((b) => b.id === bankId);
  const recQuery = useReport<BankReconciliation>(bankId ? "/reconciliation/get" : null, { bank_account_id: bankId ?? "" });
  const rec = recQuery.data?.bank_account_id === bankId ? recQuery.data : null;
  const money = (v: number) => fmtMoney(v, rec?.currency);

  const lines = rec?.lines ?? [];
  const matchedCount = rec?.counts.MATCHED ?? 0;
  const review = lines.filter((l) => l.status !== "MATCHED");
  const shown = tab === "REVIEW" ? review : lines.filter((l) => l.status === "MATCHED");
  const progress = lines.length ? Math.round((matchedCount / lines.length) * 100) : 100;
  const inTransit = rec?.candidates.filter((c) => c.in_transit) ?? [];

  const { pending, track, anyPending } = usePending();
  const run = (res: { ok: boolean; message?: string; error?: string }) => {
    if (res.ok) toast.success(res.message ?? "Done");
    else toast.error(res.error ?? "Failed");
    return res.ok;
  };

  const acceptAllSuggestions = () =>
    track("all", async () => {
      const suggested = lines.filter((l) => l.status === "SUGGESTED" && l.suggested_journal_id);
      let done = 0;
      for (const l of suggested) if ((await actions.matchStatementLine(l.id, l.suggested_journal_id!)).ok) done++;
      toast.success(`${done} suggested matches accepted`);
    });
  const lineBusy = (id: string) => pending(id) || pending("all");

  const loadError = balances.data ? (rec ? null : recQuery.error) : balances.error;
  const retry = balances.data ? recQuery.refetch : balances.refetch;

  return (
    <div>
      <PageHeader
        title="Bank reconciliation"
        description="Match each statement line to the ledger. Lines with no ledger entry (bank charges, interest, unknown deposits) can be posted from here."
        actions={
          <>
            <select
              value={bankId ?? ""}
              onChange={(e) => setBankId(e.target.value)}
              disabled={!bankId}
              className={`${compactInputClass} w-60`}
              data-tour="rec-bank"
            >
              {state.bankAccounts.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                  {b.is_active ? "" : " (inactive)"}
                </option>
              ))}
            </select>
            <Button
              variant="secondary"
              icon={FiUpload}
              disabled={!bank?.is_active}
              title={bank && !bank.is_active ? `${bank.name} is inactive` : undefined}
              onClick={() => setImporting(true)}
              data-tour="rec-import"
            >
              Import statement
            </Button>
            <Button
              icon={FiCheckCircle}
              data-tour="rec-complete"
              disabled={!rec || review.length > 0 || lines.length === 0 || anyPending}
              title={review.length ? "Match every line first" : undefined}
              onClick={() => track("complete", async () => bank && run(await actions.completeReconciliation(bank.id)))}
            >
              {pending("complete") ? "Completing…" : "Complete reconciliation"}
            </Button>
          </>
        }
      />

      {!rec || !bank ? (
        loadError ? (
          <QueryError message={loadError} onRetry={retry} />
        ) : (
          <Panel title="Reconciliation summary">
            <Skeleton rows={7} />
          </Panel>
        )
      ) : lines.length === 0 ? (
        <Callout tone="info" title="No statement lines for this account yet">
          {bank.name} was last reconciled {fmtDateTime(rec.last_reconciled_at)}. Import the bank&apos;s CSV statement to reconcile it
          here.
          <div className="mt-3">
            <Button size="sm" icon={FiUpload} onClick={() => setImporting(true)}>
              Import statement
            </Button>
          </div>
        </Callout>
      ) : (
        <div aria-busy={recQuery.loading}>
          {recQuery.error && <QueryError message={`Showing the last figures loaded. ${recQuery.error}`} onRetry={recQuery.refetch} className="mb-4" />}
          <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
            <Panel tour="rec-summary" title="Reconciliation summary" subtitle={`Statement to ${fmtDate(rec.statement_date)}`} className="xl:col-span-2">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-neutral-500 dark:text-neutral-400">Balance per ledger</dt>
                    <dd className="whitespace-nowrap tabular-nums font-medium">{money(rec.ledger_balance)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-neutral-500 dark:text-neutral-400">Less: in ledger, not yet on statement</dt>
                    <dd className="whitespace-nowrap tabular-nums">{money(-rec.ledger_only_total)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-neutral-500 dark:text-neutral-400">Add: on statement, not yet matched</dt>
                    <dd className="whitespace-nowrap tabular-nums">{money(rec.statement_only)}</dd>
                  </div>
                  <div className="flex justify-between border-t border-neutral-200 pt-2 font-semibold dark:border-neutral-700">
                    <dt>Expected statement balance</dt>
                    <dd className="whitespace-nowrap tabular-nums">{money(rec.adjusted_balance)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-neutral-500 dark:text-neutral-400">Balance per bank statement</dt>
                    <dd className="whitespace-nowrap tabular-nums font-medium">{money(rec.statement_balance)}</dd>
                  </div>
                  <div
                    className={`flex justify-between rounded-lg px-2 py-1.5 font-semibold ${
                      rec.difference === 0 ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300" : "bg-red-50 text-red-700"
                    }`}
                  >
                    <dt>Unexplained difference</dt>
                    <dd className="whitespace-nowrap tabular-nums">{money(rec.difference)}</dd>
                  </div>
                </dl>
                <div>
                  <div className="mb-2 flex justify-between text-sm">
                    <span className="text-neutral-500 dark:text-neutral-400">Lines matched</span>
                    <span className="font-medium">
                      {matchedCount} of {lines.length}
                    </span>
                  </div>
                  <div className="h-3 rounded-full bg-neutral-100 dark:bg-neutral-700">
                    <div className="h-3 rounded-full bg-brand-600 transition-all" style={{ width: `${progress}%` }} />
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                    {(["MATCHED", "SUGGESTED", "UNMATCHED"] as const).map((s) => (
                      <div key={s} className="rounded-lg bg-neutral-50 p-2 dark:bg-neutral-900/40">
                        <p className="text-lg font-bold tabular-nums">{rec.counts[s]}</p>
                        <StatusBadge status={s} />
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 text-xs text-neutral-500 dark:text-neutral-400">Last completed {fmtDateTime(rec.last_reconciled_at)}.</p>
                </div>
              </div>
            </Panel>

            <Panel tour="rec-transit" title="Not yet on statement" subtitle="Posted in the ledger, waiting to clear">
              {inTransit.length === 0 ? (
                <p className="text-sm text-neutral-500">Nothing outstanding.</p>
              ) : (
                <ul className="divide-y divide-neutral-100 dark:divide-neutral-700">
                  {inTransit.map((c) => (
                    <li key={c.journal_id}>
                      <button onClick={() => openJournal(c.journal_id)} className="flex w-full items-center justify-between py-2 text-left text-sm">
                        <span className="min-w-0">
                          <span className="block truncate">{c.memo}</span>
                          <span className="text-xs text-neutral-500">
                            {c.number} · {fmtDate(c.date)} · {daysBetween(c.date, rec.statement_date)}d
                          </span>
                        </span>
                        <span className={`ml-3 shrink-0 tabular-nums ${c.amount > 0 ? "text-emerald-600" : ""}`}>{money(c.amount)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <Tabs
            tabs={[
              { id: "REVIEW", label: "To review", count: review.length },
              { id: "MATCHED", label: "Matched", count: matchedCount },
            ]}
            value={tab}
            onChange={setTab}
            actions={
              rec.counts.SUGGESTED > 0 && (
                <Button variant="secondary" icon={FiZap} disabled={anyPending} onClick={acceptAllSuggestions}>
                  {pending("all") ? "Accepting…" : "Accept all suggestions"}
                </Button>
              )
            }
          />

          <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800" data-tour="rec-lines">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-50/60 text-left text-neutral-500 dark:bg-neutral-800 dark:text-neutral-300">
                <tr>
                  <th className="px-4 py-3 font-normal">Date</th>
                  <th className="px-4 py-3 font-normal">Statement description</th>
                  <th className="px-4 py-3 font-normal text-right">Money in</th>
                  <th className="px-4 py-3 font-normal text-right">Money out</th>
                  <th className="px-4 py-3 font-normal">Ledger match</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700">
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-neutral-500">
                      {tab === "REVIEW" ? "Every line is matched. Complete the reconciliation to sign it off." : "Nothing matched yet."}
                    </td>
                  </tr>
                )}
                {shown.map((l) => (
                  <tr key={l.id}>
                    <td className="whitespace-nowrap px-4 py-3">{fmtDate(l.date)}</td>
                    <td className="px-4 py-3 font-mono text-xs">{l.description}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{l.amount > 0 ? money(l.amount) : ""}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{l.amount < 0 ? money(-l.amount) : ""}</td>
                    <td className="px-4 py-3">
                      {l.matched_journal_id ? (
                        <button onClick={() => openJournal(l.matched_journal_id!)} className="text-left">
                          <span className="font-mono text-xs text-brand-700 dark:text-brand-300">{l.matched_journal_number}</span>
                          <span className="block max-w-xs truncate text-xs text-neutral-500">{l.matched_journal_memo}</span>
                        </button>
                      ) : l.suggested_journal_id ? (
                        <button onClick={() => openJournal(l.suggested_journal_id!)} className="text-left">
                          <span className="inline-flex items-center gap-1 text-xs text-blue-700 dark:text-blue-300">
                            <FiZap className="h-3 w-3" /> Suggested: <span className="font-mono">{l.suggested_journal_number}</span>
                          </span>
                          <span className="block max-w-xs truncate text-xs text-neutral-500">{l.suggested_journal_memo}</span>
                        </button>
                      ) : (
                        <StatusBadge status="UNMATCHED" label="No ledger entry found" />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        {l.status === "MATCHED" ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={FiX}
                            disabled={lineBusy(l.id)}
                            onClick={() => track(l.id, async () => run(await actions.unmatchStatementLine(l.id)))}
                          >
                            Unmatch
                          </Button>
                        ) : (
                          <>
                            {l.suggested_journal_id && (
                              <Button
                                size="sm"
                                icon={FiCheck}
                                disabled={lineBusy(l.id)}
                                onClick={() => track(l.id, async () => run(await actions.matchStatementLine(l.id, l.suggested_journal_id!)))}
                              >
                                Accept
                              </Button>
                            )}
                            <Button size="sm" variant="secondary" icon={FiSearch} onClick={() => setMatching(l)}>
                              Find
                            </Button>
                            <Button size="sm" variant="secondary" icon={FiPlus} onClick={() => setCreating(l)}>
                              Create
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <FindMatchModal
        line={matching}
        currency={rec?.currency}
        candidates={rec?.candidates ?? []}
        onClose={() => setMatching(null)}
        onMatch={async (journalId) => {
          if (matching && run(await actions.matchStatementLine(matching.id, journalId))) setMatching(null);
        }}
      />
      <CreateEntryModal line={creating} currency={rec?.currency} onClose={() => setCreating(null)} />
      {bank && <StatementImportModal bankId={bank.id} open={importing} onClose={() => setImporting(false)} />}
    </div>
  );
}

const FindMatchModal = ({
  line,
  currency,
  candidates,
  onClose,
  onMatch,
}: {
  line: ReconciliationLine | null;
  currency: string | undefined;
  candidates: ReconciliationCandidate[];
  onClose: () => void;
  onMatch: (journalId: string) => void;
}) => {
  const ranked = line
    ? [...candidates].sort(
        (a, b) =>
          Math.abs(a.amount - line.amount) - Math.abs(b.amount - line.amount) ||
          Math.abs(daysBetween(a.date, line.date)) - Math.abs(daysBetween(b.date, line.date)),
      )
    : [];
  return (
    <Modal
      open={!!line}
      onClose={onClose}
      size="3xl"
      title="Match to a ledger entry"
      description={line ? `${line.description} · ${fmtMoney(line.amount, currency)} on ${fmtDate(line.date)}` : ""}
      buttons={[{ label: "Close", onClick: onClose, className: BTN_SECONDARY }]}
    >
      {ranked.length === 0 ? (
        <p className="text-sm text-neutral-500">No unmatched ledger entries in this statement period. Create an entry instead.</p>
      ) : (
        <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 dark:divide-neutral-700 dark:border-neutral-700">
          {ranked.slice(0, 12).map((c) => {
            const exact = line && Math.abs(c.amount - line.amount) < 0.005;
            return (
              <li key={c.journal_id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0 text-sm">
                  <p className="truncate font-medium">{c.memo}</p>
                  <p className="text-xs text-neutral-500">
                    {c.number} · {fmtDate(c.date)}
                    {exact && <span className="ml-2 font-medium text-emerald-600">exact amount</span>}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="tabular-nums text-sm">{fmtMoney(c.amount, currency)}</span>
                  <Button size="sm" icon={FiLink} variant={exact ? "primary" : "secondary"} onClick={() => onMatch(c.journal_id)}>
                    Match
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
};

const CreateEntryModal = ({ line, currency, onClose }: { line: ReconciliationLine | null; currency: string | undefined; onClose: () => void }) => {
  const { actions } = useLedger();
  const [accountId, setAccountId] = useState("");
  const [memo, setMemo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!line) return;
    setError(null);
    setMemo(line.description);
    const d = line.description.toLowerCase();
    setAccountId(
      d.includes("interest") ? "acc_4100" : d.includes("charge") || d.includes("fee") ? "acc_6060" : "",
    );
  }, [line]);

  const submit = async () => {
    if (!line) return;
    setBusy(true);
    try {
      const res = await actions.createEntryFromStatementLine(line.id, accountId, memo);
      if (!res.ok) return setError(res.error);
      toast.success(res.message ?? "Posted");
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!line}
      onClose={onClose}
      size="lg"
      title="Create entry from statement line"
      description={line ? `${fmtMoney(line.amount, currency)} on ${fmtDate(line.date)}. The bank side is filled in for you.` : ""}
      buttons={[
        { label: "Cancel", onClick: onClose, className: BTN_SECONDARY },
        { label: "Post & match", onClick: submit, className: BTN_PRIMARY, disabled: busy },
      ]}
    >
      <FormError message={error} />
      <div className="space-y-4">
        <Field
          label={line && line.amount > 0 ? "Credit account (where the money came from)" : "Debit account (what it was for)"}
          required
          hint="Unidentified receipts can go to a suspense or accrual account until you know who paid."
        >
          <AccountSelect value={accountId} onChange={setAccountId} className={inputClass} filter={notCash} />
        </Field>
        <Field label="Memo" required>
          <input value={memo} onChange={(e) => setMemo(e.target.value)} className={inputClass} />
        </Field>
      </div>
    </Modal>
  );
};
