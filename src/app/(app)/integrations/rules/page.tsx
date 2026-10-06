"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { FiCheckCircle, FiAlertTriangle, FiZap } from "react-icons/fi";
import { Callout, PageHeader, Panel, Toggle, compactInputClass } from "@/components/ui";
import StatusBadge from "@/components/statusBadge";
import { useLedger } from "@/store/ledgerStore";
import { lineTotals } from "@/lib/ledger";
import type { RuleAmountBasis } from "@/models/accounting";
import { classNames, fmtAccounting, fmtCurrency, fmtDateTime, humanize } from "@/utils/format";

export default function RulesPage() {
  const { state, actions } = useLedger();
  const [selectedId, setSelectedId] = useState(state.rules[0]?.id ?? "");
  const rule = state.rules.find((r) => r.id === selectedId);
  const [sample, setSample] = useState<Partial<Record<RuleAmountBasis, string>>>({});
  const accounts = new Map(state.accounts.map((a) => [a.id, a]));
  const sourceName = new Map(state.dataSources.map((s) => [s.id, s.name]));

  useEffect(() => {
    if (rule) setSample(Object.fromEntries(Object.entries(rule.sample).map(([k, v]) => [k, String(v)])));
  }, [rule]);

  const bases = rule ? [...new Set(rule.lines.map((l) => l.basis))] : [];
  const preview = rule
    ? rule.lines.map((l) => {
        const amt = Number(sample[l.basis]) || 0;
        return { ...l, debit: l.side === "DEBIT" ? amt : 0, credit: l.side === "CREDIT" ? amt : 0 };
      })
    : [];
  const totals = lineTotals(preview);
  const balanced = totals.debit > 0 && Math.abs(totals.difference) < 0.005;

  return (
    <div>
      <PageHeader
        title="Posting rules"
        description="Each business event from a connected system is turned into a balanced journal by a rule. Rules are configuration, versioned and audited."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="space-y-2 lg:col-span-2">
          {state.rules.map((r) => (
            <button
              key={r.id}
              onClick={() => setSelectedId(r.id)}
              className={classNames(
                "w-full rounded-xl border bg-white p-4 text-left transition dark:bg-neutral-800",
                r.id === selectedId ? "border-brand-500 ring-1 ring-brand-500" : "border-neutral-200 hover:border-neutral-300 dark:border-neutral-700",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold">{r.name}</p>
                <StatusBadge status={r.is_active ? "ACTIVE" : "INACTIVE"} />
              </div>
              <p className="mt-0.5 font-mono text-xs text-brand-700 dark:text-brand-300">{r.event}</p>
              <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                {sourceName.get(r.source_id)} · {r.lines.length} lines · {r.postings_count} postings
              </p>
            </button>
          ))}
        </div>

        {rule && (
          <div className="space-y-6 lg:col-span-3">
            <Panel
              title={rule.name}
              subtitle={
                <span>
                  When <span className="font-mono text-brand-700 dark:text-brand-300">{rule.event}</span> arrives from {sourceName.get(rule.source_id)}
                </span>
              }
            >
              <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-300">{rule.description}</p>
              <div className="mb-5 rounded-xl border border-neutral-200 p-4 dark:border-neutral-700">
                <Toggle
                  checked={rule.is_active}
                  onChange={() => {
                    const res = actions.toggleRule(rule.id);
                    if (res.ok) toast.success(res.message ?? "Updated");
                  }}
                  label="Rule active"
                  description={
                    rule.is_active
                      ? "Matching events post automatically."
                      : "Matching events are held in the source's review queue until a rule is active."
                  }
                />
              </div>
              <h4 className="mb-2 text-sm font-semibold">Posting template</h4>
              <div className="overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-700">
                <table className="min-w-full text-sm">
                  <thead className="bg-neutral-50 text-left text-neutral-500 dark:bg-neutral-900/40">
                    <tr>
                      <th className="px-4 py-2 font-normal">Side</th>
                      <th className="px-4 py-2 font-normal">Account</th>
                      <th className="px-4 py-2 font-normal">Amount from</th>
                      <th className="px-4 py-2 font-normal">Line label</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700">
                    {rule.lines.map((l, i) => (
                      <tr key={i}>
                        <td className="px-4 py-2.5">
                          <span
                            className={`rounded px-2 py-0.5 text-xs font-semibold ${
                              l.side === "DEBIT" ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" : "bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300"
                            }`}
                          >
                            {l.side === "DEBIT" ? "Dr" : "Cr"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <Link href={`/accounting/general-ledger?account=${l.account_id}`} className="hover:text-brand-700 dark:hover:text-brand-300">
                            <span className="mr-2 font-mono text-xs text-neutral-400">{accounts.get(l.account_id)?.code}</span>
                            {accounts.get(l.account_id)?.name}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs">event.{l.basis.toLowerCase()}</td>
                        <td className="px-4 py-2.5 text-neutral-600 dark:text-neutral-300">{l.label}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
                Last changed by {rule.updated_by} · {fmtDateTime(rule.updated_at)}
              </p>
            </Panel>

            <Panel
              title="Try it"
              subtitle="Enter sample amounts from an event to see the journal this rule would post"
              actions={<FiZap className="h-5 w-5 text-brand-500" />}
            >
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {bases.map((b) => (
                  <label key={b} className="text-sm">
                    <span className="mb-1 block font-mono text-xs text-neutral-500">event.{b.toLowerCase()}</span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={sample[b] ?? ""}
                      onChange={(e) => setSample((s) => ({ ...s, [b]: e.target.value }))}
                      className={`${compactInputClass} tabular-nums`}
                    />
                  </label>
                ))}
              </div>
              <div className="overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-700">
                <table className="min-w-full text-sm">
                  <thead className="bg-neutral-50 text-left text-neutral-500 dark:bg-neutral-900/40">
                    <tr>
                      <th className="px-4 py-2 font-normal">Account</th>
                      <th className="px-4 py-2 text-right font-normal">Debit</th>
                      <th className="px-4 py-2 text-right font-normal">Credit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700">
                    {preview.map((l, i) => (
                      <tr key={i}>
                        <td className="px-4 py-2">
                          {accounts.get(l.account_id)?.name}
                          <span className="ml-2 text-xs text-neutral-500">{l.label}</span>
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">{fmtAccounting(l.debit)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{fmtAccounting(l.credit)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-neutral-50 font-semibold dark:bg-neutral-900/40">
                    <tr>
                      <td className="px-4 py-2">Total</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmtAccounting(totals.debit)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmtAccounting(totals.credit)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {balanced ? (
                <Callout tone="success" icon={FiCheckCircle} className="mt-4">
                  Balanced. This event would post a {fmtCurrency(totals.debit)} journal tagged with its source reference.
                </Callout>
              ) : (
                <Callout tone="danger" icon={FiAlertTriangle} className="mt-4" title="Would be rejected">
                  Debits and credits differ by {fmtCurrency(Math.abs(totals.difference))}. The posting engine holds unbalanced
                  events for review instead of posting them. Check that{" "}
                  {bases.map((b) => humanize(b).toLowerCase()).join(", ")} add up.
                </Callout>
              )}
            </Panel>
          </div>
        )}
      </div>
    </div>
  );
}
