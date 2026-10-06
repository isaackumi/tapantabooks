"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { FiCheck, FiFileText, FiUploadCloud } from "react-icons/fi";
import { BTN_PRIMARY, BTN_SECONDARY, Modal, type ModalButton } from "@/components/modal";
import { Callout, Field, compactInputClass, inputClass } from "@/components/ui";
import StatusBadge from "@/components/statusBadge";
import { periodForDate, useLedger, type LedgerState } from "@/store/ledgerStore";
import type { ImportRecord } from "@/models/accounting";
import { parseCsv, toCsv } from "@/utils/csv";
import { classNames, fmtCurrency } from "@/utils/format";
import { todayIso } from "@/utils/dates";

type Entity = "Invoices" | "Bills" | "Sales" | "Customers" | "Suppliers";
type FieldKey = "reference" | "party" | "date" | "amount" | "description" | "branch" | "name" | "email" | "phone";

interface FieldSpec {
  key: FieldKey;
  label: string;
  required: boolean;
  synonyms: string[];
}

const F = (key: FieldKey, label: string, required: boolean, synonyms: string[]): FieldSpec => ({ key, label, required, synonyms });
const REF = (label: string) => F("reference", label, true, ["ref", "reference", "invoiceno", "invoice", "billno", "no", "number", "id", "externalid", "receiptno", "zreport"]);
const DATE = F("date", "Date", true, ["date", "invoicedate", "billdate", "issuedate", "saledate", "txndate"]);
const AMOUNT = F("amount", "Amount (incl. tax)", true, ["amount", "total", "gross", "grossamount", "totalamount", "value"]);
const DESC = F("description", "Description", false, ["description", "details", "memo", "narration", "item"]);

const ENTITY_FIELDS: Record<Entity, FieldSpec[]> = {
  Invoices: [REF("Invoice number"), F("party", "Customer", true, ["customer", "customername", "client"]), DATE, AMOUNT, DESC],
  Bills: [REF("Supplier invoice number"), F("party", "Supplier", true, ["supplier", "suppliername", "vendor"]), DATE, AMOUNT, DESC],
  Sales: [REF("Sale / Z-report reference"), DATE, AMOUNT, F("branch", "Branch", false, ["branch", "store", "location"])],
  Customers: [REF("External ID"), F("name", "Name", true, ["name", "displayname", "customername", "company"]), F("email", "Email", false, ["email", "emailaddress"]), F("phone", "Phone", false, ["phone", "mobile", "telephone", "tel"])],
  Suppliers: [REF("External ID"), F("name", "Name", true, ["name", "displayname", "suppliername", "company"]), F("email", "Email", false, ["email", "emailaddress"]), F("phone", "Phone", false, ["phone", "mobile", "telephone", "tel"])],
};

const STEPS = ["Source", "Upload", "Map columns", "Validate", "Post"];
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const parseDate = (raw: string): string | null => {
  const s = raw.trim();
  let y: number, m: number, d: number;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) [y, m, d] = s.split("-").map(Number);
  else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) [d, m, y] = s.split("/").map(Number);
  else return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
};

const sampleFile = (entity: Entity, s: LedgerState): { name: string; text: string } => {
  const c = s.customers.filter((x) => x.status === "ACTIVE").map((x) => x.name);
  const v = s.suppliers.filter((x) => x.status === "ACTIVE").map((x) => x.name);
  switch (entity) {
    case "Invoices":
      return {
        name: "open-invoices-october.csv",
        text: toCsv([
          ["Invoice No", "Customer", "Date", "Amount", "Description"],
          ["LEG-INV-3101", c[0], "01/10/2026", "4560.00", "Rice and oil restock"],
          ["LEG-INV-3102", c[1], "02/10/2026", "12480.00", "Bulk order – Accra"],
          ["LEG-INV-3103", "Asante Brothers Ventures", "02/10/2026", "2300.00", "Walk-in account"],
          ["LEG-INV-3104", c[2], "31/09/2026", "980.00", "Sundry items"],
          ["LEG-INV-3102", c[1], "02/10/2026", "12480.00", "Bulk order – Accra (resent)"],
          ["LEG-INV-3105", c[3], "03/10/2026", "6720.00", "Monthly supply"],
        ]),
      };
    case "Bills":
      return {
        name: "branch-bills-october.csv",
        text: toCsv([
          ["Supplier", "Bill No", "Date", "Total", "Details"],
          [v[0], "SB-88120", "2026-10-01", "8400.00", "Stock delivery"],
          [v[1], "SB-88121", "2026-10-02", "1250.00", "Generator fuel"],
          ["Unknown Haulage Co", "SB-88122", "2026-10-02", "600.00", "Haulage"],
          [v[2], "SB-88123", "2026-10-03", "", "Missing amount"],
          [v[3], "SB-88124", "2026-06-28", "3100.00", "Late June invoice"],
        ]),
      };
    case "Sales":
      return {
        name: "pos-z-reports.csv",
        text: toCsv([
          ["Z Report", "Sale Date", "Gross Amount", "Store"],
          ["OSU-Z-1001", "2026-10-01", "2840.50", "Osu"],
          ["OSU-Z-1002", "2026-10-02", "3115.00", "Osu"],
          ["OSU-Z-1003", "2026-10-03", "abc", "Osu"],
          ["OSU-Z-1004", "2026-10-04", "2990.25", "Osu"],
        ]),
      };
    case "Customers":
      return {
        name: "qbo-customers-extra.csv",
        text: toCsv([
          ["Id", "DisplayName", "Email", "Phone"],
          ["QB-CUS-201", "Ejisu Farmers Cooperative", "accounts@ejisucoop.com.gh", "+233 24 555 0101"],
          ["QB-CUS-202", "Sunyani Wholesale Hub", "", "+233 20 555 0144"],
          ["QB-CUS-203", c[0], "dup@example.com", ""],
          ["QB-CUS-204", "Ho Teaching Hospital Canteen", "canteen@hth.gov.gh", "+233 36 555 0190"],
        ]),
      };
    case "Suppliers":
      return {
        name: "new-suppliers.csv",
        text: toCsv([
          ["Id", "Name", "Email", "Phone"],
          ["SUP-X-01", "Obuasi Packaging Ltd", "sales@obuasipack.com.gh", "+233 32 555 0122"],
          ["SUP-X-02", v[0], "", ""],
          ["SUP-X-03", "Aflao Cold Chain", "", "+233 36 555 0177"],
        ]),
      };
  }
};

const validate = (entity: Entity, rows: string[][], mapping: Record<string, number>, s: LedgerState): Omit<ImportRecord, "posted">[] => {
  const fields = ENTITY_FIELDS[entity];
  const get = (r: string[], k: FieldKey) => (mapping[k] >= 0 ? (r[mapping[k]] ?? "").trim() : "");
  const seen = new Map<string, number>();
  const previous = new Map<string, string>();
  s.importBatches.forEach((b) => b.records.forEach((r) => previous.set(r.external_reference.toLowerCase(), b.number)));
  const parties = entity === "Bills" || entity === "Suppliers" ? s.suppliers : s.customers;
  const byName = new Map(parties.map((p) => [p.name.toLowerCase(), p]));
  const financial = entity === "Invoices" || entity === "Bills" || entity === "Sales";

  return rows.map((r, i) => {
    const row = i + 1;
    const ref = get(r, "reference");
    const errors: string[] = [];
    const warnings: string[] = [];
    for (const f of fields) if (f.required && !get(r, f.key)) errors.push(`${f.label} is empty.`);

    const amountRaw = get(r, "amount");
    const amount = financial ? Number(amountRaw.replace(/,/g, "")) : 0;
    if (financial && amountRaw && !(amount > 0)) errors.push(`Amount "${amountRaw}" is not a positive number.`);

    let date: string | null = null;
    if (financial && get(r, "date")) {
      date = parseDate(get(r, "date"));
      if (!date) errors.push(`Date "${get(r, "date")}" is not a valid date.`);
      else if (date > todayIso()) errors.push("Date is in the future.");
      else {
        const p = periodForDate(s, date);
        if (p && p.status !== "OPEN") warnings.push(`${p.name} is ${p.status.toLowerCase()}; it will post on the import date instead.`);
      }
    }

    const partyName = get(r, "party");
    if ((entity === "Invoices" || entity === "Bills") && partyName) {
      const party = byName.get(partyName.toLowerCase());
      if (!party) errors.push(`${entity === "Invoices" ? "Customer" : "Supplier"} "${partyName}" not found. Add them or import contacts first.`);
      else if (entity === "Bills" && !party.tin) warnings.push("Supplier has no TIN; withholding tax may apply.");
    }

    const name = get(r, "name");
    if ((entity === "Customers" || entity === "Suppliers") && name) {
      if (byName.has(name.toLowerCase())) errors.push(`"${name}" already exists.`);
      if (!get(r, "email")) warnings.push("No email address; it will be imported without one.");
    }

    if (ref) {
      const dup = seen.get(ref.toLowerCase());
      if (dup) errors.push(`Duplicate of row ${dup} in this file.`);
      else seen.set(ref.toLowerCase(), row);
      const prev = previous.get(ref.toLowerCase());
      if (prev) errors.push(`Already imported in ${prev}.`);
    }

    const summary =
      [partyName || name, get(r, "description") || get(r, "branch") || get(r, "email")].filter(Boolean).join(" · ") || "—";
    return {
      row,
      external_reference: ref || `row-${row}`,
      summary,
      amount: financial && amount > 0 ? amount : 0,
      status: errors.length ? "ERROR" : warnings.length ? "WARNING" : "VALID",
      message: errors[0] ?? warnings[0],
    };
  });
};

const ImportWizard = ({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (batchId: string) => void }) => {
  const { state, actions } = useLedger();
  const fileRef = useRef<HTMLInputElement>(null);
  const importable = state.dataSources.filter((s) => (s.kind === "FILE" || s.kind === "ACCOUNTING_SYSTEM" || s.kind === "API") && s.status !== "ERROR");
  const [step, setStep] = useState(0);
  const [sourceId, setSourceId] = useState("ds_csv");
  const [entity, setEntity] = useState<Entity>("Invoices");
  const [fileName, setFileName] = useState<string | null>(null);
  const [table, setTable] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, number>>({});
  const [post, setPost] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setStep(0);
      setSourceId("ds_csv");
      setEntity("Invoices");
      setFileName(null);
      setTable([]);
      setMapping({});
      setPost(true);
    }
  }, [open]);

  const headers = table[0] ?? [];
  const dataRows = table.slice(1);
  const fields = ENTITY_FIELDS[entity];

  const loadTable = (name: string, text: string) => {
    const parsed = parseCsv(text);
    if (parsed.length < 2) {
      toast.error("The file needs a header row and at least one data row.");
      return;
    }
    setFileName(name);
    setTable(parsed);
    const auto: Record<string, number> = {};
    for (const f of ENTITY_FIELDS[entity]) {
      auto[f.key] = parsed[0].findIndex((h) => {
        const n = norm(h);
        return f.synonyms.includes(n) || n === norm(f.label);
      });
    }
    setMapping(auto);
  };

  const onFile = (file: File) => {
    if (!/\.csv$/i.test(file.name)) {
      toast.error("Upload a .csv file. Save Excel sheets as CSV first.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => loadTable(file.name, String(reader.result ?? ""));
    reader.readAsText(file);
  };

  const records = useMemo(
    () => (step >= 3 ? validate(entity, dataRows, mapping, state) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [step, entity, table, mapping, state],
  );
  const count = (s: ImportRecord["status"]) => records.filter((r) => r.status === s).length;
  const missingRequired = fields.filter((f) => f.required && (mapping[f.key] ?? -1) < 0);
  const financial = entity === "Invoices" || entity === "Bills" || entity === "Sales";
  const postable = records.filter((r) => r.status !== "ERROR");

  const finish = async () => {
    setBusy(true);
    try {
      const res = await actions.createImport({ source_id: sourceId, entity, file_name: fileName, records, post });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (post && (entity === "Customers" || entity === "Suppliers")) {
        const kind = entity === "Customers" ? "customer" : "supplier";
        for (let i = 0; i < dataRows.length; i++) {
          const r = dataRows[i];
          if (records[i].status === "ERROR") continue;
          await actions.saveParty(kind, {
            name: r[mapping.name]?.trim() ?? "",
            email: mapping.email >= 0 ? r[mapping.email]?.trim() : "",
            phone: mapping.phone >= 0 ? r[mapping.phone]?.trim() : "",
            external_reference: records[i].external_reference,
          });
        }
      }
      toast.success(res.message ?? "Imported", { duration: 5000 });
      onDone(res.data.id);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const canNext =
    (step === 0 && !!sourceId && !!entity) ||
    (step === 1 && table.length > 1) ||
    (step === 2 && missingRequired.length === 0) ||
    step === 3;

  const buttons: ModalButton[] = [
    step === 0
      ? { label: "Cancel", onClick: onClose, className: BTN_SECONDARY }
      : { label: "Back", onClick: () => setStep((s) => s - 1), className: BTN_SECONDARY },
    step < 4
      ? { label: "Continue", onClick: () => setStep((s) => s + 1), className: BTN_PRIMARY, disabled: !canNext }
      : {
          label: post ? `Post ${postable.length} row${postable.length === 1 ? "" : "s"}` : "Save for review",
          onClick: finish,
          className: BTN_PRIMARY,
          disabled: (post && postable.length === 0) || busy,
        },
  ];

  return (
    <Modal open={open} onClose={onClose} size="4xl" title="Import data" description="Bring records in from a file or another system. Every row is validated before anything reaches the ledger." buttons={buttons}>
      <ol className="mb-6 flex items-center gap-2 text-xs">
        {STEPS.map((label, i) => (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              className={classNames(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-semibold",
                i < step ? "bg-brand-600 text-white" : i === step ? "bg-brand-100 text-brand-700 ring-2 ring-brand-600 dark:bg-brand-900/40 dark:text-brand-300" : "bg-neutral-100 text-neutral-400 dark:bg-neutral-700",
              )}
            >
              {i < step ? <FiCheck /> : i + 1}
            </span>
            <span className={classNames("hidden sm:inline", i === step ? "font-semibold" : "text-neutral-500")}>{label}</span>
            {i < STEPS.length - 1 && <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-700" />}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Source" required hint="Where the records come from. Kept on every imported row for traceability.">
            <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} className={inputClass}>
              {importable.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="What are you importing?" required>
            <select
              value={entity}
              onChange={(e) => {
                setEntity(e.target.value as Entity);
                setTable([]);
                setFileName(null);
              }}
              className={inputClass}
            >
              {(Object.keys(ENTITY_FIELDS) as Entity[]).map((e) => (
                <option key={e}>{e}</option>
              ))}
            </select>
          </Field>
          <div className="sm:col-span-2">
            <p className="mb-2 text-sm font-medium">Fields we will look for</p>
            <div className="flex flex-wrap gap-2">
              {fields.map((f) => (
                <span key={f.key} className="rounded-full bg-neutral-100 px-3 py-1 text-xs dark:bg-neutral-700">
                  {f.label}
                  {f.required && <span className="text-red-500"> *</span>}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {step === 1 && (
        <div>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) onFile(f);
            }}
            className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-neutral-300 bg-neutral-50 px-6 py-10 text-center dark:border-neutral-600 dark:bg-neutral-900/30"
          >
            <FiUploadCloud className="h-10 w-10 text-brand-500" />
            <p className="mt-3 text-sm font-medium">Drop a CSV file here</p>
            <p className="mt-1 text-xs text-neutral-500">or</p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                Choose file
              </button>
              <button
                type="button"
                onClick={() => {
                  const sample = sampleFile(entity, state);
                  loadTable(sample.name, sample.text);
                }}
                className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800"
              >
                Use a sample file
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
          {fileName && (
            <div className="mt-4">
              <p className="mb-2 flex items-center gap-2 text-sm">
                <FiFileText className="text-brand-600" /> <span className="font-medium">{fileName}</span>
                <span className="text-neutral-500">· {dataRows.length} rows · {headers.length} columns</span>
              </p>
              <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-700">
                <table className="min-w-full text-xs">
                  <thead className="bg-neutral-50 dark:bg-neutral-900/40">
                    <tr>
                      {headers.map((h, i) => (
                        <th key={i} className="px-3 py-2 text-left font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700">
                    {dataRows.slice(0, 5).map((r, i) => (
                      <tr key={i}>
                        {headers.map((_, j) => (
                          <td key={j} className="whitespace-nowrap px-3 py-1.5">
                            {r[j]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {step === 2 && (
        <div>
          <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-300">
            Match each Trovesuite field to a column in <span className="font-medium">{fileName}</span>. We matched what we could by name.
          </p>
          <div className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 dark:divide-neutral-700 dark:border-neutral-700">
            {fields.map((f) => (
              <div key={f.key} className="grid grid-cols-1 items-center gap-3 px-4 py-3 sm:grid-cols-3">
                <div>
                  <p className="text-sm font-medium">
                    {f.label} {f.required && <span className="text-red-500">*</span>}
                  </p>
                </div>
                <select
                  value={mapping[f.key] ?? -1}
                  onChange={(e) => setMapping((m) => ({ ...m, [f.key]: Number(e.target.value) }))}
                  className={compactInputClass}
                >
                  <option value={-1}>Not in this file</option>
                  {headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h}
                    </option>
                  ))}
                </select>
                <p className="truncate text-xs text-neutral-500">
                  {(mapping[f.key] ?? -1) >= 0 ? `e.g. "${dataRows[0]?.[mapping[f.key]] ?? ""}"` : f.required ? "Required" : "Optional"}
                </p>
              </div>
            ))}
          </div>
          {missingRequired.length > 0 && (
            <Callout tone="warning" className="mt-4">
              Map {missingRequired.map((f) => f.label).join(", ")} to continue.
            </Callout>
          )}
        </div>
      )}

      {step === 3 && (
        <div>
          <div className="mb-4 grid grid-cols-3 gap-3 text-center">
            {(["VALID", "WARNING", "ERROR"] as const).map((s) => (
              <div key={s} className="rounded-xl bg-neutral-50 p-3 dark:bg-neutral-900/40">
                <p className="text-2xl font-bold tabular-nums">{count(s)}</p>
                <StatusBadge status={s} label={s === "VALID" ? "Ready" : s === "WARNING" ? "Ready with warnings" : "Will be held"} />
              </div>
            ))}
          </div>
          <div className="max-h-80 overflow-auto rounded-xl border border-neutral-200 dark:border-neutral-700">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-neutral-50 text-left text-neutral-500 dark:bg-neutral-900">
                <tr>
                  <th className="px-3 py-2 font-normal">Row</th>
                  <th className="px-3 py-2 font-normal">Reference</th>
                  <th className="px-3 py-2 font-normal">Summary</th>
                  {financial && <th className="px-3 py-2 text-right font-normal">Amount</th>}
                  <th className="px-3 py-2 font-normal">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700">
                {records.map((r) => (
                  <tr key={r.row}>
                    <td className="px-3 py-2 text-neutral-500">{r.row}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.external_reference}</td>
                    <td className="px-3 py-2">{r.summary}</td>
                    {financial && <td className="px-3 py-2 text-right tabular-nums">{r.amount ? fmtCurrency(r.amount) : "—"}</td>}
                    <td className="px-3 py-2">
                      <StatusBadge status={r.status} />
                      {r.message && <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{r.message}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[
              {
                value: true,
                title: `Post ${postable.length} ready row${postable.length === 1 ? "" : "s"} now`,
                body: financial
                  ? `Creates one balanced journal for ${fmtCurrency(postable.reduce((s, r) => s + r.amount, 0))}. ${count("ERROR")} row(s) are held for correction.`
                  : `Creates ${postable.length} ${entity.toLowerCase()} with their external references. ${count("ERROR")} row(s) are held.`,
              },
              { value: false, title: "Save for review", body: "Keep the batch in Needs review so a colleague can check it before posting." },
            ].map((o) => (
              <button
                key={String(o.value)}
                type="button"
                onClick={() => setPost(o.value)}
                className={classNames(
                  "rounded-xl border p-4 text-left",
                  post === o.value ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500 dark:bg-brand-900/20" : "border-neutral-200 dark:border-neutral-700",
                )}
              >
                <p className="font-semibold">{o.title}</p>
                <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">{o.body}</p>
              </button>
            ))}
          </div>
          <Callout tone="info">
            Imports never edit existing records. Held rows can be corrected and reprocessed from the batch without uploading the file again.
          </Callout>
        </div>
      )}
    </Modal>
  );
};

export default ImportWizard;
