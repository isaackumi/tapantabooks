"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { FiAlertTriangle, FiCheckCircle, FiInfo, FiLock, FiPlus, FiSave, FiSearch, FiTrash2, FiRotateCcw } from "react-icons/fi";
import { Button, Callout, compactInputClass, Field, inputClass, PageHeader, Panel, Toggle } from "@/components/ui";
import StatCard from "@/components/statCard";
import { BTN_PRIMARY, BTN_SECONDARY, Modal } from "@/components/modal";
import { useJournalViewer } from "@/components/accounting/journalViewer";
import { useLedger } from "@/store/ledgerStore";
import { useReport } from "@/services/useApiQuery";
import { QueryState } from "@/components/queryState";
import { ACCOUNT_TYPE_LABEL, ACCOUNT_TYPE_ORDER } from "@/lib/ledger";
import { documentTotals } from "@/lib/documents";
import { isForeign } from "@/lib/fx";
import type { Account, OpeningBalancesView, OpeningItemInput, PurchaseBill, SalesInvoice } from "@/models/accounting";
import { addDays, todayIso } from "@/utils/dates";
import { classNames, fmtAccounting, fmtCurrency, fmtDate, round2 } from "@/utils/format";

const OPENING_EQUITY = "acc_3900";
const AR = "acc_1100";
const AP = "acc_2010";

type Amounts = Record<string, { debit: string; credit: string }>;
type ItemRow = { key: string; party_id: string; reference: string; issue_date: string; due_date: string; amount: string };

const num = (v: string) => round2(Number(v) || 0);

let rowSeq = 0;
const blankItem = (date: string): ItemRow => ({
  key: `row_${rowSeq++}`,
  party_id: "",
  reference: "",
  issue_date: date ? addDays(date, -1) : "",
  due_date: date ? addDays(date, 29) : "",
  amount: "",
});

const toInput = (rows: ItemRow[]): OpeningItemInput[] =>
  rows.map((r) => ({
    party_id: r.party_id,
    reference: r.reference,
    issue_date: r.issue_date,
    due_date: r.due_date,
    amount: num(r.amount),
  }));

export default function OpeningBalancesPage() {
  const query = useReport<OpeningBalancesView>("/opening-balances/get", {});
  const { data } = query;

  if (!data) {
    return (
      <div>
        <PageHeader title="Opening balances" description="Balances brought forward from your previous system." />
        <QueryState query={query}>{() => null}</QueryState>
      </div>
    );
  }

  // Remount the form whenever the saved position changes so it starts from the server's copy.
  const key = [
    data.journal_id,
    data.conversion_date,
    ...data.receivables.map((d) => `${d.id}:${d.journal_id}`),
    ...data.payables.map((d) => `${d.id}:${d.journal_id}`),
  ].join("|");
  return <OpeningBalancesForm key={key} view={data} />;
}

function OpeningBalancesForm({ view }: { view: OpeningBalancesView }) {
  const { state, actions } = useLedger();
  const { openJournal } = useJournalViewer();
  const today = todayIso();

  const defaultDate =
    view.conversion_date ??
    state.periods
      .filter((p) => p.status === "OPEN")
      .map((p) => p.start_date)
      .sort()[0] ??
    today;
  const maxDate = view.first_transaction_date && view.first_transaction_date < today ? view.first_transaction_date : today;

  const [date, setDate] = useState(defaultDate);
  const [amounts, setAmounts] = useState<Amounts>(() =>
    Object.fromEntries(
      view.lines.map((l) => [l.account_id, { debit: l.debit ? String(l.debit) : "", credit: l.credit ? String(l.credit) : "" }]),
    ),
  );
  const [newReceivables, setNewReceivables] = useState<ItemRow[]>([]);
  const [newPayables, setNewPayables] = useState<ItemRow[]>([]);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [onlyWithBalances, setOnlyWithBalances] = useState(view.lines.length > 0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const hasExisting = Boolean(view.journal_id) || view.receivables.length > 0 || view.payables.length > 0;
  const readOnly = hasExisting && Boolean(view.locked_reason);

  const bankByGl = useMemo(() => new Map(state.bankAccounts.map((b) => [b.gl_account_id, b])), [state.bankAccounts]);
  const postable = useMemo(
    () =>
      state.accounts
        .filter((a) => !a.is_group && a.is_active && a.id !== OPENING_EQUITY)
        .sort((a, b) => a.code.localeCompare(b.code)),
    [state.accounts],
  );

  const partyName = (doc: SalesInvoice | PurchaseBill) =>
    "customer_id" in doc
      ? state.customers.find((c) => c.id === doc.customer_id)?.name
      : state.suppliers.find((s) => s.id === doc.supplier_id)?.name;
  const outstanding = (doc: SalesInvoice | PurchaseBill) => round2(documentTotals(doc.lines, state.taxCodes).total - doc.amount_paid);
  const itemTotal = (doc: SalesInvoice | PurchaseBill) => documentTotals(doc.lines, state.taxCodes).total;

  const arTotal = round2(
    view.receivables.filter((d) => !removed.has(d.id)).reduce((t, d) => t + itemTotal(d), 0) +
      newReceivables.reduce((t, r) => t + num(r.amount), 0),
  );
  const apTotal = round2(
    view.payables.filter((d) => !removed.has(d.id)).reduce((t, d) => t + itemTotal(d), 0) +
      newPayables.reduce((t, r) => t + num(r.amount), 0),
  );

  const entered = Object.entries(amounts)
    .map(([account_id, v]) => ({ account_id, debit: num(v.debit), credit: num(v.credit) }))
    .filter((l) => l.debit > 0 || l.credit > 0);
  const debits = round2(entered.reduce((t, l) => t + l.debit, 0) + arTotal);
  const credits = round2(entered.reduce((t, l) => t + l.credit, 0) + apTotal);

  // Opening Balance Equity after saving: what is there now, less this screen's current share, plus the new share.
  const savedShare =
    -view.lines.reduce((t, l) => t + l.debit - l.credit, 0) -
    view.receivables.reduce((t, d) => t + itemTotal(d), 0) +
    view.payables.reduce((t, d) => t + itemTotal(d), 0);
  const residual = round2(view.opening_equity_balance - savedShare - (debits - credits));

  const isControl = (a: Account) => a.id === AR || a.id === AP;
  const isForeignBank = (a: Account) => isForeign(bankByGl.get(a.id)?.currency);
  const term = search.trim().toLowerCase();
  const visible = postable.filter((a) => {
    if (term && !`${a.code} ${a.name}`.toLowerCase().includes(term)) return false;
    if (!onlyWithBalances) return true;
    if (a.id === AR) return arTotal > 0;
    if (a.id === AP) return apTotal > 0;
    const v = amounts[a.id];
    return Boolean(v && (num(v.debit) || num(v.credit)));
  });

  const setAmount = (id: string, side: "debit" | "credit", value: string) =>
    setAmounts((prev) => {
      const row = { ...(prev[id] ?? { debit: "", credit: "" }), [side]: value };
      if (value && num(value) > 0) row[side === "debit" ? "credit" : "debit"] = "";
      return { ...prev, [id]: row };
    });

  const save = async () => {
    setBusy(true);
    try {
      const res = await actions.saveOpeningBalances({
        date,
        lines: entered,
        receivables: toInput(newReceivables),
        payables: toInput(newPayables),
        removed_item_ids: [...removed],
      });
      setConfirmOpen(false);
      if (res.ok) toast.success(res.message ?? "Opening balances saved", { duration: 6000 });
      else toast.error(res.error, { duration: 6000 });
    } finally {
      setBusy(false);
    }
  };

  const changes =
    date !== view.conversion_date ||
    newReceivables.length > 0 ||
    newPayables.length > 0 ||
    removed.size > 0 ||
    JSON.stringify(entered.slice().sort((a, b) => a.account_id.localeCompare(b.account_id))) !==
      JSON.stringify(view.lines.slice().sort((a, b) => a.account_id.localeCompare(b.account_id)));

  return (
    <div>
      <PageHeader
        title="Opening balances"
        description="What the business owned, owed and was owed on the day you started using TroveSuite Accounting. Enter each balance from your last trial balance; anything left over sits in Opening Balance Equity until it is accounted for."
        actions={
          !readOnly && (
            <Button icon={FiSave} disabled={!changes || busy} onClick={() => setConfirmOpen(true)} data-tour="ob-save">
              Save opening balances
            </Button>
          )
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" data-tour="stats">
        <StatCard label="Conversion date" value={fmtDate(date)} sub={view.conversion_date ? "Saved" : "Not saved yet"} />
        <StatCard label="Customers owed you" value={fmtCurrency(arTotal)} sub={`${view.receivables.length - [...removed].filter((id) => view.receivables.some((d) => d.id === id)).length + newReceivables.length} open invoice(s)`} />
        <StatCard label="You owed suppliers" value={fmtCurrency(apTotal)} sub={`${view.payables.length - [...removed].filter((id) => view.payables.some((d) => d.id === id)).length + newPayables.length} open bill(s)`} />
        <StatCard
          label="Opening Balance Equity"
          value={fmtCurrency(Math.abs(residual))}
          tone={residual === 0 ? "success" : "warning"}
          sub={residual === 0 ? "In balance" : residual > 0 ? "Debit left over" : "Credit left over"}
          info="Takes the difference between the debits and credits you enter. Once every balance, including retained earnings, is in, it should be zero."
        />
      </div>

      <div className="mb-6 space-y-3">
        {readOnly ? (
          <Callout tone="warning" icon={FiLock} title="Opening balances are locked">
            {view.locked_reason}{" "}
            <Link href="/accounting/periods" className="font-medium underline">
              Fiscal periods
            </Link>
          </Callout>
        ) : view.first_transaction_date ? (
          <Callout tone="info" icon={FiInfo}>
            Your first transaction is dated {fmtDate(view.first_transaction_date)}, so the conversion date must be on or before it. Saving
            reverses the previous opening entry and posts a fresh one, so the audit trail keeps every version.
          </Callout>
        ) : (
          <Callout tone="info" icon={FiInfo}>
            Pick the day you start recording in TroveSuite (usually the first day of a month or year) and enter balances as they stood
            at the close of the day before.
          </Callout>
        )}
        {residual !== 0 && (
          <Callout tone="warning" icon={FiAlertTriangle} title={`${fmtCurrency(Math.abs(residual))} will sit in Opening Balance Equity`}>
            Debits and credits differ. This is usually a missing balance, most often retained earnings (prior years&apos; profit). You
            can save now and finish later; the balance sheet shows the difference until it is cleared.
          </Callout>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-4">
        <div className="space-y-6">
          <Panel title="Conversion date" tour="ob-date">
            <Field
              label="Balances as at"
              hint={view.journal_number ? `Posted as ${view.journal_number}` : "Not posted yet"}
            >
              <input type="date" className={inputClass} value={date} max={maxDate} disabled={readOnly} onChange={(e) => setDate(e.target.value)} />
            </Field>
            {view.journal_id && (
              <button className="mt-3 text-sm font-medium text-brand-700 hover:underline dark:text-brand-300" onClick={() => openJournal(view.journal_id!)}>
                View opening journal
              </button>
            )}
          </Panel>

          <Panel title="Summary" tour="ob-summary">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-neutral-500">Total debits</dt>
                <dd className="tabular-nums">{fmtCurrency(debits)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500">Total credits</dt>
                <dd className="tabular-nums">{fmtCurrency(credits)}</dd>
              </div>
              <div className="flex justify-between border-t border-neutral-200 pt-2 font-semibold dark:border-neutral-700">
                <dt>Opening Balance Equity</dt>
                <dd className={classNames("tabular-nums", residual === 0 ? "text-emerald-600" : "text-amber-600")}>
                  {residual === 0 ? (
                    <span className="inline-flex items-center gap-1">
                      <FiCheckCircle className="h-4 w-4" /> Nil
                    </span>
                  ) : (
                    fmtAccounting(residual)
                  )}
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-neutral-500">
              Accounts Receivable and Payable come from the open invoices and bills listed below, so ageing and statements work from day
              one.
            </p>
          </Panel>
        </div>

        <div className="space-y-6 xl:col-span-3">
          <Panel
            tour="ob-accounts"
            title="Account balances"
            subtitle="Debit for assets and expenses, credit for liabilities, equity and income"
            bodyClassName="px-0 pb-2"
            actions={
              <div className="flex items-center gap-3">
                <div className="relative">
                  <FiSearch className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                  <input
                    className={classNames(compactInputClass, "w-48 pl-8")}
                    placeholder="Find an account"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <Toggle checked={onlyWithBalances} onChange={setOnlyWithBalances} label="With balances only" />
              </div>
            }
          >
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-neutral-500 dark:text-neutral-400">
                  <tr>
                    <th className="px-6 py-2 font-normal">Account</th>
                    <th className="w-44 px-3 py-2 text-right font-normal">Debit</th>
                    <th className="w-44 px-6 py-2 text-right font-normal">Credit</th>
                  </tr>
                </thead>
                {ACCOUNT_TYPE_ORDER.map((type) => {
                  const rows = visible.filter((a) => a.type === type);
                  if (rows.length === 0) return null;
                  return (
                    <tbody key={type} className="divide-y divide-neutral-100 dark:divide-neutral-700">
                      <tr className="bg-neutral-50/80 dark:bg-neutral-900/30">
                        <td colSpan={3} className="px-6 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                          {ACCOUNT_TYPE_LABEL[type]}
                        </td>
                      </tr>
                      {rows.map((a) => {
                        const derived = isControl(a);
                        const foreign = isForeignBank(a);
                        return (
                          <tr key={a.id}>
                            <td className="px-6 py-2">
                              <span className="mr-2 font-mono text-xs text-neutral-500">{a.code}</span>
                              {a.name}
                              {derived && <p className="text-xs text-neutral-500">From the open {a.id === AR ? "invoices" : "bills"} below</p>}
                              {foreign && (
                                <p className="text-xs text-neutral-500">
                                  Held in {bankByGl.get(a.id)?.currency}; post its opening balance as a manual journal with the foreign amount.
                                </p>
                              )}
                            </td>
                            {derived ? (
                              <>
                                <td className="px-3 py-2 text-right tabular-nums text-neutral-500">{a.id === AR ? fmtAccounting(arTotal) : "—"}</td>
                                <td className="px-6 py-2 text-right tabular-nums text-neutral-500">{a.id === AP ? fmtAccounting(apTotal) : "—"}</td>
                              </>
                            ) : (
                              (["debit", "credit"] as const).map((side) => (
                                <td key={side} className={side === "debit" ? "px-3 py-1.5" : "px-6 py-1.5"}>
                                  <input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    inputMode="decimal"
                                    aria-label={`${a.name} ${side}`}
                                    className={classNames(compactInputClass, "text-right tabular-nums")}
                                    value={amounts[a.id]?.[side] ?? ""}
                                    disabled={readOnly || foreign}
                                    onChange={(e) => setAmount(a.id, side, e.target.value)}
                                  />
                                </td>
                              ))
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  );
                })}
              </table>
              {visible.length === 0 && (
                <p className="px-6 py-6 text-sm text-neutral-500">
                  {onlyWithBalances ? "No balances entered yet. Turn off “With balances only” to see every account." : "No accounts match."}
                </p>
              )}
            </div>
          </Panel>

          <OpenItems
            kind="receivable"
            existing={view.receivables}
            rows={newReceivables}
            setRows={setNewReceivables}
            removed={removed}
            setRemoved={setRemoved}
            date={date}
            readOnly={readOnly}
            partyName={partyName}
            outstanding={outstanding}
            itemTotal={itemTotal}
          />
          <OpenItems
            kind="payable"
            existing={view.payables}
            rows={newPayables}
            setRows={setNewPayables}
            removed={removed}
            setRemoved={setRemoved}
            date={date}
            readOnly={readOnly}
            partyName={partyName}
            outstanding={outstanding}
            itemTotal={itemTotal}
          />
        </div>
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        size="md"
        title="Save opening balances?"
        description={`Posts ${entered.length} account balance(s) dated ${fmtDate(date)}${
          newReceivables.length + newPayables.length ? `, adds ${newReceivables.length + newPayables.length} open item(s)` : ""
        }${removed.size ? `, removes ${removed.size}` : ""}.${view.journal_number ? ` ${view.journal_number} is reversed and replaced.` : ""}${
          residual !== 0 ? ` ${fmtCurrency(Math.abs(residual))} stays in Opening Balance Equity.` : ""
        }`}
        buttons={[
          { label: "Cancel", onClick: () => setConfirmOpen(false), className: BTN_SECONDARY },
          { label: busy ? "Saving…" : "Save and post", onClick: save, className: BTN_PRIMARY, disabled: busy },
        ]}
      />
    </div>
  );
}

function OpenItems({
  kind,
  existing,
  rows,
  setRows,
  removed,
  setRemoved,
  date,
  readOnly,
  partyName,
  outstanding,
  itemTotal,
}: {
  kind: "receivable" | "payable";
  existing: (SalesInvoice | PurchaseBill)[];
  rows: ItemRow[];
  setRows: React.Dispatch<React.SetStateAction<ItemRow[]>>;
  removed: Set<string>;
  setRemoved: React.Dispatch<React.SetStateAction<Set<string>>>;
  date: string;
  readOnly: boolean;
  partyName: (doc: SalesInvoice | PurchaseBill) => string | undefined;
  outstanding: (doc: SalesInvoice | PurchaseBill) => number;
  itemTotal: (doc: SalesInvoice | PurchaseBill) => number;
}) {
  const { state } = useLedger();
  const isAr = kind === "receivable";
  const parties = (isAr ? state.customers : state.suppliers).filter((p) => p.status === "ACTIVE");
  const update = (key: string, patch: Partial<ItemRow>) =>
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r;
        const next = { ...r, ...patch };
        if (patch.party_id || patch.issue_date) {
          const terms = parties.find((p) => p.id === next.party_id)?.payment_terms_days;
          if (terms !== undefined && next.issue_date) next.due_date = addDays(next.issue_date, terms);
        }
        return next;
      }),
    );
  const toggleRemoved = (id: string) =>
    setRemoved((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Panel
      tour={isAr ? "ob-receivables" : "ob-payables"}
      title={isAr ? "Unpaid customer invoices" : "Unpaid supplier bills"}
      subtitle={
        isAr
          ? "Each invoice still owed to you at the conversion date, with its original number, so you can receive payment against it"
          : "Each bill you still owed at the conversion date, so you can pay it from TroveSuite"
      }
      bodyClassName="px-0 pb-3"
      actions={
        !readOnly && (
          <Button size="sm" variant="secondary" icon={FiPlus} onClick={() => setRows((prev) => [...prev, blankItem(date)])}>
            Add {isAr ? "invoice" : "bill"}
          </Button>
        )
      }
    >
      {existing.length === 0 && rows.length === 0 ? (
        <p className="px-6 py-4 text-sm text-neutral-500">
          None yet. {isAr ? "Add each customer invoice that was unpaid at the conversion date." : "Add each supplier bill that was unpaid at the conversion date."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-neutral-500 dark:text-neutral-400">
              <tr>
                <th className="px-6 py-2 font-normal">{isAr ? "Customer" : "Supplier"}</th>
                <th className="px-3 py-2 font-normal">{isAr ? "Invoice no." : "Their invoice no."}</th>
                <th className="px-3 py-2 font-normal">Dated</th>
                <th className="px-3 py-2 font-normal">Due</th>
                <th className="px-3 py-2 text-right font-normal">Amount owed</th>
                <th className="w-12 px-6 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700">
              {existing.map((doc) => {
                const gone = removed.has(doc.id);
                const paid = doc.amount_paid > 0;
                return (
                  <tr key={doc.id} className={classNames(gone && "opacity-50 line-through")}>
                    <td className="px-6 py-2.5">{partyName(doc)}</td>
                    <td className="px-3 py-2.5">
                      <Link
                        href={isAr ? `/sales/invoices?open=${doc.id}` : `/purchases/bills?open=${doc.id}`}
                        className="font-mono text-xs text-brand-700 hover:underline dark:text-brand-300"
                      >
                        {isAr ? doc.number : (doc as PurchaseBill).supplier_reference}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">{fmtDate(doc.issue_date)}</td>
                    <td className="px-3 py-2.5">{fmtDate(doc.due_date)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {fmtCurrency(itemTotal(doc))}
                      {paid && <p className="text-xs text-neutral-500">{fmtCurrency(outstanding(doc))} still open</p>}
                    </td>
                    <td className="px-6 py-2.5 text-right">
                      {!readOnly && (
                        <button
                          className="text-neutral-400 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                          disabled={paid}
                          title={paid ? "Payments are recorded against it" : gone ? "Keep" : "Remove"}
                          aria-label={gone ? "Keep" : "Remove"}
                          onClick={() => toggleRemoved(doc.id)}
                        >
                          {gone ? <FiRotateCcw className="h-4 w-4" /> : <FiTrash2 className="h-4 w-4" />}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {rows.map((r) => (
                <tr key={r.key} className="bg-brand-50/30 dark:bg-brand-900/10">
                  <td className="px-6 py-1.5">
                    <select
                      className={compactInputClass}
                      aria-label={isAr ? "Customer" : "Supplier"}
                      value={r.party_id}
                      onChange={(e) => update(r.key, { party_id: e.target.value })}
                    >
                      <option value="">Choose…</option>
                      {parties.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      className={compactInputClass}
                      aria-label="Reference"
                      placeholder={isAr ? "e.g. QB-1043" : "e.g. INV-5521"}
                      value={r.reference}
                      onChange={(e) => update(r.key, { reference: e.target.value })}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      type="date"
                      className={compactInputClass}
                      aria-label="Dated"
                      value={r.issue_date}
                      max={date}
                      onChange={(e) => update(r.key, { issue_date: e.target.value })}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      type="date"
                      className={compactInputClass}
                      aria-label="Due"
                      value={r.due_date}
                      min={r.issue_date}
                      onChange={(e) => update(r.key, { due_date: e.target.value })}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      className={classNames(compactInputClass, "text-right tabular-nums")}
                      aria-label="Amount owed"
                      value={r.amount}
                      onChange={(e) => update(r.key, { amount: e.target.value })}
                    />
                  </td>
                  <td className="px-6 py-1.5 text-right">
                    <button
                      className="text-neutral-400 hover:text-red-600"
                      aria-label="Delete row"
                      onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}
                    >
                      <FiTrash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
