"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { IconType } from "react-icons";
import {
  FiArrowRight,
  FiBarChart2,
  FiBookOpen,
  FiClock,
  FiDroplet,
  FiFileText,
  FiLayers,
  FiPercent,
  FiTrendingUp,
  FiList,
} from "react-icons/fi";
import { PageHeader } from "@/components/ui";
import { useLedger } from "@/store/ledgerStore";
import { balanceSheet, cashFlow, incomeStatement, trialBalance } from "@/lib/ledger";
import { billRows, invoiceRows } from "@/store/selectors";
import { fmtCurrency } from "@/utils/format";
import { startOfYear, todayIso } from "@/utils/dates";

interface ReportCard {
  href: string;
  title: string;
  description: string;
  icon: IconType;
  figure?: string;
  figureLabel?: string;
}

export default function ReportsPage() {
  const { state } = useLedger();
  const today = todayIso();

  const groups = useMemo(() => {
    const bs = balanceSheet(state.accounts, state.journals, today);
    const is = incomeStatement(state.accounts, state.journals, startOfYear(today), today);
    const cf = cashFlow(state.accounts, state.journals, startOfYear(today), today);
    const tb = trialBalance(state.accounts, state.journals, today);
    const ar = invoiceRows(state).reduce((s, r) => s + r.outstanding, 0);
    const ap = billRows(state).reduce((s, r) => s + r.outstanding, 0);
    return [
      {
        title: "Financial statements",
        cards: [
          { href: "/reports/balance-sheet", title: "Balance sheet", description: "Assets, liabilities and equity at a date, with a comparative column.", icon: FiLayers, figure: fmtCurrency(bs.totalAssets), figureLabel: "Total assets" },
          { href: "/reports/income-statement", title: "Income statement", description: "Revenue, cost of sales and expenses for any period, against the prior period.", icon: FiTrendingUp, figure: fmtCurrency(is.netIncome), figureLabel: "Net profit YTD" },
          { href: "/reports/cash-flow", title: "Cash flow", description: "Operating, investing and financing cash movements.", icon: FiDroplet, figure: fmtCurrency(cf.netChange), figureLabel: "Net change YTD" },
        ] as ReportCard[],
      },
      {
        title: "Receivables & payables",
        cards: [
          { href: "/reports/ar-ageing", title: "Receivables ageing", description: "What customers owe, by days past due.", icon: FiClock, figure: fmtCurrency(ar), figureLabel: "Outstanding" },
          { href: "/reports/ap-ageing", title: "Payables ageing", description: "What you owe suppliers, by days past due.", icon: FiClock, figure: fmtCurrency(ap), figureLabel: "Outstanding" },
          { href: "/reports/statements", title: "Statements", description: "Printable statement of account for any customer or supplier, with ageing.", icon: FiFileText },
        ] as ReportCard[],
      },
      {
        title: "Ledger & tax",
        cards: [
          { href: "/accounting/trial-balance", title: "Trial balance", description: "Debit and credit balance of every account.", icon: FiBarChart2, figure: fmtCurrency(tb.totals.debit), figureLabel: "Each side" },
          { href: "/accounting/general-ledger", title: "General ledger", description: "Line-by-line movements on any account with a running balance.", icon: FiBookOpen },
          { href: "/tax", title: "VAT & levies", description: "Output and input tax by month, and return status.", icon: FiPercent },
          { href: "/audit-trail", title: "Audit trail", description: "Who changed what, and when, across the ledger.", icon: FiList },
        ] as ReportCard[],
      },
    ];
  }, [state, today]);

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Every report is calculated live from posted journals, so it always agrees with the ledger and with every other report."
      />
      {groups.map((g) => (
        <section key={g.title} className="mb-8" data-tour="report-group">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">{g.title}</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {g.cards.map((c) => (
              <Link
                key={c.href}
                href={c.href}
                className="group flex flex-col rounded-xl border border-neutral-200 bg-white p-5 transition hover:border-brand-300 hover:shadow-sm dark:border-neutral-700 dark:bg-neutral-800 dark:hover:border-brand-700"
              >
                <div className="flex items-start justify-between">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300">
                    <c.icon className="h-5 w-5" />
                  </span>
                  <FiArrowRight className="h-4 w-4 text-neutral-300 transition group-hover:translate-x-0.5 group-hover:text-brand-600" />
                </div>
                <p className="mt-4 font-semibold">{c.title}</p>
                <p className="mt-1 flex-1 text-sm text-neutral-500 dark:text-neutral-400">{c.description}</p>
                {c.figure && (
                  <p className="mt-4 border-t border-neutral-100 pt-3 text-sm dark:border-neutral-700">
                    <span className="text-neutral-500 dark:text-neutral-400">{c.figureLabel}: </span>
                    <span className="font-semibold tabular-nums">{c.figure}</span>
                  </p>
                )}
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
