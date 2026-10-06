"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { FiCheck, FiMinus, FiPlus } from "react-icons/fi";
import { Button, Field, FormError, PageHeader, Panel, Toggle, inputClass } from "@/components/ui";
import { Tabs } from "@/components/tabs";
import StatusBadge from "@/components/statusBadge";
import { BTN_PRIMARY, BTN_SECONDARY, Modal } from "@/components/modal";
import { ALL_USERS, useCurrentUser, useLedger } from "@/store/ledgerStore";
import type { Dimension, OrgSettings } from "@/models/accounting";
import { useQueryParam } from "@/utils/useQueryParam";
import { CurrencySettings } from "@/components/settings/currencySettings";
import { CustomFieldsSettings } from "@/components/settings/customFieldsSettings";
import { classNames, fmtCurrency } from "@/utils/format";

const DIMENSION_KINDS: { id: Dimension["kind"]; label: string; hint: string }[] = [
  { id: "LEGAL_ENTITY", label: "Legal entities", hint: "Separate companies that keep their own books." },
  { id: "BRANCH", label: "Branches", hint: "Physical locations. Store and loan postings are tagged by branch." },
  { id: "DEPARTMENT", label: "Departments", hint: "Teams that own costs, used in payroll and expense analysis." },
  { id: "COST_CENTRE", label: "Cost centres", hint: "Finer cost tracking on any journal line." },
  { id: "PROJECT", label: "Projects", hint: "Time-bound initiatives you want to report on separately." },
];

const PERMISSIONS = [
  "View reports",
  "Create journals",
  "Approve journals",
  "Post invoices & bills",
  "Reconcile bank",
  "Lock & close periods",
  "Manage integrations",
  "Change settings",
];

const ROLE_MATRIX: Record<string, boolean[]> = {
  "Finance Manager": [true, true, true, true, true, true, true, true],
  Accountant: [true, true, false, true, true, false, false, false],
  "Accounts Clerk": [true, true, false, true, false, false, false, false],
  Auditor: [true, false, false, false, false, false, false, false],
};

const OrganisationTab = () => {
  const { state, actions } = useLedger();
  const [form, setForm] = useState<OrgSettings>(state.org);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setForm(state.org), [state.org]);

  const set = <K extends keyof OrgSettings>(k: K, v: OrgSettings[K]) => setForm((f) => ({ ...f, [k]: v }));
  const dirty = JSON.stringify(form) !== JSON.stringify(state.org);

  const save = () => {
    const res = actions.updateOrg(form);
    if (!res.ok) return setError(res.error);
    setError(null);
    toast.success(res.message ?? "Saved");
  };

  return (
    <div className="space-y-6">
      <FormError message={error} />
      <Panel title="Organisation" subtitle="Shown on statements, invoices and exports">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Trading name" required>
            <input value={form.name} onChange={(e) => set("name", e.target.value)} className={inputClass} />
          </Field>
          <Field label="Legal name">
            <input value={form.legal_name} onChange={(e) => set("legal_name", e.target.value)} className={inputClass} />
          </Field>
          <Field label="TIN">
            <input value={form.tin} onChange={(e) => set("tin", e.target.value)} className={`${inputClass} font-mono`} />
          </Field>
          <Field label="Base currency" hint="Fixed once transactions exist. Foreign currencies are under the Currencies tab.">
            <input value={form.base_currency} disabled className={`${inputClass} opacity-70`} />
          </Field>
          <Field label="Email">
            <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className={inputClass} />
          </Field>
          <Field label="Phone">
            <input value={form.phone} onChange={(e) => set("phone", e.target.value)} className={inputClass} />
          </Field>
          <Field label="Address" className="sm:col-span-2">
            <input value={form.address} onChange={(e) => set("address", e.target.value)} className={inputClass} />
          </Field>
          <Field label="Fiscal year starts" hint="Fixed once a period is closed">
            <input value={form.fiscal_year_start} disabled className={`${inputClass} opacity-70`} />
          </Field>
        </div>
      </Panel>

      <Panel title="Controls" subtitle="Rules the ledger enforces on every posting">
        <div className="space-y-4">
          <Toggle
            checked={form.require_approval_for_manual_journals}
            onChange={(v) => set("require_approval_for_manual_journals", v)}
            label="Require approval for large manual journals"
            description="The preparer cannot approve their own entry."
          />
          <div className={classNames("pl-14", !form.require_approval_for_manual_journals && "opacity-50")}>
            <Field label="Approval threshold (GH₵)" hint={`Manual journals at or above ${fmtCurrency(form.approval_threshold)} need a second person.`}>
              <input
                type="number"
                min={0}
                step="1000"
                value={form.approval_threshold}
                disabled={!form.require_approval_for_manual_journals}
                onChange={(e) => set("approval_threshold", Number(e.target.value))}
                className={`${inputClass} max-w-xs tabular-nums`}
              />
            </Field>
          </div>
          <Toggle
            checked={form.block_posting_to_locked_periods}
            onChange={(v) => set("block_posting_to_locked_periods", v)}
            label="Block posting to locked periods"
            description="Closed periods are always blocked. Turn this off to let finance managers post late adjustments into locked periods."
          />
        </div>
      </Panel>

      <Panel title="Numbering" subtitle="Prefixes for new documents. Existing numbers never change.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Invoices">
            <input value={form.invoice_prefix} onChange={(e) => set("invoice_prefix", e.target.value)} className={`${inputClass} font-mono`} />
          </Field>
          <Field label="Bills">
            <input value={form.bill_prefix} onChange={(e) => set("bill_prefix", e.target.value)} className={`${inputClass} font-mono`} />
          </Field>
          <Field label="Journals">
            <input value={form.journal_prefix} onChange={(e) => set("journal_prefix", e.target.value)} className={`${inputClass} font-mono`} />
          </Field>
        </div>
      </Panel>

      <div className="sticky bottom-0 -mx-1 flex justify-end gap-3 border-t border-neutral-200 bg-neutral-100/90 px-1 py-3 backdrop-blur dark:border-neutral-700 dark:bg-neutral-900/90">
        <Button variant="secondary" disabled={!dirty} onClick={() => setForm(state.org)}>
          Discard
        </Button>
        <Button disabled={!dirty} onClick={save}>
          Save changes
        </Button>
      </div>
    </div>
  );
};

const DimensionModal = ({ kind, onClose }: { kind: Dimension["kind"] | null; onClose: () => void }) => {
  const { actions } = useLedger();
  const [form, setForm] = useState({ code: "", name: "", description: "" });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (kind) {
      setForm({ code: "", name: "", description: "" });
      setError(null);
    }
  }, [kind]);
  const label = DIMENSION_KINDS.find((k) => k.id === kind)?.label.replace(/s$/, "").replace(/ie$/, "y") ?? "";

  const submit = () => {
    if (!kind) return;
    const res = actions.saveDimension({ kind, ...form });
    if (!res.ok) return setError(res.error);
    toast.success(res.message ?? "Added");
    onClose();
  };

  return (
    <Modal
      open={!!kind}
      onClose={onClose}
      title={`New ${label.toLowerCase()}`}
      buttons={[
        { label: "Cancel", onClick: onClose, className: BTN_SECONDARY },
        { label: "Add", onClick: submit, className: BTN_PRIMARY },
      ]}
    >
      <FormError message={error} />
      <div className="grid grid-cols-3 gap-4">
        <Field label="Code" required>
          <input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} className={`${inputClass} font-mono uppercase`} />
        </Field>
        <Field label="Name" required className="col-span-2">
          <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={inputClass} />
        </Field>
        <Field label="Description" className="col-span-3">
          <input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className={inputClass} />
        </Field>
      </div>
    </Modal>
  );
};

const DimensionsTab = () => {
  const { state, actions } = useLedger();
  const [adding, setAdding] = useState<Dimension["kind"] | null>(null);
  return (
    <div className="space-y-6">
      {DIMENSION_KINDS.map((k) => {
        const items = state.dimensions.filter((d) => d.kind === k.id);
        return (
          <Panel
            key={k.id}
            title={k.label}
            subtitle={k.hint}
            actions={
              <Button variant="secondary" size="sm" icon={FiPlus} onClick={() => setAdding(k.id)}>
                Add
              </Button>
            }
            bodyClassName="px-0 pb-2"
          >
            {items.length === 0 ? (
              <p className="px-6 py-3 text-sm text-neutral-500">None yet.</p>
            ) : (
              <table className="min-w-full text-sm">
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700">
                  {items.map((d) => (
                    <tr key={d.id} className={classNames(!d.is_active && "opacity-60")}>
                      <td className="w-28 px-6 py-2.5 font-mono text-xs">{d.code}</td>
                      <td className="px-6 py-2.5">
                        <p className="font-medium">{d.name}</p>
                        {d.description && <p className="text-xs text-neutral-500">{d.description}</p>}
                      </td>
                      <td className="px-6 py-2.5">
                        <StatusBadge status={d.is_active ? "ACTIVE" : "INACTIVE"} />
                      </td>
                      <td className="px-6 py-2.5 text-right">
                        <button
                          onClick={() => {
                            const res = actions.toggleDimension(d.id);
                            if (res.ok) toast.success(res.message ?? "Updated");
                            else toast.error(res.error);
                          }}
                          className="text-sm text-brand-700 hover:underline dark:text-brand-300"
                        >
                          {d.is_active ? "Deactivate" : "Activate"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        );
      })}
      <DimensionModal kind={adding} onClose={() => setAdding(null)} />
    </div>
  );
};

const UsersTab = () => {
  const { actions } = useLedger();
  const current = useCurrentUser();
  return (
    <div className="space-y-6">
      <Panel title="Team" subtitle="Users come from Trovesuite platform accounts. Switch user here to try maker-checker approval." bodyClassName="px-0 pb-2">
        <table className="min-w-full text-sm">
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700">
            {ALL_USERS.map((u) => (
              <tr key={u.id}>
                <td className="px-6 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
                      {u.name
                        .split(" ")
                        .map((p) => p[0])
                        .join("")}
                    </span>
                    <div>
                      <p className="font-medium">{u.name}</p>
                      <p className="text-xs text-neutral-500">{u.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-3">{u.role}</td>
                <td className="px-6 py-3 text-right">
                  {u.id === current.id ? (
                    <span className="text-xs font-medium text-green-700 dark:text-green-400">Signed in</span>
                  ) : (
                    <button
                      onClick={() => {
                        actions.switchUser(u.id);
                        toast.success(`Now acting as ${u.name}`);
                      }}
                      className="text-sm text-brand-700 hover:underline dark:text-brand-300"
                    >
                      Act as
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel title="Roles" subtitle="What each role may do in accounting" bodyClassName="overflow-x-auto px-0 pb-2">
        <table className="min-w-full text-sm">
          <thead className="text-left text-neutral-500">
            <tr>
              <th className="px-6 py-2 font-normal">Permission</th>
              {Object.keys(ROLE_MATRIX).map((r) => (
                <th key={r} className="px-4 py-2 text-center font-normal">
                  {r}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700">
            {PERMISSIONS.map((p, i) => (
              <tr key={p}>
                <td className="px-6 py-2.5">{p}</td>
                {Object.entries(ROLE_MATRIX).map(([r, perms]) => (
                  <td key={r} className="px-4 py-2.5 text-center">
                    {perms[i] ? <FiCheck className="inline h-4 w-4 text-green-600" /> : <FiMinus className="inline h-4 w-4 text-neutral-300" />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
};

export default function SettingsPage() {
  const { state } = useLedger();
  const [tab, setTab] = useState("ORG");
  useQueryParam("tab", (v) => setTab(v.toUpperCase()));

  return (
    <div>
      <PageHeader title="Settings" description="Organisation details, ledger controls, currencies, custom fields, reporting dimensions and team access." />
      <Tabs
        tabs={[
          { id: "ORG", label: "Organisation & controls" },
          { id: "CURRENCIES", label: "Currencies", count: state.currencies.filter((c) => c.is_active).length },
          { id: "FIELDS", label: "Custom fields", count: state.customFields.filter((f) => f.is_active).length },
          { id: "DIMENSIONS", label: "Dimensions", count: state.dimensions.length },
          { id: "USERS", label: "Users & roles", count: ALL_USERS.length },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div className="mt-6">
        {tab === "ORG" && <OrganisationTab />}
        {tab === "CURRENCIES" && <CurrencySettings />}
        {tab === "FIELDS" && <CustomFieldsSettings />}
        {tab === "DIMENSIONS" && <DimensionsTab />}
        {tab === "USERS" && <UsersTab />}
      </div>
    </div>
  );
}
