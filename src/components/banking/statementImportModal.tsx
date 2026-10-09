"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { FiFileText, FiUploadCloud } from "react-icons/fi";
import { Callout, Field, FormError, compactInputClass, inputClass } from "@/components/ui";
import { BTN_PRIMARY, BTN_SECONDARY, Modal } from "@/components/modal";
import { useLedger } from "@/store/ledgerStore";
import { api, type ListData } from "@/core/apiClient";
import {
  DATE_FORMATS,
  detectColumns,
  detectDateFormat,
  parseStatementRows,
  type DateFormat,
  type StatementColumns,
} from "@/lib/bankStatementCsv";
import type { BankAccount, BankStatementLine } from "@/models/accounting";
import type { BankActivityItem, StatementImportPreview } from "@/models/banking";
import { parseCsv, toCsv } from "@/utils/csv";
import { classNames, fmtDate, fmtMoney, round2 } from "@/utils/format";
import { addDays, todayIso } from "@/utils/dates";

const NO_COLS: StatementColumns = { date: -1, description: -1, amount: -1, money_in: -1, money_out: -1, reference: -1 };

const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** A realistic export for the account: a few lines already held, uncleared ledger items and bank charges. */
const sampleStatement = async (bank: BankAccount) => {
  const [heldRes, activityRes] = await Promise.all([
    api.get<ListData<BankStatementLine>>("/bank-statement-lines/list", { bank_account_id: bank.id, sort_by: "date", sort_order: "desc", size: 3 }),
    api.get<ListData<BankActivityItem>>("/bank-accounts/activity", {
      bank_account_id: bank.id,
      from_date: addDays(bank.statement_date, -10),
      size: 100,
    }),
  ]);
  const held = [...(heldRes.data?.items ?? [])].reverse();
  const today = todayIso();
  const pending = (activityRes.data?.items ?? [])
    .filter((a) => a.statement_status === null && a.amount !== 0)
    .slice(0, 5)
    .reverse()
    .map((a) => ({
      date: a.date > bank.statement_date ? a.date : addDays(bank.statement_date, 1) > today ? today : addDays(bank.statement_date, 1),
      description: a.memo.toUpperCase().slice(0, 48),
      amount: a.amount,
    }));
  const rows = [
    ...held.map((l) => ({ date: l.date, description: l.description, amount: l.amount })),
    ...pending,
    { date: today, description: "COT CHARGES OCT 2026", amount: -15 },
    { date: today, description: "E-LEVY ON TRANSFER", amount: -4.5 },
  ].sort((a, b) => a.date.localeCompare(b.date));
  const text = toCsv([
    ["Txn Date", "Narrative", "Debit", "Credit", "Reference"],
    [ddmmyyyy(bank.statement_date), "BALANCE BROUGHT FORWARD", "", "", ""],
    ...rows.map((r, i) => [ddmmyyyy(r.date), r.description, r.amount < 0 ? (-r.amount).toFixed(2) : "", r.amount > 0 ? r.amount.toFixed(2) : "", `FT26${String(27800 + i)}`]),
  ]);
  return { name: `${bank.bank.split(" ")[0].toLowerCase()}-statement-${today}.csv`, text };
};

const StatementImportModal = ({ bankId, open, onClose }: { bankId: string; open: boolean; onClose: () => void }) => {
  const { state, actions } = useLedger();
  const bank = state.bankAccounts.find((b) => b.id === bankId)!;
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [table, setTable] = useState<string[][]>([]);
  const [cols, setCols] = useState<StatementColumns>(NO_COLS);
  const [splitAmounts, setSplitAmounts] = useState(false);
  const [format, setFormat] = useState<DateFormat>("DD/MM/YYYY");
  const [statementDate, setStatementDate] = useState(todayIso());
  /** null until the user edits it: the field then shows the closing balance the new lines imply. */
  const [closingInput, setClosing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sampling, setSampling] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFileName(null);
    setTable([]);
    setCols(NO_COLS);
    setError(null);
    setClosing(null);
  }, [open, bankId]);

  const amountMapped = splitAmounts ? cols.money_in >= 0 && cols.money_out >= 0 : cols.amount >= 0;
  const parsed = useMemo(
    () =>
      table.length > 1 && cols.date >= 0 && cols.description >= 0 && amountMapped
        ? parseStatementRows(table.slice(1), splitAmounts ? { ...cols, amount: -1 } : cols, format)
        : null,
    [table, cols, format, splitAmounts, amountMapped],
  );

  const [preview, setPreview] = useState<{ lines: unknown; data: StatementImportPreview } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  useEffect(() => {
    if (!parsed || !open) return;
    let live = true;
    setPreviewError(null);
    api
      .post<StatementImportPreview>("/bank-statement-lines/preview", {
        bank_account_id: bankId,
        lines: parsed.lines.map((l) => ({ date: l.date, description: l.description, amount: l.amount })),
      })
      .then((res) => live && res.data && setPreview({ lines: parsed.lines, data: res.data }))
      .catch((e: unknown) => live && setPreviewError(e instanceof Error ? e.message : "Could not check the file against the lines already held."));
    return () => {
      live = false;
    };
  }, [parsed, bankId, open]);
  const split = parsed && preview?.lines === parsed.lines ? preview.data : null;
  const closing = closingInput ?? (split ? split.expected_closing.toFixed(2) : "");
  const closingNum = Number(closing.replace(/,/g, ""));
  const difference = split && closing.trim() && Number.isFinite(closingNum) ? round2(closingNum - split.expected_closing) : 0;

  const loadTable = (name: string, text: string) => {
    const rows = parseCsv(text);
    if (rows.length < 2) {
      toast.error("The file needs a header row and at least one transaction.");
      return;
    }
    const detected = detectColumns(rows[0]);
    const fmt = detected.date >= 0 ? detectDateFormat(rows.slice(1, 40).map((r) => r[detected.date] ?? "")) : "DD/MM/YYYY";
    setFileName(name);
    setTable(rows);
    setCols(detected);
    setSplitAmounts(detected.amount < 0 && detected.money_in >= 0 && detected.money_out >= 0);
    setFormat(fmt);
    setError(null);
    setClosing(null);
    if (detected.date >= 0 && detected.description >= 0) {
      const lines = parseStatementRows(rows.slice(1), detected, fmt).lines;
      const last = lines.reduce((m, l) => (l.date > m ? l.date : m), bank.statement_date);
      setStatementDate(last > todayIso() ? todayIso() : last);
    }
  };

  const loadSample = async () => {
    setSampling(true);
    try {
      const sample = await sampleStatement(bank);
      loadTable(sample.name, sample.text);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not build a sample statement.");
    } finally {
      setSampling(false);
    }
  };

  const onFile = (file: File) => {
    if (!/\.csv$/i.test(file.name)) {
      toast.error("Upload a .csv file. Most banks offer CSV under Export or Download.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => loadTable(file.name, String(reader.result ?? ""));
    reader.readAsText(file);
  };

  const submit = async () => {
    if (!parsed) return;
    setBusy(true);
    setError(null);
    try {
      const res = await actions.importStatementLines({
        bank_account_id: bank.id,
        file_name: fileName ?? undefined,
        statement_date: statementDate,
        closing_balance: closingNum,
        lines: parsed.lines,
      });
      if (!res.ok) return setError(res.error);
      toast.success(res.message ?? "Statement imported", { duration: 5000 });
      if (res.data.balance_difference !== 0) {
        toast.error(`The statement is ${fmtMoney(Math.abs(res.data.balance_difference), bank.currency)} ${res.data.balance_difference > 0 ? "higher" : "lower"} than the lines add up to. Some lines may be missing from the file.`, { duration: 8000 });
      }
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const headers = table[0] ?? [];
  const colSelect = (key: keyof StatementColumns, label: string, required = true) => (
    <label className="text-sm">
      <span className="mb-1 block text-neutral-500 dark:text-neutral-400">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      <select value={cols[key]} onChange={(e) => setCols((c) => ({ ...c, [key]: Number(e.target.value) }))} className={compactInputClass}>
        <option value={-1}>—</option>
        {headers.map((h, i) => (
          <option key={i} value={i}>
            {h || `Column ${i + 1}`}
          </option>
        ))}
      </select>
    </label>
  );

  const newCount = split?.new_count ?? 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="4xl"
      title={`Import statement · ${bank.name}`}
      description={`Lines already held for this account are skipped, so overlapping exports are safe. Current statement: ${fmtMoney(bank.statement_balance, bank.currency)} at ${fmtDate(bank.statement_date)}.`}
      buttons={[
        { label: "Cancel", onClick: onClose, className: BTN_SECONDARY },
        {
          label: busy ? "Importing…" : newCount ? `Import ${newCount} line${newCount === 1 ? "" : "s"}` : "Import",
          onClick: submit,
          className: BTN_PRIMARY,
          disabled: busy || !parsed || !amountMapped || newCount === 0 || !closing.trim() || !Number.isFinite(closingNum),
        },
      ]}
    >
      <FormError message={error} />
      {table.length === 0 ? (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) onFile(f);
          }}
          className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-neutral-300 bg-neutral-50 px-6 py-12 text-center dark:border-neutral-600 dark:bg-neutral-900/30"
        >
          <FiUploadCloud className="h-10 w-10 text-brand-500" />
          <p className="mt-3 text-sm font-medium">Drop the bank&apos;s CSV export here</p>
          <p className="mt-1 max-w-md text-xs text-neutral-500">
            Needs a header row with a date, a description and either one signed amount column or separate debit and credit columns.
          </p>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={() => fileRef.current?.click()} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
              Choose file
            </button>
            <button
              type="button"
              onClick={loadSample}
              disabled={sampling}
              className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-60 dark:border-neutral-600 dark:bg-neutral-800"
            >
              {sampling ? "Preparing sample…" : "Use a sample statement"}
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
              e.target.value = "";
            }}
          />
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center justify-between text-sm">
            <p className="flex items-center gap-2">
              <FiFileText className="text-brand-600" /> <span className="font-medium">{fileName}</span>
              <span className="text-neutral-500">· {table.length - 1} rows</span>
            </p>
            <button type="button" onClick={() => setTable([])} className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300">
              Choose another file
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {colSelect("date", "Date")}
            <label className="text-sm">
              <span className="mb-1 block text-neutral-500 dark:text-neutral-400">Date format</span>
              <select value={format} onChange={(e) => setFormat(e.target.value as DateFormat)} className={compactInputClass}>
                {DATE_FORMATS.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </label>
            {colSelect("description", "Description")}
            {splitAmounts ? (
              <>
                {colSelect("money_in", "Money in")}
                {colSelect("money_out", "Money out")}
              </>
            ) : (
              colSelect("amount", "Amount (− = out)")
            )}
            {colSelect("reference", "Reference", false)}
          </div>
          <button type="button" onClick={() => setSplitAmounts((v) => !v)} className="-mt-2 text-xs font-medium text-brand-700 hover:underline dark:text-brand-300">
            {splitAmounts ? "File has one signed amount column" : "File has separate money in and money out columns"}
          </button>

          {parsed && split && (
            <>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-emerald-50 px-3 py-1 font-medium text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">{split.new_count} new</span>
                <span className="rounded-full bg-neutral-100 px-3 py-1 font-medium text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300">{split.duplicate_count} already held</span>
                {parsed.skipped.length > 0 && (
                  <span
                    className="rounded-full bg-amber-50 px-3 py-1 font-medium text-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
                    title={parsed.skipped.slice(0, 8).map((s) => `Row ${s.row}: ${s.reason}`).join("\n")}
                  >
                    {parsed.skipped.length} row{parsed.skipped.length === 1 ? "" : "s"} skipped
                  </span>
                )}
              </div>

              <div className="max-h-64 overflow-auto rounded-xl border border-neutral-200 dark:border-neutral-700">
                <table className="min-w-full text-xs">
                  <thead className="sticky top-0 bg-neutral-50 text-left text-neutral-500 dark:bg-neutral-900">
                    <tr>
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">Description</th>
                      <th className="px-3 py-2 text-right font-medium">Money in</th>
                      <th className="px-3 py-2 text-right font-medium">Money out</th>
                      <th className="px-3 py-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700">
                    {parsed.lines.map((l, i) => {
                      const isNew = !split.held[i];
                      return (
                        <tr key={i} className={classNames(!isNew && "text-neutral-400")}>
                          <td className="whitespace-nowrap px-3 py-1.5">{fmtDate(l.date)}</td>
                          <td className="px-3 py-1.5 font-mono">{l.description}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{l.amount > 0 ? l.amount.toFixed(2) : ""}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{l.amount < 0 ? (-l.amount).toFixed(2) : ""}</td>
                          <td className="px-3 py-1.5 text-right">{isNew ? <span className="text-emerald-600">New</span> : "Already held"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Statement date" required hint="The date of the closing balance; on or after every line.">
                  <input type="date" value={statementDate} max={todayIso()} min={bank.statement_date} onChange={(e) => setStatementDate(e.target.value)} className={inputClass} />
                </Field>
                <Field label={`Closing balance (${bank.currency})`} required hint="Copy it from the statement. It is pre-filled with what the lines add up to.">
                  <input value={closing} onChange={(e) => setClosing(e.target.value)} inputMode="decimal" className={inputClass} />
                </Field>
              </div>
              {difference !== 0 && (
                <Callout tone="warning" title="The lines do not add up to this closing balance">
                  {fmtMoney(split.brought_forward, bank.currency)} brought forward plus the new lines gives {fmtMoney(split.expected_closing, bank.currency)}, a difference of{" "}
                  {fmtMoney(difference, bank.currency)}. Check the file covers the whole period. You can still import; the difference will show on the reconciliation.
                </Callout>
              )}
            </>
          )}
          {parsed && !split && (
            previewError ? (
              <Callout tone="danger" title="Could not check the file">{previewError}</Callout>
            ) : (
              <p className="text-sm text-neutral-500">Checking the file against the lines already held…</p>
            )
          )}
          {!parsed && <Callout tone="info" title="Map the date, description and amount columns">The preview appears once they are mapped.</Callout>}
        </div>
      )}
    </Modal>
  );
};

export default StatementImportModal;
