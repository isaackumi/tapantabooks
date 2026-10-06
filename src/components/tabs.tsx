"use client";

import React from "react";

export interface TabOption {
  id: string;
  label: string;
  count?: number;
}

interface TabsProps {
  tabs: TabOption[];
  value: string;
  onChange: (id: string) => void;
  /** Rendered to the right of the tab strip (filters, primary action). */
  actions?: React.ReactNode;
}

/** Segmented tab strip in the loandrift style; the page renders the active panel. */
export const Tabs = ({ tabs, value, onChange, actions }: TabsProps) => (
  <div className="flex flex-wrap items-center justify-between gap-3">
    <div className="w-full sm:w-fit overflow-x-auto rounded-lg bg-neutral-100 p-1 transition dark:bg-neutral-700">
      <nav className="flex min-w-max gap-x-1" role="tablist">
        {tabs.map((tab) => {
          const selected = tab.id === value;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onChange(tab.id)}
              className={`inline-flex items-center gap-x-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium outline-none transition-colors ${
                selected
                  ? "bg-white text-neutral-800 shadow-sm dark:bg-neutral-800 dark:text-neutral-100"
                  : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-white"
              }`}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                    selected
                      ? "bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300"
                      : "bg-neutral-200 text-neutral-600 dark:bg-neutral-600 dark:text-neutral-300"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
);

export default Tabs;
