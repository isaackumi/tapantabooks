"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui";
import { QueryState, Skeleton } from "@/components/queryState";
import { ReportSheet, ReportToolbar, StatementSection, TotalRow, useReportPresets } from "@/components/reports/reportKit";
import { useReport } from "@/services/useApiQuery";
import type { CashFlowReport } from "@/models/reports";
import { downloadCsv } from "@/utils/csv";
import { fmtDate } from "@/utils/format";
import { startOfYear, todayIso } from "@/utils/dates";

export default function CashFlowPage() {
  const today = todayIso();
  const presets = useReportPresets();
  const [from, setFrom] = useState(startOfYear(today));
  const [to, setTo] = useState(today);
  const query = useReport<CashFlowReport>("/reports/cash-flow", { from_date: from, to_date: to });

  const exportCsv = () => {
    const cf = query.data;
    if (!cf) return;
    downloadCsv(`cash-flow-${from}-to-${to}.csv`, [
      ["Section", "Line", "Amount"],
      ...cf.operating.map((l) => ["Operating", l.label, l.amount]),
      ...cf.investing.map((l) => ["Investing", l.label, l.amount]),
      ...cf.financing.map((l) => ["Financing", l.label, l.amount]),
      ["", "Net change in cash", cf.net_change],
      ["", "Opening cash", cf.opening],
      ["", "Closing cash", cf.closing],
    ]);
  };

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
        onExport={query.data ? exportCsv : undefined}
        presets={presets.period}
      />
      <QueryState query={query} className="mx-auto max-w-4xl" skeleton={<Skeleton rows={12} />}>
        {(cf) => (
          <ReportSheet
            title="Statement of Cash Flows"
            period={`${fmtDate(from)} to ${fmtDate(to)}`}
            footnote="Cash covers every bank, mobile money and cash account. Transfers between them are excluded. Each entry is classified by the main non-cash account it touches."
          >
            <StatementSection
              title="Operating activities"
              lines={cf.operating}
              totalLabel="Net cash from operating activities"
              total={cf.total_operating}
            />
            <StatementSection
              title="Investing activities"
              lines={cf.investing}
              totalLabel="Net cash from investing activities"
              total={cf.total_investing}
            />
            <StatementSection
              title="Financing activities"
              lines={cf.financing}
              totalLabel="Net cash from financing activities"
              total={cf.total_financing}
            />
            <TotalRow label="Net change in cash" amount={cf.net_change} className="mt-4" />
            <TotalRow label={`Cash at ${fmtDate(from)}`} amount={cf.opening} />
            <TotalRow label={`Cash at ${fmtDate(to)}`} amount={cf.closing} strong />
          </ReportSheet>
        )}
      </QueryState>
    </div>
  );
}
