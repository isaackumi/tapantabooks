import Link from "next/link";

export const Mark = ({ className = "h-9 w-9" }: { className?: string }) => (
  <span
    className={`${className} inline-flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 text-white shadow-sm`}
  >
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="M4 19V5m0 14h16M8 15l3-3 3 2 5-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </span>
);

const Brand = ({ collapsed = false }: { collapsed?: boolean }) => (
  <Link href="/dashboard" className="flex items-center gap-x-2.5">
    <Mark />
    {!collapsed && (
      <span className="leading-tight">
        <span className="block text-[11px] font-medium uppercase tracking-wider text-neutral-400">Trovesuite</span>
        <span className="block text-base font-bold text-neutral-900 dark:text-white">Accounting</span>
      </span>
    )}
  </Link>
);

export default Brand;
