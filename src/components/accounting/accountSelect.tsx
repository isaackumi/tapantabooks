"use client";

import { useMemo } from "react";
import { useLedger } from "@/store/ledgerStore";
import { ACCOUNT_TYPE_LABEL, ACCOUNT_TYPE_ORDER } from "@/lib/ledger";
import type { AccountType } from "@/models/accounting";

interface AccountSelectProps {
  value: string;
  onChange: (id: string) => void;
  className: string;
  includeControl?: boolean;
  types?: AccountType[];
  placeholder?: string;
  id?: string;
  ariaLabel?: string;
  /** Restrict to accounts matching a predicate (e.g. bank accounts only). */
  filter?: (a: { is_bank: boolean; subtype: string }) => boolean;
}

/** Native select grouped by account type; only postable (non-group, active) accounts. */
const AccountSelect = ({
  value,
  onChange,
  className,
  includeControl = false,
  types,
  placeholder = "Select account",
  id,
  ariaLabel,
  filter,
}: AccountSelectProps) => {
  const { state } = useLedger();
  const groups = useMemo(() => {
    const postable = state.accounts
      .filter((a) => !a.is_group && a.is_active && (includeControl || !a.is_control))
      .filter((a) => !types || types.includes(a.type))
      .filter((a) => !filter || filter(a))
      .sort((a, b) => a.code.localeCompare(b.code));
    return ACCOUNT_TYPE_ORDER.map((t) => ({ type: t, accounts: postable.filter((a) => a.type === t) })).filter(
      (g) => g.accounts.length > 0,
    );
  }, [state.accounts, includeControl, types, filter]);

  return (
    <select id={id} aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)} className={className}>
      <option value="">{placeholder}</option>
      {groups.map((g) => (
        <optgroup key={g.type} label={ACCOUNT_TYPE_LABEL[g.type]}>
          {g.accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.code} · {a.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
};

export default AccountSelect;
