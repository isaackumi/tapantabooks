"use client";

import { useState } from "react";
import { PageHeader, Panel } from "@/components/ui";
import { QueryState, Skeleton } from "@/components/queryState";
import {
  ReportSheet,
  ReportToolbar,
  StatementHeading,
  StatementSection,
  TotalRow,
  useReportPresets,
  withPrior,
} from "@/components/reports/reportKit";
import ProfitChart from "@/components/charts/profitChart";
import { useReport } from "@/services/useApiQuery";
import type { IncomeStatementReport, MonthlyTrendReport } from "@/models/reports";
import { downloadCsv } from "@/utils/csv";
import { fmtDate } from "@/utils/format";
import { useQueryParam } from "@/utils/useQueryParam";
import { addDays, daysBetween, isIsoDate, startOfYear, todayIso } from "@/utils/dates";

const hasActivity = (r: IncomeStatementReport | null) =>
  !!r && r.revenue.length + r.cost_of_sales.length + r.operating.length > 0;

export default function IncomeStatementPage() {
  const today = todayIso();
  const presets = useReportPresets();
  const [from, setFrom] = useState(startOfYear(today));
  const [to, setTo] = useState(today);
  useQueryParam("from", (v) => {
    if (isIsoDate(v)) setFrom(v);
  });
  useQueryParam("to", (v) => {
    if (isIsoDate(v)) setTo(v);
  });

  const priorTo = addDays(from, -1);
  const priorFrom = addDays(priorTo, -daysBetween(from, to));

  const current = useReport<IncomeStatementReport>("/reports/income-statement", { from_date: from, to_date: to });
  const prior = useReport<IncomeStatementReport>("/reports/income-statement", { from_date: priorFrom, to_date: priorTo });
  const trend = useReport<MonthlyTrendReport>("/reports/monthly-trend", { to_date: to });
  const pr = prior.data;
  const hasPrior = hasActivity(pr);
  const ledgerHref = (id: string) => `/accounting/general-ledger?account=${id}&from=${from}&to=${to}`;
  const margin = (n: number, r: number) => (r ? `${((n / r) * 100).toFixed(1)}%` : "—");

  const exportCsv = () => {
    const is = current.data;
    if (!is) return;
    const rows: (string | number)[][] = [["Section", "Code", "Account", `${from} to ${to}`, ...(hasPrior ? [`${priorFrom} to ${priorTo}`] : [])]];
    const add = (s: string, a: IncomeStatementReport["revenue"], b: IncomeStatementReport["revenue"]) =>
      withPrior(a, b).forEach((l) => rows.push([s, l.code ?? "", l.label, l.amount, ...(hasPrior ? [l.prior ?? 0] : [])]));
    add("Revenue", is.revenue, pr?.revenue ?? []);
    add("Cost of sales", is.cost_of_sales, pr?.cost_of_sales ?? []);
    add("Operating expenses", is.operating, pr?.operating ?? []);
    rows.push(["", "", "Net profit", is.net_income, ...(hasPrior && pr ? [pr.net_income] : [])]);
    downloadCsv(`income-statement-${from}-to-${to}.csv`, rows);
  };

  return (
    <div>
      <PageHeader
        title="Income statement"
        description="Revenue less costs for a period. Every figure links back to the ledger behind it."
        backHref="/reports"
        backLabel="Reports"
      />
      <ReportToolbar
        from={from}
        to={to}
        onFrom={setFrom}
        onTo={setTo}
        onExport={current.data ? exportCsv : undefined}
        presets={presets.period}
      />

      <Panel title="Monthly trend" subtitle="Last twelve months to the report end date" className="mx-auto mb-6 max-w-4xl" bodyClassName="pt-2">
        <QueryState query={trend} skeleton={<Skeleton rows={5} />}>
          {(t) => <ProfitChart data={t.months} height={220} />}
        </QueryState>
      </Panel>

      <QueryState query={current} className="mx-auto max-w-4xl" skeleton={<Skeleton rows={12} />}>
        {(is) => (
          <ReportSheet
            title="Statement of Profit or Loss"
            period={`${fmtDate(from)} to ${fmtDate(to)}`}
            footnote={
              <>
                Gross margin {margin(is.gross_profit, is.total_revenue)} · net margin {margin(is.net_income, is.total_revenue)}.
                {hasPrior && ` Comparative column covers ${fmtDate(priorFrom)} to ${fmtDate(priorTo)}.`}
              </>
            }
          >
            <StatementHeading current="This period" prior={hasPrior ? "Prior period" : undefined} />
            <StatementSection
              title="Revenue"
              lines={withPrior(is.revenue, pr?.revenue ?? [], ledgerHref)}
              totalLabel="Total revenue"
              total={is.total_revenue}
              priorTotal={pr?.total_revenue}
              compare={hasPrior}
            />
            <StatementSection
              title="Cost of sales"
              lines={withPrior(is.cost_of_sales, pr?.cost_of_sales ?? [], ledgerHref)}
              totalLabel="Total cost of sales"
              total={is.total_cost_of_sales}
              priorTotal={pr?.total_cost_of_sales}
              compare={hasPrior}
            />
            <TotalRow label="Gross profit" amount={is.gross_profit} prior={hasPrior ? pr?.gross_profit : undefined} className="mb-8" />
            <StatementSection
              title="Operating expenses"
              lines={withPrior(is.operating, pr?.operating ?? [], ledgerHref)}
              totalLabel="Total operating expenses"
              total={is.total_operating}
              priorTotal={pr?.total_operating}
              compare={hasPrior}
            />
            <TotalRow label="Net profit" amount={is.net_income} prior={hasPrior ? pr?.net_income : undefined} strong />
          </ReportSheet>
        )}
      </QueryState>
    </div>
  );
}
