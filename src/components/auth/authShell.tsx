"use client";

import { useState } from "react";
import { FiCheck, FiEye, FiEyeOff, FiInfo } from "react-icons/fi";
import { Mark } from "@/components/brand";
import { AppConstants } from "@/core/appConstants";
import { inputClass } from "@/components/ui";

const POINTS = [
  "Double-entry books with approvals and locked periods",
  "Invoices, bills and bank reconciliation in one place",
  "Multi-currency with month-end revaluation",
];

/** Two-column frame for the sign-in, sign-up and onboarding screens. */
export const AuthShell = ({ title, subtitle, children, wide = false }: { title: string; subtitle?: React.ReactNode; children: React.ReactNode; wide?: boolean }) => (
  <div className="flex min-h-screen bg-neutral-100 dark:bg-neutral-900">
    <aside className="relative hidden w-[42%] max-w-xl flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-700 via-brand-800 to-neutral-900 p-10 text-white lg:flex">
      <div className="flex items-center gap-3">
        <Mark className="h-10 w-10 bg-white/15 from-transparent to-transparent" />
        <span className="leading-tight">
          <span className="block text-[11px] font-medium uppercase tracking-wider text-white/60">Trovesuite</span>
          <span className="block text-lg font-bold">Accounting</span>
        </span>
      </div>
      <div>
        <p className="text-3xl font-semibold leading-snug">Books your auditor will trust, without the spreadsheet chase.</p>
        <ul className="mt-8 space-y-3 text-sm text-white/80">
          {POINTS.map((p) => (
            <li key={p} className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/15">
                <FiCheck className="h-3 w-3" />
              </span>
              {p}
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-white/50">© {new Date().getFullYear()} Deladetech · Trovesuite</p>
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/5" aria-hidden />
      <div className="pointer-events-none absolute -bottom-32 right-10 h-96 w-96 rounded-full bg-white/5" aria-hidden />
    </aside>
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className={wide ? "w-full max-w-2xl" : "w-full max-w-md"}>
        <div className="mb-6 flex items-center gap-3 lg:hidden">
          <Mark />
          <span className="text-base font-bold text-neutral-900 dark:text-white">Trovesuite Accounting</span>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8 dark:border-neutral-700 dark:bg-neutral-800">
          <h1 className="text-xl font-bold text-neutral-900 dark:text-white">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </main>
  </div>
);

export const PasswordInput = ({
  value,
  onChange,
  autoComplete,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  placeholder?: string;
}) => {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input
        type={shown ? "text" : "password"}
        className={`${inputClass} pr-10`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required
      />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
        aria-label={shown ? "Hide password" : "Show password"}
      >
        {shown ? <FiEyeOff className="h-4 w-4" /> : <FiEye className="h-4 w-4" />}
      </button>
    </div>
  );
};

export const OtpInput = ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
  <input
    className={`${inputClass} text-center font-mono text-lg tracking-[0.5em]`}
    inputMode="numeric"
    autoComplete="one-time-code"
    maxLength={6}
    value={value}
    onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
    placeholder="••••••"
    required
  />
);

/** Mock mode only: the codes and passwords the in-browser backend accepts. */
export const MockHint = ({ children }: { children: React.ReactNode }) =>
  AppConstants.useMockApi ? (
    <p className="mt-4 flex items-start gap-2 rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-500 dark:bg-neutral-900/40 dark:text-neutral-400">
      <FiInfo className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  ) : null;

export const passwordProblem = (password: string, confirm?: string) => {
  if (password.length < 8) return "Use at least 8 characters.";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Use letters and at least one number.";
  if (confirm !== undefined && password !== confirm) return "The passwords do not match.";
  return null;
};
