import React from "react";
import type { IconType } from "react-icons";

export interface EmptyAction {
  label: string;
  onClick: () => void;
}

const EmptyState = ({
  icon: Icon,
  title,
  description,
  actions = [],
}: {
  icon: IconType;
  title: string;
  description: string;
  actions?: EmptyAction[];
}) => (
  <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-white px-6 py-14 text-center dark:border-neutral-700 dark:bg-neutral-800">
    <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-900/20 dark:text-brand-400">
      <Icon className="h-6 w-6" />
    </div>
    <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{title}</h3>
    <p className="mt-1 max-w-sm text-sm text-neutral-500 dark:text-neutral-400">{description}</p>
    {actions.length > 0 && (
      <div className="mt-5 flex gap-2">
        {actions.map((a) => (
          <button
            key={a.label}
            onClick={a.onClick}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
          >
            {a.label}
          </button>
        ))}
      </div>
    )}
  </div>
);

export default EmptyState;
