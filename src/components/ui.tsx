"use client";

import React from "react";
import Link from "next/link";
import { FiArrowLeft } from "react-icons/fi";
import type { IconType } from "react-icons";
import { classNames, fmtAccounting, fmtCurrency } from "@/utils/format";

// ---------------------------------------------------------------------------
// Page scaffolding
// ---------------------------------------------------------------------------

export const PageHeader = ({
  title,
  description,
  actions,
  backHref,
  backLabel,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
}) => (
  <div className="mb-6">
    {backHref && (
      <Link
        href={backHref}
        data-no-print
        className="mb-4 inline-flex items-center gap-2 text-sm text-neutral-600 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
      >
        <FiArrowLeft className="h-4 w-4" />
        {backLabel ?? "Back"}
      </Link>
    )}
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">{title}</h1>
        {description && <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{description}</p>}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2" data-no-print>
          {actions}
        </div>
      )}
    </div>
  </div>
);

export const Panel = ({
  title,
  subtitle,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) => (
  <section
    className={classNames(
      "rounded-xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800",
      className,
    )}
  >
    {(title || actions) && (
      <div className="flex items-start justify-between gap-3 px-6 pt-5">
        <div>
          {title && <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">{title}</h3>}
          {subtitle && <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">{subtitle}</p>}
        </div>
        {actions}
      </div>
    )}
    <div className={classNames("p-6", (title || actions) && "pt-4", bodyClassName)}>{children}</div>
  </section>
);

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "dark";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 dark:bg-brand-700 dark:hover:bg-brand-600",
  secondary:
    "border border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700",
  danger: "bg-red-600 text-white hover:bg-red-700",
  ghost: "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700",
  dark: "bg-neutral-700 text-white hover:bg-neutral-800 dark:bg-neutral-600 dark:hover:bg-neutral-500",
};

export const Button = ({
  variant = "primary",
  icon: Icon,
  children,
  className,
  size = "md",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  icon?: IconType;
  size?: "sm" | "md";
}) => (
  <button
    type="button"
    {...props}
    className={classNames(
      "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
      size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm",
      VARIANTS[variant],
      className,
    )}
  >
    {Icon && <Icon className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />}
    {children}
  </button>
);

// ---------------------------------------------------------------------------
// Form controls
// ---------------------------------------------------------------------------

export const inputClass =
  "w-full px-3 py-2.5 text-sm bg-neutral-50 dark:bg-neutral-900/20 border border-neutral-200/80 dark:border-neutral-700 rounded-xl text-neutral-900 dark:text-white placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 dark:focus:border-brand-500 transition-all disabled:opacity-60";

export const compactInputClass =
  "w-full px-2.5 py-2 text-sm bg-white dark:bg-neutral-900/30 border border-neutral-200 dark:border-neutral-700 rounded-lg text-neutral-900 dark:text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-all";

export const Field = ({
  label,
  required,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  hint?: React.ReactNode;
  error?: string | null;
  children: React.ReactNode;
  className?: string;
}) => (
  <label className={classNames("block", className)}>
    <span className="mb-1.5 block text-sm font-medium text-neutral-800 dark:text-white">
      {label} {required && <span className="text-red-500">*</span>}
    </span>
    {children}
    {error ? (
      <span className="mt-1 block text-xs text-red-600 dark:text-red-400">{error}</span>
    ) : (
      hint && <span className="mt-1 block text-xs text-neutral-500 dark:text-neutral-400">{hint}</span>
    )}
  </label>
);

export const FormError = ({ message }: { message: string | null }) =>
  message ? (
    <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
      {message}
    </div>
  ) : null;

export const Toggle = ({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) => (
  <div className="flex items-start justify-between gap-4">
    <div>
      <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{label}</p>
      {description && <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">{description}</p>}
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={classNames(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
        checked ? "bg-brand-600" : "bg-neutral-300 dark:bg-neutral-600",
      )}
    >
      <span
        className={classNames(
          "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-5" : "translate-x-0.5",
        )}
      />
    </button>
  </div>
);

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

export const Money = ({
  value,
  accounting = false,
  className,
  muted,
}: {
  value: number;
  accounting?: boolean;
  className?: string;
  muted?: boolean;
}) => (
  <span
    className={classNames(
      "tabular-nums whitespace-nowrap",
      muted ? "text-neutral-500 dark:text-neutral-400" : undefined,
      className,
    )}
  >
    {accounting ? fmtAccounting(value) : fmtCurrency(value)}
  </span>
);

export const DetailRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-start justify-between gap-4 py-2 text-sm">
    <span className="text-neutral-500 dark:text-neutral-400">{label}</span>
    <span className="text-right font-medium text-neutral-900 dark:text-neutral-100">{children}</span>
  </div>
);

export const Callout = ({
  tone = "info",
  icon: Icon,
  title,
  children,
  className,
}: {
  tone?: "info" | "success" | "warning" | "danger";
  icon?: IconType;
  title?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) => {
  const tones = {
    info: "bg-brand-50 border-brand-200 text-brand-800 dark:bg-brand-900/20 dark:border-brand-800 dark:text-brand-300",
    success:
      "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-300",
    warning: "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-300",
    danger: "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300",
  };
  return (
    <div className={classNames("flex items-start gap-3 rounded-xl border p-4", tones[tone], className)}>
      {Icon && <Icon className="mt-0.5 h-5 w-5 shrink-0" />}
      <div className="text-sm">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={classNames(title && "mt-0.5", "opacity-90")}>{children}</div>}
      </div>
    </div>
  );
};

export const SectionTitle = ({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) => (
  <div className="mb-3 mt-8 flex items-center justify-between">
    <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">{children}</h2>
    {actions}
  </div>
);
