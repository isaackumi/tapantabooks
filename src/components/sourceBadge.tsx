import type { SourceType } from "@/models/accounting";

const SOURCE_META: Record<SourceType, { label: string; className: string }> = {
  MANUAL: { label: "Manual", className: "bg-neutral-100 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200" },
  SALES: { label: "Sales", className: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  PURCHASES: { label: "Purchases", className: "bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" },
  BANKING: { label: "Banking", className: "bg-cyan-50 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300" },
  STORE_MANAGEMENT: {
    label: "Store Management",
    className: "bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300",
  },
  LOANS: { label: "LoanDrift", className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
  HR: { label: "ZelosHR", className: "bg-pink-50 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300" },
  IMPORT: { label: "Import", className: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  FX_REVALUATION: { label: "FX revaluation", className: "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300" },
  OPENING_BALANCE: { label: "Opening balance", className: "bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300" },
  YEAR_END: { label: "Year-end close", className: "bg-slate-100 text-slate-700 dark:bg-slate-700/60 dark:text-slate-200" },
  SYSTEM: { label: "System", className: "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200" },
};

export const sourceLabel = (type: SourceType) => SOURCE_META[type].label;

export const SOURCE_TYPES = Object.keys(SOURCE_META) as SourceType[];

const SourceBadge = ({ type, reference }: { type: SourceType; reference?: string }) => {
  const meta = SOURCE_META[type];
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-flex items-center whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ${meta.className}`}>
        {meta.label}
      </span>
      {reference && <span className="font-mono text-xs text-neutral-500 dark:text-neutral-400">{reference}</span>}
    </span>
  );
};

export default SourceBadge;
