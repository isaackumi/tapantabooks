"use client";

import { useMemo, useState } from "react";
import { PageHeader, Panel } from "@/components/ui";
import { ReportSheet, ReportToolbar, StatementHeading, StatementSection, TotalRow, withPrior } from "@/components/reports/reportKit";
import ProfitChart from "@/components/charts/profitChart";
import { useLedger } from "@/store/ledgerStore";
import { incomeStatement, monthlyProfitAndLoss } from "@/lib/ledger";
import { downloadCsv } from "@/utils/csv";
import { fmtDate } from "@/utils/format";
import { addDays, daysBetween, endOfMonth, startOfYear, todayIso } from "@/utils/dates";

const ledgerHref = (id: string) => `/accounting/general-ledger?account=${id}`;
const MONTHS = Array.from({ length: 10 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}`);

export default function IncomeStatementPage() {
  const { state } = useLedger();
  const today = todayIso();
  const [from, setFrom] = useState(startOfYear(today));
  const [to, setTo] = useState(today);

  const priorTo = addDays(from, -1);
  const priorFrom = addDays(priorTo, -daysBetween(from, to));
  const hasPrior = priorFrom >= "2026-01-01";

  const is = useMemo(() => incomeStatement(state.accounts, state.journals, from, to), [state, from, to]);
  const pr = useMemo(
    () => incomeStatement(state.accounts, state.journals, priorFrom, priorTo),
    [state, priorFrom, priorTo],
  );
  const monthly = useMemo(() => monthlyProfitAndLoss(state.accounts, state.journals, MONTHS), [state]);
  const margin = (n: number, r: number) => (r ? `${((n / r) * 100).toFixed(1)}%` : "—");

  const exportCsv = () => {
    const rows: (string | number)[][] = [["Section", "Code", "Account", `${from} to ${to}`, ...(hasPrior ? [`${priorFrom} to ${priorTo}`] : [])]];
    const add = (s: string, a: typeof is.revenue, b: typeof is.revenue) =>
      withPrior(a, b).forEach((l) => rows.push([s, l.code ?? "", l.label, l.amount, ...(hasPrior ? [l.prior ?? 0] : [])]));
    add("Revenue", is.revenue, pr.revenue);
    add("Cost of sales", is.costOfSales, pr.costOfSales);
    add("Operating expenses", is.operating, pr.operating);
    rows.push(["", "", "Net profit", is.netIncome, ...(hasPrior ? [pr.netIncome] : [])]);
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
        onExport={exportCsv}
        presets={[
          { label: "This month", from: "2026-10-01", to: today },
          { label: "September", from: "2026-09-01", to: endOfMonth("2026-09") },
          { label: "Q3", from: "2026-07-01", to: endOfMonth("2026-09") },
          { label: "Year to date", from: startOfYear(today), to: today },
        ]}
      />

      <Panel title="Monthly trend" className="mx-auto mb-6 max-w-4xl" bodyClassName="pt-2" >
        <ProfitChart data={monthly} height={220} />
      </Panel>

      <ReportSheet
        title="Statement of Profit or Loss"
        period={`${fmtDate(from)} to ${fmtDate(to)}`}
        footnote={
          <>
            Gross margin {margin(is.grossProfit, is.totalRevenue)} · net margin {margin(is.netIncome, is.totalRevenue)}.
            {hasPrior && ` Comparative column covers ${fmtDate(priorFrom)} to ${fmtDate(priorTo)}.`}
          </>
        }
      >
        <StatementHeading current="This period" prior={hasPrior ? "Prior period" : undefined} />
        <StatementSection
          title="Revenue"
          lines={withPrior(is.revenue, pr.revenue, ledgerHref)}
          totalLabel="Total revenue"
          total={is.totalRevenue}
          priorTotal={pr.totalRevenue}
          compare={hasPrior}
        />
        <StatementSection
          title="Cost of sales"
          lines={withPrior(is.costOfSales, pr.costOfSales, ledgerHref)}
          totalLabel="Total cost of sales"
          total={is.totalCostOfSales}
          priorTotal={pr.totalCostOfSales}
          compare={hasPrior}
        />
        <TotalRow label="Gross profit" amount={is.grossProfit} prior={hasPrior ? pr.grossProfit : undefined} className="mb-8" />
        <StatementSection
          title="Operating expenses"
          lines={withPrior(is.operating, pr.operating, ledgerHref)}
          totalLabel="Total operating expenses"
          total={is.totalOperating}
          priorTotal={pr.totalOperating}
          compare={hasPrior}
        />
        <TotalRow label="Net profit" amount={is.netIncome} prior={hasPrior ? pr.netIncome : undefined} strong />
      </ReportSheet>
    </div>
  );
}
