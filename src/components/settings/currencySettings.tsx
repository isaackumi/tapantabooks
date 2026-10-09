"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { FiDownloadCloud, FiPlus, FiRefreshCw, FiTrash2, FiTrendingDown, FiTrendingUp } from "react-icons/fi";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button, Field, FormError, Panel, inputClass } from "@/components/ui";
import StatusBadge from "@/components/statusBadge";
import { BTN_PRIMARY, BTN_SECONDARY, Modal } from "@/components/modal";
import { useChartTheme } from "@/components/charts/chartTheme";
import { useLedger } from "@/store/ledgerStore";
import { useReport } from "@/services/useApiQuery";
import type { OrgSettings } from "@/models/accounting";
import type { CurrencyExposure } from "@/models/lists";
import { rateOn } from "@/lib/fx";
import { addDays, todayIso } from "@/utils/dates";
import { classNames, currencySymbol, fmtCurrency, fmtDate, fmtMoney, fmtRate } from "@/utils/format";

const AddCurrencyModal = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const { actions } = useLedger();
  const [form, setForm] = useState({ code: "", name: "", symbol: "", rate: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setForm({ code: "", name: "", symbol: "", rate: "" });
      setError(null);
    }
  }, [open]);
  const submit = async () => {
    setBusy(true);
    try {
      const res = await actions.addCurrency(form);
      if (!res.ok) return setError(res.error);
      if (Number(form.rate) > 0) {
        const r = await actions.addExchangeRate({ currency: res.data.code, date: todayIso(), rate: Number(form.rate) });
        if (!r.ok) return setError(r.error);
      }
      toast.success(res.message ?? "Added");
      onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add currency"
      description="Once added, the currency can be used on customers, suppliers, invoices, bills and bank accounts."
      buttons={[
        { label: "Cancel", onClick: onClose, className: BTN_SECONDARY },
        { label: "Add currency", onClick: submit, className: BTN_PRIMARY, disabled: busy },
      ]}
    >
      <FormError message={error} />
      <div className="grid grid-cols-3 gap-4">
        <Field label="Code" required>
          <input
            value={form.code}
            maxLength={3}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
            placeholder="CAD"
            className={`${inputClass} font-mono uppercase`}
          />
        </Field>
        <Field label="Name" required className="col-span-2">
          <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Canadian dollar" className={inputClass} />
        </Field>
        <Field label="Symbol">
          <input value={form.symbol} onChange={(e) => setForm((f) => ({ ...f, symbol: e.target.value }))} placeholder="C$" className={inputClass} />
        </Field>
        <Field label="Today's rate" className="col-span-2" hint={`GH₵ for 1 ${form.code || "unit"}. You can add it later.`}>
          <input
            type="number"
            step="0.0001"
            min={0}
            value={form.rate}
            onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))}
            className={`${inputClass} tabular-nums`}
          />
        </Field>
      </div>
    </Modal>
  );
};

const RateHistory = ({ code }: { code: string }) => {
  const { state, actions } = useLedger();
  const t = useChartTheme();
  const [form, setForm] = useState({ date: todayIso(), rate: "" });
  const [error, setError] = useState<string | null>(null);
  const rates = useMemo(
    () => state.exchangeRates.filter((r) => r.currency === code).sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at)),
    [state.exchangeRates, code],
  );
  const chart = useMemo(() => [...rates].reverse().map((r) => ({ date: r.date, rate: r.rate })), [rates]);
  const latest = rates[0];

  useEffect(() => {
    setForm({ date: todayIso(), rate: latest ? String(latest.rate) : "" });
    setError(null);
  }, [code, latest]);

  const record = async () => {
    const res = await actions.addExchangeRate({ currency: code, date: form.date, rate: Number(form.rate) });
    if (!res.ok) return setError(res.error);
    setError(null);
    toast.success(res.message ?? "Recorded");
  };

  return (
    <Panel
      tour="fx-history"
      title={`${code} rate history`}
      subtitle={`GH₵ per 1 ${code}. Each document keeps the rate it was posted at; new rates only affect new documents and revaluations.`}
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {chart.length > 1 ? (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <XAxis dataKey="date" tickFormatter={(d: string) => fmtDate(d).replace(/ \d{4}$/, "")} tick={{ fill: t.axis, fontSize: 11 }} stroke={t.grid} minTickGap={40} />
                  <YAxis domain={["auto", "auto"]} tick={{ fill: t.axis, fontSize: 11 }} stroke={t.grid} width={56} tickFormatter={(v: number) => v.toFixed(2)} />
                  <Tooltip
                    contentStyle={{ background: t.tooltipBg, border: `1px solid ${t.tooltipBorder}`, borderRadius: 8, color: t.tooltipText, fontSize: 12 }}
                    labelFormatter={(d) => fmtDate(String(d))}
                    formatter={(v) => [fmtRate(Number(v)), `1 ${code}`]}
                  />
                  <Line type="monotone" dataKey="rate" stroke={t.brand} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="py-16 text-center text-sm text-neutral-500">Record at least two rates to see a trend.</p>
          )}
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold">Record a manual rate</p>
          <FormError message={error} />
          <div className="space-y-3">
            <Field label="Applies from">
              <input type="date" max={todayIso()} value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className={inputClass} />
            </Field>
            <Field label={`GH₵ per 1 ${code}`}>
              <input
                type="number"
                step="0.0001"
                min={0}
                value={form.rate}
                onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))}
                className={`${inputClass} tabular-nums`}
              />
            </Field>
            <Button className="w-full" onClick={record} icon={FiPlus}>
              Record rate
            </Button>
          </div>
        </div>
      </div>
      <div className="mt-6 max-h-80 overflow-y-auto rounded-lg border border-neutral-100 dark:border-neutral-700">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 bg-neutral-50 text-left text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400">
            <tr>
              <th className="px-4 py-2 font-normal">Date</th>
              <th className="px-4 py-2 text-right font-normal">Rate</th>
              <th className="px-4 py-2 text-right font-normal">Change</th>
              <th className="px-4 py-2 font-normal">Source</th>
              <th className="px-4 py-2 font-normal">Recorded by</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700">
            {rates.map((r, i) => {
              const prev = rates[i + 1];
              const change = prev ? ((r.rate - prev.rate) / prev.rate) * 100 : null;
              return (
                <tr key={r.id}>
                  <td className="px-4 py-2">{fmtDate(r.date)}</td>
                  <td className="px-4 py-2 text-right font-medium tabular-nums">{fmtRate(r.rate)}</td>
                  <td
                    className={classNames(
                      "px-4 py-2 text-right text-xs tabular-nums",
                      change === null ? "text-neutral-400" : change >= 0 ? "text-emerald-600" : "text-red-600",
                    )}
                  >
                    {change === null ? "—" : `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`}
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={r.source === "MANUAL" ? "NEUTRAL" : "INFO"} label={r.source === "MANUAL" ? "Manual" : "Bank of Ghana"} />
                  </td>
                  <td className="px-4 py-2 text-xs text-neutral-500">{r.created_by ?? "—"}</td>
                  <td className="px-4 py-2 text-right">
                    {r.source === "MANUAL" && (
                      <button
                        onClick={async () => {
                          const res = await actions.deleteExchangeRate(r.id);
                          if (res.ok) toast.success(res.message ?? "Deleted");
                          else toast.error(res.error);
                        }}
                        className="rounded p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600"
                        aria-label="Delete rate"
                      >
                        <FiTrash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
};

const FxPostingPanel = () => {
  const { state, actions } = useLedger();
  const pick = (o: OrgSettings) => ({
    fx_realised_account_id: o.fx_realised_account_id,
    fx_unrealised_account_id: o.fx_unrealised_account_id,
    fx_rate_tolerance_pct: o.fx_rate_tolerance_pct,
  });
  const [form, setForm] = useState(pick(state.org));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setForm(pick(state.org)), [state.org]);
  const dirty = JSON.stringify(form) !== JSON.stringify(pick(state.org));
  const plAccounts = state.accounts.filter((a) => a.is_active && !a.is_group && (a.type === "EXPENSE" || a.type === "REVENUE"));
  const save = async () => {
    const res = await actions.updateOrg(form);
    if (!res.ok) return setError(res.error);
    setError(null);
    toast.success("Exchange settings saved");
  };
  return (
    <Panel tour="fx-posting" title="Exchange differences" subtitle="Where gains and losses post, and how far a document rate may stray from the day's rate">
      <FormError message={error} />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Field label="Realised gain / loss account" hint="Posted when a foreign document is paid at a different rate">
          <select value={form.fx_realised_account_id} onChange={(e) => setForm((f) => ({ ...f, fx_realised_account_id: e.target.value }))} className={inputClass}>
            {plAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} · {a.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Unrealised gain / loss account" hint="Posted by month-end revaluation and reversed the next day">
          <select value={form.fx_unrealised_account_id} onChange={(e) => setForm((f) => ({ ...f, fx_unrealised_account_id: e.target.value }))} className={inputClass}>
            {plAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} · {a.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Rate tolerance (%)" hint="Documents whose rate differs by more than this from the reference rate show a warning">
          <input
            type="number"
            min={0}
            step="0.5"
            value={form.fx_rate_tolerance_pct}
            onChange={(e) => setForm((f) => ({ ...f, fx_rate_tolerance_pct: Number(e.target.value) }))}
            className={`${inputClass} tabular-nums`}
          />
        </Field>
      </div>
      <div className="mt-4 flex justify-end gap-3">
        <Button variant="secondary" disabled={!dirty} onClick={() => setForm(pick(state.org))}>
          Discard
        </Button>
        <Button disabled={!dirty} onClick={save}>
          Save
        </Button>
      </div>
    </Panel>
  );
};

export const CurrencySettings = () => {
  const { state, actions } = useLedger();
  const [adding, setAdding] = useState(false);
  const base = state.org.base_currency;
  const foreign = state.currencies.filter((c) => c.code !== base);
  const [selected, setSelected] = useState(foreign.find((c) => c.is_active)?.code ?? "");
  const today = todayIso();

  const exposureQuery = useReport<CurrencyExposure>("/currencies/exposure", {});
  const exposure = useMemo(() => new Map((exposureQuery.data?.items ?? []).map((e) => [e.currency, e])), [exposureQuery.data]);
  const exposureCell = (v: number | undefined, code: string) =>
    exposureQuery.error ? (
      <span className="text-xs text-red-600" title={exposureQuery.error}>
        Unavailable
      </span>
    ) : !exposureQuery.data ? (
      <span className="text-neutral-300">…</span>
    ) : v ? (
      fmtMoney(v, code)
    ) : (
      "—"
    );

  const missingToday = foreign.filter((c) => c.is_active && rateOn(state.exchangeRates, c.code, today)?.date !== today);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div
          className="rounded-xl border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-5 dark:border-brand-900 dark:from-brand-950/40 dark:to-neutral-800"
          data-tour="fx-base"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">Base currency</p>
          <p className="mt-2 text-3xl font-bold">
            {currencySymbol(base)} <span className="text-lg font-medium text-neutral-500">{base}</span>
          </p>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
            {state.currencies.find((c) => c.code === base)?.name}. Every ledger balance, report and tax return is in {base}. Fixed
            once transactions exist.
          </p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-5 lg:col-span-2 dark:border-neutral-700 dark:bg-neutral-800" data-tour="fx-reference">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold">Daily reference rates</p>
              <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                {missingToday.length === 0
                  ? `All active currencies have a rate for ${fmtDate(today)}.`
                  : `${missingToday.map((c) => c.code).join(", ")} ${missingToday.length === 1 ? "has" : "have"} no rate for ${fmtDate(today)} yet; documents default to the latest earlier rate.`}
              </p>
            </div>
            <Button
              icon={FiDownloadCloud}
              onClick={async () => {
                const res = await actions.fetchReferenceRates();
                if (res.ok) toast.success(res.message ?? "Fetched");
                else toast.error(res.error);
              }}
            >
              Fetch Bank of Ghana rates
            </Button>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            {foreign
              .filter((c) => c.is_active)
              .map((c) => {
                const r = rateOn(state.exchangeRates, c.code, today);
                return (
                  <div key={c.code} className="min-w-36 rounded-lg bg-neutral-50 px-4 py-2.5 dark:bg-neutral-900/40">
                    <p className="text-xs text-neutral-500">1 {c.code}</p>
                    <p className="text-lg font-semibold tabular-nums">{r ? fmtCurrency(r.rate) : "—"}</p>
                    <p className={classNames("text-xs", r?.date === today ? "text-emerald-600" : "text-amber-600")}>
                      {r ? (r.date === today ? "Today" : `As of ${fmtDate(r.date)}`) : "No rate"}
                    </p>
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      <Panel
        tour="fx-currencies"
        title="Currencies"
        subtitle="Active currencies can be chosen on customers, suppliers, documents and bank accounts"
        actions={
          <Button size="sm" variant="secondary" icon={FiPlus} onClick={() => setAdding(true)} data-tour="fx-add">
            Add currency
          </Button>
        }
        bodyClassName="px-0 pb-2"
      >
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-neutral-500 dark:text-neutral-400">
              <tr>
                <th className="px-6 py-2 font-normal">Currency</th>
                <th className="px-4 py-2 text-right font-normal">Latest rate</th>
                <th className="px-4 py-2 text-right font-normal">30-day move</th>
                <th className="px-4 py-2 text-right font-normal">Open receivables</th>
                <th className="px-4 py-2 text-right font-normal">Open payables</th>
                <th className="px-4 py-2 font-normal">Bank accounts</th>
                <th className="px-4 py-2 font-normal">Status</th>
                <th className="px-6 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700">
              {foreign.map((c) => {
                const latest = rateOn(state.exchangeRates, c.code, today);
                const month = rateOn(state.exchangeRates, c.code, addDays(today, -30));
                const move = latest && month ? ((latest.rate - month.rate) / month.rate) * 100 : null;
                const ex = exposure.get(c.code);
                return (
                  <tr
                    key={c.code}
                    className={classNames(
                      "cursor-pointer transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-700/40",
                      selected === c.code && "bg-brand-50/50 dark:bg-brand-900/10",
                      !c.is_active && "opacity-60",
                    )}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest("button")) return;
                      setSelected(c.code);
                    }}
                  >
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 text-xs font-semibold dark:bg-neutral-700">
                          {c.symbol}
                        </span>
                        <div>
                          <p className="font-medium">{c.code}</p>
                          <p className="text-xs text-neutral-500">{c.name}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p className="font-medium tabular-nums">{latest ? fmtRate(latest.rate) : "—"}</p>
                      {latest && <p className="text-xs text-neutral-500">{fmtDate(latest.date)}</p>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {move === null ? (
                        <span className="text-neutral-400">—</span>
                      ) : (
                        <span className={classNames("inline-flex items-center gap-1 text-xs font-medium tabular-nums", move >= 0 ? "text-emerald-600" : "text-red-600")}>
                          {move >= 0 ? <FiTrendingUp /> : <FiTrendingDown />}
                          {move >= 0 ? "+" : ""}
                          {move.toFixed(2)}%
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">{exposureCell(ex?.receivable, c.code)}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">{exposureCell(ex?.payable, c.code)}</td>
                    <td className="px-4 py-3 text-xs text-neutral-600 dark:text-neutral-300">
                      {state.bankAccounts
                        .filter((b) => b.currency === c.code)
                        .map((b) => b.name)
                        .join(", ") || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={c.is_active ? "ACTIVE" : "INACTIVE"} />
                    </td>
                    <td className="px-6 py-3 text-right">
                      <button
                        onClick={async () => {
                          const res = await actions.toggleCurrency(c.code);
                          if (res.ok) toast.success(res.message ?? "Updated");
                          else toast.error(res.error);
                        }}
                        className="whitespace-nowrap text-sm text-brand-700 hover:underline dark:text-brand-300"
                      >
                        {c.is_active ? "Switch off" : "Switch on"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="px-6 pt-3 text-xs text-neutral-500 dark:text-neutral-400">
          Open balances are revalued at each month end from{" "}
          <Link href="/accounting/revaluation" className="font-medium text-brand-700 hover:underline dark:text-brand-300">
            <FiRefreshCw className="mr-1 inline h-3 w-3" />
            Currency revaluation
          </Link>
          .
        </p>
      </Panel>

      {selected && <RateHistory code={selected} />}
      <FxPostingPanel />
      <AddCurrencyModal open={adding} onClose={() => setAdding(false)} />
    </div>
  );
};
