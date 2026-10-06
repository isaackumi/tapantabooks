import React from "react";
import { humanize } from "@/utils/format";

const GREEN = "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
const AMBER = "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
const RED = "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
const BLUE = "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
const PURPLE = "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400";
const NEUTRAL = "bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300";
const ORANGE = "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
const TEAL = "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400";

const STATUS_COLORS: Record<string, string> = {
  // journals
  DRAFT: NEUTRAL,
  PENDING_APPROVAL: AMBER,
  POSTED: GREEN,
  REVERSED: PURPLE,
  // documents
  OPEN: BLUE,
  PARTIALLY_PAID: TEAL,
  PAID: GREEN,
  OVERDUE: ORANGE,
  VOID: RED,
  // periods
  LOCKED: AMBER,
  CLOSED: NEUTRAL,
  // parties / generic
  ACTIVE: GREEN,
  INACTIVE: NEUTRAL,
  // integrations
  CONNECTED: GREEN,
  WARNING: AMBER,
  ERROR: RED,
  NOT_CONNECTED: NEUTRAL,
  SUCCESS: GREEN,
  PARTIAL: AMBER,
  FAILED: RED,
  NEEDS_REVIEW: AMBER,
  PARTIALLY_POSTED: TEAL,
  VALID: GREEN,
  // reconciliation
  MATCHED: GREEN,
  SUGGESTED: BLUE,
  UNMATCHED: ORANGE,
};

const LABELS: Record<string, string> = {
  PENDING_APPROVAL: "Awaiting approval",
  PARTIALLY_PAID: "Part paid",
  NOT_CONNECTED: "Not connected",
  NEEDS_REVIEW: "Needs review",
  PARTIALLY_POSTED: "Part posted",
};

export const StatusBadge = ({ status, label }: { status: string; label?: string }) => {
  const colors = STATUS_COLORS[status] ?? NEUTRAL;
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap px-2.5 py-0.5 rounded-full text-xs font-medium ${colors}`}
    >
      {label ?? LABELS[status] ?? humanize(status)}
    </span>
  );
};

export default StatusBadge;
