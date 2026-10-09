"use client";

import { useState } from "react";
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
import { QueryState, Skeleton } from "@/components/queryState";
import { useCurrentUser, useLedger } from "@/store/ledgerStore";
import { useReport } from "@/services/useApiQuery";
import { fiscalYearFor } from "@/lib/fiscalYears";
import type { AgeingReport, DashboardStatistics, MonthlyTrendReport } from "@/models/reports";
import { addMonths, daysBetween, endOfMonth, monthLabel, monthName, startOfMonth, startOfYear, todayIso } from "@/utils/dates";
import { fmtCompact, fmtCurrency, fmtDate, fmtRelative } from "@/utils/format";

const AGEING_BAR = ["bg-emerald-500", "bg-amber-400", "bg-orange-500", "bg-red-500", "bg-red-700"];

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
  const fy = fiscalYearFor(state.org, today);

  const statsQuery = useReport<DashboardStatistics>("/dashboard/statistics", { as_at: today });
  const trendQuery = useReport<MonthlyTrendReport>("/reports/monthly-trend", { from_date: fy.start_date, to_date: today });
  const ageingQuery = useReport<AgeingReport>("/reports/ar-ageing", { as_at: today });
  const stats = statsQuery.data;

  const thisMonthKey = today.slice(0, 7);
  const lastMonthKey = addMonths(thisMonthKey, -1);
  const months = trendQuery.data?.months ?? [];
  const thisMonth = months.find((m) => m.month === thisMonthKey);
  const lastMonth = months.find((m) => m.month === lastMonthKey);
  const daysIntoMonth = daysBetween(startOfMonth(today), today) + 1;
  const monthComplete = today === endOfMonth(thisMonthKey);

  const pending = state.journals.filter((j) => j.status === "PENDING_APPROVAL");
  const reviewImports = state.importBatches.filter((b) => b.status === "NEEDS_REVIEW" || b.status === "FAILED");
  const troubled = state.dataSources.filter((d) => d.status === "ERROR" || d.status === "WARNING");
  const connected = state.dataSources.filter((d) => d.status !== "NOT_CONNECTED");

  const attention = [
    {
      count: stats?.journals_pending_approval ?? 0,
      label: ["journal awaiting approval", "journals awaiting approval"],
      href: "/accounting/journals?tab=PENDING_APPROVAL",
      icon: FiCheckSquare,
      tone: "amber",
    },
    {
      count: stats?.unmatched_statement_lines ?? 0,
      label: ["bank line to reconcile", "bank lines to reconcile"],
      href: "/banking/reconciliation",
      icon: FiRepeat,
      tone: "orange",
    },
    {
      count: stats?.overdue_invoices ?? 0,
      label: ["overdue customer invoice", "overdue customer invoices"],
      href: "/sales/invoices?tab=OVERDUE",
      icon: FiFileText,
      tone: "red",
    },
    { count: reviewImports.length, label: ["import needs review", "imports need review"], href: "/integrations/imports", icon: FiUploadCloud, tone: "amber" },
    {
      count: troubled.length,
      label: ["integration needs attention", "integrations need attention"],
      href: "/integrations/sources",
      icon: FiLink,
      tone: "red",
    },
    { count: stats?.draft_journals ?? 0, label: ["draft journal", "draft journals"], href: "/accounting/journals?tab=DRAFT", icon: FiFileText, tone: "neutral" },
  ]
    .filter((a) => a.count > 0)
    .map((a) => ({ ...a, label: a.count === 1 ? a.label[0] : a.label[1] }));

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

      <div data-tour="stats">
        <QueryState query={statsQuery} skeleton={<Skeleton rows={2} />}>
          {(s) => (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Cash & bank"
                value={fmtCurrency(s.cash_balance)}
                sub={`${state.bankAccounts.length} accounts · ledger balance`}
                info="Sum of every bank, mobile money and cash account in the general ledger."
              />
              <StatCard
                label="Receivables"
                value={fmtCurrency(s.receivables)}
                sub={<span className="text-orange-600 dark:text-orange-400">{fmtCurrency(s.overdue_receivables)} overdue</span>}
                info="Approved customer invoices not yet paid."
              />
              <StatCard
                label="Payables"
                value={fmtCurrency(s.payables)}
                sub={`${fmtCurrency(s.payables_due_7_days)} due within 7 days`}
                info="Approved supplier bills not yet paid."
              />
              <StatCard
                label="Net profit (YTD)"
                value={fmtCurrency(s.net_income_ytd)}
                tone={s.net_income_ytd >= 0 ? "success" : "danger"}
                sub={
                  s.revenue_ytd
                    ? `${((s.net_income_ytd / s.revenue_ytd) * 100).toFixed(1)}% margin on ${fmtCompact(s.revenue_ytd)} revenue`
                    : "No revenue posted this year"
                }
                info={`Revenue less cost of sales and operating expenses since ${fmtDate(startOfYear(today))}, from posted journals.`}
              />
            </div>
          )}
        </QueryState>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Panel
          tour="profit-chart"
          title="Revenue vs expenses"
          subtitle={`Posted activity by month, ${fy.name}`}
          className="xl:col-span-2"
          actions={
            <Link href="/reports/income-statement" className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300">
              Income statement
            </Link>
          }
        >
          <QueryState query={trendQuery} skeleton={<Skeleton rows={7} />}>
            {(t) => <ProfitChart data={t.months} />}
          </QueryState>
        </Panel>
        <Panel title="Cash position" subtitle={`Month-end balance across bank, MoMo and cash · ${state.org.base_currency}`}>
          <QueryState query={trendQuery} skeleton={<Skeleton rows={7} />}>
            {(t) => <CashChart data={t.months} />}
          </QueryState>
        </Panel>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <Panel tour="attention" title="Needs attention" subtitle="Work waiting on the finance team">
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
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="shrink-0 whitespace-nowrap font-mono text-xs text-neutral-500">{j.number}</span>
                    <span className="truncate">{j.memo}</span>
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
          subtitle={ageingQuery.data ? `${fmtCurrency(ageingQuery.data.totals.total)} outstanding` : "Outstanding by days past due"}
          actions={
            <Link href="/reports/ar-ageing" className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300">
              Details
            </Link>
          }
        >
          <QueryState query={ageingQuery} skeleton={<Skeleton rows={5} />}>
            {(a) => {
              const max = Math.max(...a.buckets.map((b) => a.totals[b] ?? 0), 1);
              return (
                <ul className="space-y-3">
                  {a.buckets.map((b, i) => (
                    <li key={b}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span className="text-neutral-600 dark:text-neutral-300">{b}</span>
                        <span className="tabular-nums font-medium">{fmtCurrency(a.totals[b] ?? 0)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-neutral-100 dark:bg-neutral-700">
                        <div
                          className={`h-2 rounded-full ${AGEING_BAR[i] ?? AGEING_BAR[AGEING_BAR.length - 1]}`}
                          style={{ width: `${((a.totals[b] ?? 0) / max) * 100}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              );
            }}
          </QueryState>
        </Panel>

        <Panel
          tour="integration-health"
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
        <Panel
          title="This month"
          subtitle={`${monthName(thisMonthKey).split(" ")[0]} to date vs ${monthName(lastMonthKey).split(" ")[0]}`}
        >
          <QueryState query={trendQuery} skeleton={<Skeleton rows={3} />}>
            {() => (
              <>
                <dl className="space-y-3 text-sm">
                  {[
                    { label: "Revenue", now: thisMonth?.revenue ?? 0, prev: lastMonth?.revenue },
                    { label: "Expenses", now: thisMonth?.expenses ?? 0, prev: lastMonth?.expenses },
                    { label: "Net profit", now: thisMonth?.net_income ?? 0, prev: lastMonth?.net_income },
                  ].map((r) => (
                    <div key={r.label} className="flex items-center justify-between">
                      <dt className="text-neutral-500 dark:text-neutral-400">{r.label}</dt>
                      <dd className="text-right">
                        <span className="font-semibold tabular-nums">{fmtCurrency(r.now)}</span>
                        {r.prev !== undefined && (
                          <span className="ml-2 text-xs text-neutral-400 tabular-nums">
                            {monthLabel(lastMonthKey)} {fmtCompact(r.prev)}
                          </span>
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
                {!monthComplete && (
                  <p className="mt-4 flex items-start gap-2 rounded-lg bg-neutral-50 p-3 text-xs text-neutral-500 dark:bg-neutral-900/40 dark:text-neutral-400">
                    <FiAlertTriangle className="mt-0.5 shrink-0" />
                    {daysIntoMonth} {daysIntoMonth === 1 ? "day" : "days"} into {monthName(thisMonthKey).split(" ")[0]}; month-end entries such as
                    payroll, depreciation and accruals may not be posted yet.
                  </p>
                )}
              </>
            )}
          </QueryState>
        </Panel>

        <Panel
          tour="recent-activity"
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
