"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  FiAlertTriangle,
  FiArrowRight,
  FiCheckSquare,
  FiFileText,
  FiLink,
  FiPlus,
  FiRepeat,
  FiUploadCloud,
} from "react-icons/fi";
import { PageHeader, Panel, Button } from "@/components/ui";
import StatCard from "@/components/statCard";
import StatusBadge from "@/components/statusBadge";
import ProfitChart from "@/components/charts/profitChart";
import CashChart from "@/components/charts/cashChart";
import DocumentFormModal from "@/components/documents/documentFormModal";
import { useJournalViewer } from "@/components/accounting/journalViewer";
import { useCurrentUser, useLedger } from "@/store/ledgerStore";
import { billRows, invoiceRows } from "@/store/selectors";
import { balancesByAccount, cashBalanceSeries, incomeStatement, monthlyProfitAndLoss } from "@/lib/ledger";
import { AGEING_BUCKETS, ageingBucket, emptyAgeing } from "@/lib/documents";
import { addDays, monthKey, startOfYear, todayIso } from "@/utils/dates";
import { fmtCompact, fmtCurrency, fmtDate, fmtRelative, round2 } from "@/utils/format";

const MONTHS = Array.from({ length: 10 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}`);

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

export default function DashboardPage() {
  const { state } = useLedger();
  const user = useCurrentUser();
  const { openJournal, newJournal } = useJournalViewer();
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const today = todayIso();

  const data = useMemo(() => {
    const balances = balancesByAccount(state.accounts, state.journals, { to: today });
    const cash = round2(state.accounts.filter((a) => a.is_bank).reduce((s, a) => s + (balances.get(a.id) ?? 0), 0));
    const invoices = invoiceRows(state);
    const bills = billRows(state);
    const receivable = round2(invoices.reduce((s, r) => s + r.outstanding, 0));
    const overdueAr = round2(invoices.filter((r) => r.status === "OVERDUE").reduce((s, r) => s + r.outstanding, 0));
    const payable = round2(bills.reduce((s, r) => s + r.outstanding, 0));
    const dueSoon = round2(
      bills
        .filter((r) => r.outstanding > 0 && r.doc.due_date <= addDays(today, 7))
        .reduce((s, r) => s + r.outstanding, 0),
    );
    const ytd = incomeStatement(state.accounts, state.journals, startOfYear(today), today);
    const margin = ytd.totalRevenue ? (ytd.netIncome / ytd.totalRevenue) * 100 : 0;
    const pnl = monthlyProfitAndLoss(state.accounts, state.journals, MONTHS);
    const cashSeries = cashBalanceSeries(state.accounts, state.journals, MONTHS);
    const thisMonth = pnl.find((p) => p.month === monthKey(today));
    const lastMonth = pnl.find((p) => p.month === "2026-09");

    const ageing = emptyAgeing();
    for (const r of invoices) if (r.outstanding > 0) ageing[ageingBucket(r.doc.due_date, today)] += r.outstanding;

    return { cash, receivable, overdueAr, payable, dueSoon, ytd, margin, pnl, cashSeries, thisMonth, lastMonth, ageing };
  }, [state, today]);

  const pending = state.journals.filter((j) => j.status === "PENDING_APPROVAL");
  const drafts = state.journals.filter((j) => j.status === "DRAFT");
  const unmatched = state.statementLines.filter((l) => l.status !== "MATCHED").length;
  const reviewImports = state.importBatches.filter((b) => b.status === "NEEDS_REVIEW" || b.status === "FAILED");
  const troubled = state.dataSources.filter((d) => d.status === "ERROR" || d.status === "WARNING");
  const overdueCount = invoiceRows(state).filter((r) => r.status === "OVERDUE").length;
  const connected = state.dataSources.filter((d) => d.status !== "NOT_CONNECTED");
  const ageingMax = Math.max(...AGEING_BUCKETS.map((b) => data.ageing[b]), 1);

  const attention = [
    {
      count: pending.length,
      label: "journals awaiting approval",
      href: "/accounting/journals?tab=PENDING_APPROVAL",
      icon: FiCheckSquare,
      tone: "amber",
    },
    { count: unmatched, label: "bank lines to reconcile", href: "/banking/reconciliation", icon: FiRepeat, tone: "orange" },
    { count: overdueCount, label: "overdue customer invoices", href: "/sales/invoices?tab=OVERDUE", icon: FiFileText, tone: "red" },
    { count: reviewImports.length, label: "imports need review", href: "/integrations/imports", icon: FiUploadCloud, tone: "amber" },
    { count: troubled.length, label: "integrations need attention", href: "/integrations/sources", icon: FiLink, tone: "red" },
    { count: drafts.length, label: "draft journals", href: "/accounting/journals?tab=DRAFT", icon: FiFileText, tone: "neutral" },
  ].filter((a) => a.count > 0);

  return (
    <div>
      <PageHeader
        title={`${greeting()}, ${user.name.split(" ")[0]}`}
        description={`${state.org.name} · figures as at ${fmtDate(today)} · all amounts in ${state.org.base_currency}`}
        actions={
          <>
            <Button variant="secondary" icon={FiPlus} onClick={newJournal}>
              Journal entry
            </Button>
            <Button icon={FiPlus} onClick={() => setInvoiceOpen(true)}>
              New invoice
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Cash & bank"
          value={fmtCurrency(data.cash)}
          sub={`${state.bankAccounts.length} accounts · ledger balance`}
          info="Sum of every bank, mobile money and cash account in the general ledger."
        />
        <StatCard
          label="Receivables"
          value={fmtCurrency(data.receivable)}
          sub={<span className="text-orange-600 dark:text-orange-400">{fmtCurrency(data.overdueAr)} overdue</span>}
          info="Approved customer invoices not yet paid."
        />
        <StatCard
          label="Payables"
          value={fmtCurrency(data.payable)}
          sub={`${fmtCurrency(data.dueSoon)} due within 7 days`}
          info="Approved supplier bills not yet paid."
        />
        <StatCard
          label="Net profit (YTD)"
          value={fmtCurrency(data.ytd.netIncome)}
          tone={data.ytd.netIncome >= 0 ? "success" : "danger"}
          trend={data.ytd.netIncome >= 0 ? "up" : "down"}
          sub={`${data.margin.toFixed(1)}% margin on ${fmtCompact(data.ytd.totalRevenue)} revenue`}
          info="Revenue less cost of sales and operating expenses since 1 January, from posted journals."
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Panel
          title="Revenue vs expenses"
          subtitle="Posted activity by month, 2026"
          className="xl:col-span-2"
          actions={
            <Link href="/reports/income-statement" className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300">
              Income statement
            </Link>
          }
        >
          <ProfitChart data={data.pnl} />
        </Panel>
        <Panel title="Cash position" subtitle="Month-end balance across bank, MoMo and cash">
          <CashChart data={data.cashSeries} />
        </Panel>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <Panel title="Needs attention" subtitle="Work waiting on the finance team">
          {attention.length === 0 ? (
            <p className="text-sm text-neutral-500">All clear. Nothing is waiting.</p>
          ) : (
            <ul className="-mx-2 space-y-1">
              {attention.map((a) => (
                <li key={a.label}>
                  <Link
                    href={a.href}
                    className="group flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-neutral-50 dark:hover:bg-neutral-700/50"
                  >
                    <span
                      className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                        a.tone === "red"
                          ? "bg-red-50 text-red-600 dark:bg-red-900/20"
                          : a.tone === "orange"
                            ? "bg-orange-50 text-orange-600 dark:bg-orange-900/20"
                            : a.tone === "amber"
                              ? "bg-amber-50 text-amber-600 dark:bg-amber-900/20"
                              : "bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300"
                      }`}
                    >
                      <a.icon className="h-4 w-4" />
                    </span>
                    <span className="flex-1 text-sm">
                      <span className="font-semibold tabular-nums">{a.count}</span> {a.label}
                    </span>
                    <FiArrowRight className="h-4 w-4 text-neutral-300 group-hover:text-brand-600" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {pending.length > 0 && (
            <div className="mt-4 border-t border-neutral-100 pt-4 dark:border-neutral-700">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">Awaiting approval</p>
              {pending.slice(0, 3).map((j) => (
                <button
                  key={j.id}
                  onClick={() => openJournal(j.id)}
                  className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-sm hover:bg-neutral-50 dark:hover:bg-neutral-700/50"
                >
                  <span className="min-w-0">
                    <span className="font-mono text-xs text-neutral-500">{j.number}</span>
                    <span className="ml-2 truncate">{j.memo}</span>
                  </span>
                  <span className="ml-3 shrink-0 tabular-nums font-medium">
                    {fmtCurrency(j.lines.reduce((s, l) => s + l.debit, 0))}
                  </span>
                </button>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="Receivables ageing"
          subtitle={`${fmtCurrency(data.receivable)} outstanding`}
          actions={
            <Link href="/reports/ar-ageing" className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300">
              Details
            </Link>
          }
        >
          <ul className="space-y-3">
            {AGEING_BUCKETS.map((b, i) => (
              <li key={b}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-neutral-600 dark:text-neutral-300">{b}</span>
                  <span className="tabular-nums font-medium">{fmtCurrency(data.ageing[b])}</span>
                </div>
                <div className="h-2 rounded-full bg-neutral-100 dark:bg-neutral-700">
                  <div
                    className={`h-2 rounded-full ${
                      ["bg-emerald-500", "bg-amber-400", "bg-orange-500", "bg-red-500", "bg-red-700"][i]
                    }`}
                    style={{ width: `${(data.ageing[b] / ageingMax) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel
          title="Integration health"
          subtitle={`${connected.length} of ${state.dataSources.length} sources connected`}
          actions={
            <Link href="/integrations/sources" className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300">
              Manage
            </Link>
          }
        >
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-700">
            {connected.slice(0, 7).map((d) => (
              <li key={d.id} className="flex items-center justify-between py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{d.name}</p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Last sync {fmtRelative(d.last_run_at)} · {d.records_synced.toLocaleString()} records
                  </p>
                </div>
                <StatusBadge status={d.status} />
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Panel title="This month" subtitle="October to date vs September">
          <dl className="space-y-3 text-sm">
            {[
              { label: "Revenue", now: data.thisMonth?.revenue ?? 0, prev: data.lastMonth?.revenue ?? 0 },
              { label: "Expenses", now: data.thisMonth?.expenses ?? 0, prev: data.lastMonth?.expenses ?? 0 },
              { label: "Net profit", now: data.thisMonth?.profit ?? 0, prev: data.lastMonth?.profit ?? 0 },
            ].map((r) => (
              <div key={r.label} className="flex items-center justify-between">
                <dt className="text-neutral-500 dark:text-neutral-400">{r.label}</dt>
                <dd className="text-right">
                  <span className="font-semibold tabular-nums">{fmtCurrency(r.now)}</span>
                  <span className="ml-2 text-xs text-neutral-400 tabular-nums">Sep {fmtCompact(r.prev)}</span>
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 flex items-start gap-2 rounded-lg bg-neutral-50 p-3 text-xs text-neutral-500 dark:bg-neutral-900/40 dark:text-neutral-400">
            <FiAlertTriangle className="mt-0.5 shrink-0" />
            October is five days in; month-end payroll, depreciation and Store Management summaries are not posted yet.
          </p>
        </Panel>

        <Panel
          title="Recent activity"
          subtitle="Latest changes across the ledger"
          className="xl:col-span-2"
          actions={
            <Link href="/audit-trail" className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300">
              Audit trail
            </Link>
          }
        >
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-700">
            {state.auditEvents.slice(0, 7).map((e) => (
              <li key={e.id} className="flex items-start gap-3 py-2.5">
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                    e.actor_type === "INTEGRATION" ? "bg-sky-500" : e.actor_type === "SYSTEM" ? "bg-neutral-400" : "bg-brand-500"
                  }`}
                />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="truncate">
                    <span className="font-medium">{e.actor_name}</span>{" "}
                    <span className="text-neutral-500 dark:text-neutral-400">· {e.entity_label}</span>
                  </p>
                  <p className="truncate text-neutral-600 dark:text-neutral-300">{e.summary}</p>
                </div>
                <span className="shrink-0 text-xs text-neutral-400">{fmtRelative(e.occurred_at)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <DocumentFormModal kind="invoice" open={invoiceOpen} onClose={() => setInvoiceOpen(false)} />
    </div>
  );
}
