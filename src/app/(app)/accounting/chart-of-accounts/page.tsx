"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { FiBookOpen, FiDownload, FiEdit2, FiLock, FiPlus, FiSlash, FiCheckCircle } from "react-icons/fi";
import { Button, Field, FormError, PageHeader, Toggle, inputClass } from "@/components/ui";
import { Tabs } from "@/components/tabs";
import { BTN_PRIMARY, BTN_SECONDARY, Modal } from "@/components/modal";
import ActionsDropdown from "@/components/actionsDropdown";
import { useLedger } from "@/store/ledgerStore";
import { ACCOUNT_TYPE_LABEL, ACCOUNT_TYPE_ORDER, balancesByAccount } from "@/lib/ledger";
import type { Account, AccountType } from "@/models/accounting";
import { matchesSearch, useGlobalState } from "@/utils/globalStateContext";
import { fmtAccounting, humanize } from "@/utils/format";
import { todayIso } from "@/utils/dates";
import { downloadCsv } from "@/utils/csv";
import { CustomFieldInputs, customCsvHeaders, customCsvValues, customSearchText, useEntityFields } from "@/components/customFields";
import { defaultCustomValues, formatCustomValue } from "@/lib/customFields";

const SUBTYPES: Record<AccountType, string[]> = {
  ASSET: ["CASH", "RECEIVABLE", "LOAN_BOOK", "INVENTORY", "PREPAYMENT", "TAX_RECOVERABLE", "FIXED_ASSET"],
  LIABILITY: ["PAYABLE", "TAX_PAYABLE", "PAYROLL", "ACCRUAL", "LONG_TERM"],
  EQUITY: ["CAPITAL", "RETAINED_EARNINGS", "OPENING_BALANCE"],
  REVENUE: ["OPERATING_REVENUE", "OTHER_INCOME"],
  EXPENSE: ["COST_OF_SALES", "OPERATING_EXPENSE"],
};

const NewAccountModal = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const { state, actions } = useLedger();
  const groups = state.accounts.filter((a) => a.is_group);
  const [form, setForm] = useState({ code: "", name: "", parent_id: "", subtype: "", description: "", is_bank: false });
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const parent = groups.find((g) => g.id === form.parent_id);

  useEffect(() => {
    if (open) {
      setForm({ code: "", name: "", parent_id: "", subtype: "", description: "", is_bank: false });
      setCustom(defaultCustomValues(state.customFields, "Account"));
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const suggestCode = (parentId: string) => {
    const p = groups.find((g) => g.id === parentId);
    if (!p) return "";
    const used = state.accounts.filter((a) => a.parent_id === p.id).map((a) => Number(a.code));
    const next = (used.length ? Math.max(...used) : Number(p.code)) + 10;
    return String(next);
  };

  const submit = async () => {
    setBusy(true);
    try {
      const res = await actions.createAccount({ ...form, subtype: form.subtype || SUBTYPES[parent?.type ?? "ASSET"][0], custom_fields: custom });
      if (!res.ok) return setError(res.error);
      toast.success(res.message ?? "Account added");
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="New account"
      description="Accounts post under a group. The group decides the account type and where it appears in reports."
      buttons={[
        { label: "Cancel", onClick: onClose, className: BTN_SECONDARY },
        { label: "Add account", onClick: submit, className: BTN_PRIMARY, disabled: busy },
      ]}
    >
      <FormError message={error} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Group" required className="sm:col-span-2">
          <select
            value={form.parent_id}
            onChange={(e) => {
              const p = groups.find((g) => g.id === e.target.value);
              setForm((f) => ({
                ...f,
                parent_id: e.target.value,
                code: f.code || suggestCode(e.target.value),
                subtype: p ? (p.code === "5000" ? "COST_OF_SALES" : SUBTYPES[p.type][0]) : "",
              }));
            }}
            className={inputClass}
          >
            <option value="">Select group</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.code} · {g.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Code" required hint="Four digits, unique">
          <input
            value={form.code}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
            className={`${inputClass} font-mono`}
            maxLength={4}
          />
        </Field>
        <Field label="Report category" required>
          <select
            value={form.subtype}
            onChange={(e) => setForm((f) => ({ ...f, subtype: e.target.value }))}
            className={inputClass}
            disabled={!parent}
          >
            {(parent ? SUBTYPES[parent.type] : []).map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Name" required className="sm:col-span-2">
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Fuel & Generator"
            className={inputClass}
          />
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <textarea
            rows={2}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className={inputClass}
          />
        </Field>
        {parent?.type === "ASSET" && (
          <div className="sm:col-span-2">
            <Toggle
              checked={form.is_bank}
              onChange={(v) => setForm((f) => ({ ...f, is_bank: v, subtype: v ? "CASH" : f.subtype }))}
              label="Bank or cash account"
              description="Appears in banking, receipts and payments, and counts towards cash on the cash flow statement."
            />
          </div>
        )}
        <CustomFieldInputs entity="Account" values={custom} onChange={setCustom} className="sm:col-span-2 border-t border-neutral-200 pt-4 dark:border-neutral-700" />
      </div>
    </Modal>
  );
};

const EditAccountModal = ({ account, onClose }: { account: Account | null; onClose: () => void }) => {
  const { actions } = useLedger();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (account) {
      setName(account.name);
      setDescription(account.description ?? "");
      setCustom(account.custom_fields ?? {});
      setError(null);
    }
  }, [account]);

  const submit = async () => {
    if (!account) return;
    setBusy(true);
    try {
      const res = await actions.updateAccount(account.id, { name, description, custom_fields: custom });
      if (!res.ok) return setError(res.error);
      toast.success(res.message ?? "Saved");
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!account}
      onClose={onClose}
      size="lg"
      title={account ? `Edit ${account.code}` : ""}
      description="The code and type are fixed once an account exists, so history keeps its meaning."
      buttons={[
        { label: "Cancel", onClick: onClose, className: BTN_SECONDARY },
        { label: "Save", onClick: submit, className: BTN_PRIMARY, disabled: busy },
      ]}
    >
      <FormError message={error} />
      <div className="space-y-4">
        <Field label="Name" required>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Description">
          <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} />
        </Field>
        <CustomFieldInputs entity="Account" values={custom} onChange={setCustom} className="border-t border-neutral-200 pt-4 dark:border-neutral-700" />
      </div>
    </Modal>
  );
};

export default function ChartOfAccountsPage() {
  const { state, actions } = useLedger();
  const router = useRouter();
  const { searchQuery } = useGlobalState();
  const [tab, setTab] = useState<"ALL" | AccountType>("ALL");
  const [showInactive, setShowInactive] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const fields = useEntityFields("Account");
  const listFields = fields.filter((f) => f.show_in_list);

  const balances = useMemo(() => balancesByAccount(state.accounts, state.journals, { to: todayIso() }), [state]);
  const postedTo = useMemo(() => {
    const s = new Set<string>();
    state.journals.forEach((j) => j.lines.forEach((l) => s.add(l.account_id)));
    return s;
  }, [state.journals]);

  const visible = state.accounts
    .filter((a) => tab === "ALL" || a.type === tab)
    .filter((a) => showInactive || a.is_active)
    .filter((a) => a.is_group || matchesSearch(searchQuery, a.code, a.name, a.subtype, a.description, customSearchText(a.custom_fields)))
    .sort((a, b) => a.code.localeCompare(b.code));

  const counts = Object.fromEntries(
    ACCOUNT_TYPE_ORDER.map((t) => [t, state.accounts.filter((a) => a.type === t && !a.is_group).length]),
  );

  const toggleActive = async (a: Account) => {
    if (a.is_active && Math.abs(balances.get(a.id) ?? 0) > 0.005) {
      toast.error(`${a.name} has a balance. Move it to another account before deactivating.`);
      return;
    }
    const res = await actions.updateAccount(a.id, { is_active: !a.is_active });
    if (res.ok) toast.success(a.is_active ? `${a.name} deactivated` : `${a.name} reactivated`);
    else toast.error(res.error);
  };

  return (
    <div>
      <PageHeader
        title="Chart of accounts"
        description="The structure every posting, report and integration rule maps onto. Balances are live from posted journals."
        actions={
          <>
            <Button
              variant="secondary"
              icon={FiDownload}
              onClick={() =>
                downloadCsv(`chart-of-accounts-${todayIso()}.csv`, [
                  ["Code", "Name", "Type", "Report category", "Group", "Active", "Balance (GHS)", ...customCsvHeaders(fields)],
                  ...visible
                    .filter((a) => !a.is_group)
                    .map((a) => [
                      a.code,
                      a.name,
                      a.type,
                      humanize(a.subtype),
                      state.accounts.find((g) => g.id === a.parent_id)?.name,
                      a.is_active ? "Yes" : "No",
                      balances.get(a.id) ?? 0,
                      ...customCsvValues(fields, a.custom_fields),
                    ]),
                ])
              }
            >
              Export
            </Button>
            <Button icon={FiPlus} onClick={() => setNewOpen(true)}>
              New account
            </Button>
          </>
        }
      />

      <Tabs
        tabs={[
          { id: "ALL", label: "All", count: state.accounts.filter((a) => !a.is_group).length },
          ...ACCOUNT_TYPE_ORDER.map((t) => ({ id: t, label: ACCOUNT_TYPE_LABEL[t], count: counts[t] })),
        ]}
        value={tab}
        onChange={(v) => setTab(v as typeof tab)}
        actions={
          <label className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-300">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded border-neutral-300 text-brand-600 focus:ring-brand-500"
            />
            Show inactive
          </label>
        }
      />

      <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800">
        <table className="min-w-full text-sm">
          <thead className="bg-neutral-50/60 text-left text-neutral-500 dark:bg-neutral-800 dark:text-neutral-300">
            <tr>
              <th className="px-6 py-3 font-normal w-24">Code</th>
              <th className="px-6 py-3 font-normal">Account</th>
              <th className="px-6 py-3 font-normal">Report category</th>
              {listFields.map((f) => (
                <th key={f.id} className="px-6 py-3 font-normal">
                  {f.label}
                </th>
              ))}
              <th className="px-6 py-3 font-normal text-right">Balance</th>
              <th className="px-6 py-3 w-16" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
            {visible.map((a) =>
              a.is_group ? (
                <tr key={a.id} className="bg-neutral-50/80 dark:bg-neutral-900/30">
                  <td className="px-6 py-2.5 font-mono font-semibold">{a.code}</td>
                  <td className="px-6 py-2.5 font-semibold" colSpan={2 + listFields.length}>
                    {a.name}
                  </td>
                  <td className="px-6 py-2.5 text-right font-semibold tabular-nums">
                    {fmtAccounting(balances.get(a.id) ?? 0)}
                  </td>
                  <td />
                </tr>
              ) : (
                <tr key={a.id} className={a.is_active ? "" : "opacity-60"}>
                  <td className="px-6 py-3 pl-10 font-mono text-neutral-600 dark:text-neutral-300">{a.code}</td>
                  <td className="px-6 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/accounting/general-ledger?account=${a.id}`}
                        className="font-medium text-neutral-900 hover:text-brand-700 dark:text-neutral-100 dark:hover:text-brand-300"
                      >
                        {a.name}
                      </Link>
                      {a.is_control && (
                        <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                          <FiLock className="h-3 w-3" /> Control
                        </span>
                      )}
                      {a.is_bank && (
                        <span className="rounded bg-cyan-50 px-1.5 py-0.5 text-[11px] font-medium text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300">
                          Bank / cash
                        </span>
                      )}
                      {!a.is_active && (
                        <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] font-medium text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300">
                          Inactive
                        </span>
                      )}
                    </div>
                    {a.description && (
                      <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{a.description}</p>
                    )}
                  </td>
                  <td className="px-6 py-3 text-neutral-600 dark:text-neutral-300">{humanize(a.subtype)}</td>
                  {listFields.map((f) => (
                    <td key={f.id} className="px-6 py-3 font-mono text-xs text-neutral-500 dark:text-neutral-400">
                      {a.custom_fields?.[f.key] ? formatCustomValue(f, a.custom_fields[f.key]) : "—"}
                    </td>
                  ))}
                  <td className="px-6 py-3 text-right tabular-nums">{fmtAccounting(balances.get(a.id) ?? 0)}</td>
                  <td className="px-4 py-3 text-right">
                    <ActionsDropdown
                      actions={[
                        {
                          label: "View ledger",
                          icon: <FiBookOpen />,
                          onClick: () => router.push(`/accounting/general-ledger?account=${a.id}`),
                        },
                        { label: "Edit", icon: <FiEdit2 />, onClick: () => setEditing(a) },
                        {
                          label: a.is_active ? "Deactivate" : "Reactivate",
                          icon: a.is_active ? <FiSlash /> : <FiCheckCircle />,
                          onClick: () => toggleActive(a),
                          hidden: a.is_control,
                          className: a.is_active ? "text-red-600 dark:text-red-400" : undefined,
                        },
                      ]}
                    />
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
        Balances are shown in each account&apos;s normal direction; bracketed figures run against it (for example,
        accumulated depreciation). {postedTo.size} accounts have postings.
      </p>

      <NewAccountModal open={newOpen} onClose={() => setNewOpen(false)} />
      <EditAccountModal account={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
