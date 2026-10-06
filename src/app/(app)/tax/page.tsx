"use client";

import { useMemo } from "react";
import Link from "next/link";
import { FiInfo } from "react-icons/fi";
import { Callout, PageHeader, Panel } from "@/components/ui";
import StatCard from "@/components/statCard";
import StatusBadge from "@/components/statusBadge";
import { useJournalViewer } from "@/components/accounting/journalViewer";
import { useLedger } from "@/store/ledgerStore";
import { affectsLedger, balancesByAccount } from "@/lib/ledger";
import { ACC } from "@/mock/seed";
import { fmtCurrency, fmtDate, humanize, round2 } from "@/utils/format";
import { addDays, endOfMonth, monthKey, todayIso } from "@/utils/dates";

const MONTHS = Array.from({ length: 10 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}`);
const pct = (rate: number) => `${Math.round(rate * 1000) / 10}%`;

export default function TaxPage() {
  const { state } = useLedger();
  const { openJournal } = useJournalViewer();
  const today = todayIso();
  const accounts = new Map(state.accounts.map((a) => [a.id, a]));

  const months = useMemo(
    () =>
      MONTHS.map((m) => {
        let output = 0;
        let input = 0;
        let wht = 0;
        for (const j of state.journals) {
          if (!affectsLedger(j) || monthKey(j.date) !== m) continue;
          for (const l of j.lines) {
            if (l.account_id === ACC.vatOut) output += l.credit;
            if (l.account_id === ACC.vatIn) input += l.debit;
            if (l.account_id === ACC.wht) wht += l.credit;
          }
        }
        const [y, mo] = m.split("-").map(Number);
        const due = mo === 12 ? `${y + 1}-01-15` : `${y}-${String(mo + 1).padStart(2, "0")}-15`;
        const filing = state.journals.find(
          (j) => affectsLedger(j) && j.source.reference === `GRA-VAT-${String(mo).padStart(2, "0")}`,
        );
        const net = round2(output - input);
        const status = filing ? "FILED" : endOfMonth(m) >= today ? "IN_PROGRESS" : due < today ? "OVERDUE" : "DUE";
        return { month: m, output: round2(output), input: round2(input), net, wht: round2(wht), due, filing, status };
      }),
    [state.journals, today],
  );

  const balances = balancesByAccount(state.accounts, state.journals, { to: today });
  const nextDue = months.find((m) => m.status === "DUE");
  const ytdOutput = months.reduce((s, m) => s + m.output, 0);
  const ytdInput = months.reduce((s, m) => s + m.input, 0);

  return (
    <div>
      <PageHeader
        title="Tax"
        description="VAT, levies and withholding tax calculated from posted transactions. Each month's return is settled with GRA on the 15th of the next month."
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="VAT & levies payable"
          value={fmtCurrency(balances.get(ACC.vatOut) ?? 0)}
          sub="Balance on 2100"
          info="Output tax charged on sales that has not yet been paid to GRA."
        />
        <StatCard label="Input VAT recoverable" value={fmtCurrency(balances.get(ACC.vatIn) ?? 0)} sub="Balance on 1400" />
        <StatCard
          label="Next return"
          value={nextDue ? fmtCurrency(nextDue.net) : "—"}
          tone={nextDue ? "warning" : "default"}
          sub={nextDue ? `${new Date(`${nextDue.month}-01T00:00:00`).toLocaleDateString("en-GB", { month: "long" })} · due ${fmtDate(nextDue.due)}` : "Nothing due"}
        />
        <StatCard label="Withholding tax held" value={fmtCurrency(balances.get(ACC.wht) ?? 0)} sub="Balance on 2120" />
      </div>

      {nextDue && nextDue.due <= addDays(today, 14) && (
        <Callout tone="warning" icon={FiInfo} title={`Return due ${fmtDate(nextDue.due)}`} className="mb-6">
          Net VAT and levies of {fmtCurrency(nextDue.net)} for {new Date(`${nextDue.month}-01T00:00:00`).toLocaleDateString("en-GB", { month: "long" })}.
          Review the output and input figures below before filing on the GRA portal.
        </Callout>
      )}

      <Panel title="VAT & levies by month" subtitle={`Year to date: output ${fmtCurrency(ytdOutput)}, input ${fmtCurrency(ytdInput)}`} bodyClassName="p-0 pt-2">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-neutral-500 dark:text-neutral-400">
              <tr className="border-b border-neutral-100 dark:border-neutral-700">
                <th className="px-6 py-2.5 font-normal">Month</th>
                <th className="px-6 py-2.5 text-right font-normal">Output tax</th>
                <th className="px-6 py-2.5 text-right font-normal">Input tax</th>
                <th className="px-6 py-2.5 text-right font-normal">Net payable</th>
                <th className="px-6 py-2.5 text-right font-normal">WHT deducted</th>
                <th className="px-6 py-2.5 font-normal">Due</th>
                <th className="px-6 py-2.5 font-normal">Return</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700">
              {months.map((m) => (
                <tr key={m.month}>
                  <td className="px-6 py-3 font-medium">
                    {new Date(`${m.month}-01T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums">{fmtCurrency(m.output)}</td>
                  <td className="px-6 py-3 text-right tabular-nums">{fmtCurrency(m.input)}</td>
                  <td className="px-6 py-3 text-right font-semibold tabular-nums">{fmtCurrency(m.net)}</td>
                  <td className="px-6 py-3 text-right tabular-nums">{m.wht ? fmtCurrency(m.wht) : "—"}</td>
                  <td className="px-6 py-3">{fmtDate(m.due)}</td>
                  <td className="px-6 py-3">
                    {m.filing ? (
                      <button onClick={() => openJournal(m.filing!.id)} className="flex items-center gap-2">
                        <StatusBadge status="PAID" label="Filed & paid" />
                        <span className="font-mono text-xs text-brand-700 dark:text-brand-300">{m.filing.number}</span>
                      </button>
                    ) : (
                      <StatusBadge
                        status={m.status === "IN_PROGRESS" ? "DRAFT" : m.status === "DUE" ? "OPEN" : "OVERDUE"}
                        label={m.status === "IN_PROGRESS" ? "Month in progress" : m.status === "DUE" ? "Ready to file" : "Overdue"}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Tax codes" subtitle="Applied to invoice and bill lines; each posts to its own liability or recoverable account" className="mt-6" bodyClassName="p-0 pt-2">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-neutral-500 dark:text-neutral-400">
              <tr className="border-b border-neutral-100 dark:border-neutral-700">
                <th className="px-6 py-2.5 font-normal">Code</th>
                <th className="px-6 py-2.5 font-normal">Name</th>
                <th className="px-6 py-2.5 text-right font-normal">Rate</th>
                <th className="px-6 py-2.5 font-normal">Kind</th>
                <th className="px-6 py-2.5 font-normal">Sales post to</th>
                <th className="px-6 py-2.5 font-normal">Purchases post to</th>
                <th className="px-6 py-2.5 font-normal">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700">
              {state.taxCodes.map((t) => (
                <tr key={t.id} className={t.is_active ? "" : "opacity-60"}>
                  <td className="px-6 py-3 font-mono text-xs font-medium">{t.code}</td>
                  <td className="px-6 py-3">
                    <p className="font-medium">{t.name}</p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">{t.description}</p>
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums">{pct(t.rate)}</td>
                  <td className="px-6 py-3">{humanize(t.kind)}</td>
                  {[t.output_account_id, t.input_account_id].map((id, i) => (
                    <td key={i} className="px-6 py-3">
                      {id ? (
                        <Link href={`/accounting/general-ledger?account=${id}`} className="hover:text-brand-700 dark:hover:text-brand-300">
                          <span className="font-mono text-xs text-neutral-400">{accounts.get(id)?.code}</span> {accounts.get(id)?.name}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                  ))}
                  <td className="px-6 py-3">
                    <StatusBadge status={t.is_active ? "ACTIVE" : "INACTIVE"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
