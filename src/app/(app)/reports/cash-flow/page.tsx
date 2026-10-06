"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/ui";
import { ReportSheet, ReportToolbar, StatementSection, TotalRow } from "@/components/reports/reportKit";
import { useLedger } from "@/store/ledgerStore";
import { cashFlow } from "@/lib/ledger";
import { downloadCsv } from "@/utils/csv";
import { fmtDate } from "@/utils/format";
import { endOfMonth, startOfYear, todayIso } from "@/utils/dates";

export default function CashFlowPage() {
  const { state } = useLedger();
  const today = todayIso();
  const [from, setFrom] = useState(startOfYear(today));
  const [to, setTo] = useState(today);
  const cf = useMemo(() => cashFlow(state.accounts, state.journals, from, to), [state, from, to]);

  const exportCsv = () =>
    downloadCsv(`cash-flow-${from}-to-${to}.csv`, [
      ["Section", "Line", "Amount"],
      ...cf.operating.map((l) => ["Operating", l.label, l.amount]),
      ...cf.investing.map((l) => ["Investing", l.label, l.amount]),
      ...cf.financing.map((l) => ["Financing", l.label, l.amount]),
      ["", "Net change in cash", cf.netChange],
      ["", "Opening cash", cf.opening],
      ["", "Closing cash", cf.closing],
    ]);

  return (
    <div>
      <PageHeader
        title="Cash flow statement"
        description="Where cash came from and where it went, by operating, investing and financing activity (direct method)."
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
          { label: "Q3", from: "2026-07-01", to: endOfMonth("2026-09") },
          { label: "Year to date", from: startOfYear(today), to: today },
        ]}
      />
      <ReportSheet
        title="Statement of Cash Flows"
        period={`${fmtDate(from)} to ${fmtDate(to)}`}
        footnote="Cash covers every bank, mobile money and cash account. Transfers between them are excluded. Each entry is classified by the main non-cash account it touches."
      >
        <StatementSection
          title="Operating activities"
          lines={cf.operating}
          totalLabel="Net cash from operating activities"
          total={cf.totalOperating}
        />
        <StatementSection
          title="Investing activities"
          lines={cf.investing}
          totalLabel="Net cash from investing activities"
          total={cf.totalInvesting}
        />
        <StatementSection
          title="Financing activities"
          lines={cf.financing}
          totalLabel="Net cash from financing activities"
          total={cf.totalFinancing}
        />
        <TotalRow label="Net change in cash" amount={cf.netChange} className="mt-4" />
        <TotalRow label={`Cash at ${fmtDate(from)}`} amount={cf.opening} />
        <TotalRow label={`Cash at ${fmtDate(to)}`} amount={cf.closing} strong />
      </ReportSheet>
    </div>
  );
}
