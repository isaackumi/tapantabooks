import React from "react";
import { FiTrendingUp, FiTrendingDown } from "react-icons/fi";
import InfoTooltip from "@/components/infoTooltip";

export interface StatCardProps {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  /** Colored trend pill. Only pass this when a real direction is known. */
  trend?: "up" | "down";
  /** What the figure means, behind an (i). */
  info?: React.ReactNode;
  tone?: "default" | "danger" | "warning" | "success";
}

const TONE: Record<NonNullable<StatCardProps["tone"]>, string> = {
  default: "text-neutral-900 dark:text-neutral-100",
  danger: "text-red-600 dark:text-red-400",
  warning: "text-amber-600 dark:text-amber-400",
  success: "text-emerald-600 dark:text-emerald-400",
};

/** Shared summary-stat card: label, big bold value, optional sub text and trend pill. */
export const StatCard = ({ label, value, sub, trend, info, tone = "default" }: StatCardProps) => {
  return (
    <div className="rounded-lg bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 p-5">
      <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5">
        {label}
        {info && <InfoTooltip text={info} label={`What ${label} means`} />}
      </p>
      <div className="mt-1 flex items-center gap-2">
        <span className={`text-2xl font-bold tabular-nums ${TONE[tone]}`}>{value}</span>
        {trend && (
          <span
            className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold ${
              trend === "up"
                ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400"
                : "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400"
            }`}
          >
            {trend === "up" ? <FiTrendingUp className="w-3.5 h-3.5" /> : <FiTrendingDown className="w-3.5 h-3.5" />}
          </span>
        )}
      </div>
      {sub && <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{sub}</p>}
    </div>
  );
};

export default StatCard;
