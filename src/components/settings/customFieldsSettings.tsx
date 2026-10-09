"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { FiArrowDown, FiArrowUp, FiEdit2, FiInfo, FiPlus, FiTrash2 } from "react-icons/fi";
import { Button, Callout, Field, FormError, Panel, Toggle, inputClass } from "@/components/ui";
import StatusBadge from "@/components/statusBadge";
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, Modal } from "@/components/modal";
import { CustomFieldInput } from "@/components/customFields";
import { useLedger } from "@/store/ledgerStore";
import {
  CUSTOM_FIELD_ENTITIES,
  type CustomField,
  type CustomFieldEntity,
  type CustomFieldType,
} from "@/models/accounting";
import { CUSTOM_FIELD_TYPE_LABEL, fieldsFor, formatCustomValue } from "@/lib/customFields";
import type { CustomFieldUsage } from "@/models/reports";
import type { ListData } from "@/core/apiClient";
import { useReport } from "@/services/useApiQuery";
import { classNames } from "@/utils/format";
import { usePending } from "@/services/usePending";

const ENTITY_HINT: Record<CustomFieldEntity, string> = {
  Customer: "Shown on the customer form, the customer list and statements.",
  Supplier: "Shown on the supplier form and the supplier list.",
  Invoice: "Captured when raising a sales invoice; editable after approval.",
  Bill: "Captured when entering a supplier bill; editable after approval.",
  Journal: "Captured on manual journals and kept on posted entries.",
  Account: "Kept on each ledger account in the chart of accounts.",
};

const TYPES: CustomFieldType[] = ["TEXT", "LONG_TEXT", "NUMBER", "DATE", "SELECT", "BOOLEAN"];

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^(\d)/, "f_$1");

interface FormState {
  entity: CustomFieldEntity;
  label: string;
  key: string;
  type: CustomFieldType;
  scope: CustomField["scope"];
  options: string;
  description: string;
  default_value: string;
  required: boolean;
  show_in_list: boolean;
}

const blank = (entity: CustomFieldEntity): FormState => ({
  entity,
  label: "",
  key: "",
  type: "TEXT",
  scope: "FINANCIAL",
  options: "",
  description: "",
  default_value: "",
  required: false,
  show_in_list: false,
});

/** Records holding a value, per custom field id; empty until loaded. */
const useCustomFieldUsage = () => {
  const { data } = useReport<ListData<CustomFieldUsage>>("/custom-fields/usage", {});
  return useMemo(() => new Map((data?.items ?? []).map((u) => [u.custom_field_id, u.record_count])), [data]);
};

const CustomFieldModal = ({
  open,
  field,
  entity,
  onClose,
}: {
  open: boolean;
  field: CustomField | null;
  entity: CustomFieldEntity;
  onClose: () => void;
}) => {
  const { actions } = useLedger();
  const [form, setForm] = useState<FormState>(blank(entity));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const usage = useCustomFieldUsage();
  const used = field ? (usage.get(field.id) ?? 0) : 0;

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(
      field
        ? {
            entity: field.entity,
            label: field.label,
            key: field.key,
            type: field.type,
            scope: field.scope,
            options: field.options?.join(", ") ?? "",
            description: field.description ?? "",
            default_value: field.default_value ?? "",
            required: field.required,
            show_in_list: field.show_in_list,
          }
        : blank(entity),
    );
  }, [open, field, entity]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const options = form.options
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  const preview: CustomField = {
    id: "preview",
    entity: form.entity,
    key: form.key || "preview",
    label: form.label || "Field label",
    type: form.type,
    scope: form.scope,
    options: form.type === "SELECT" ? options : undefined,
    required: form.required,
    description: form.description || undefined,
    default_value: form.default_value || undefined,
    is_active: true,
    position: 0,
    show_in_list: form.show_in_list,
    created_at: "",
    updated_at: "",
    created_by_id: null,
    updated_by_id: null,
    created_by: null,
    updated_by: null,
  };
  const [sample, setSample] = useState("");
  useEffect(() => setSample(form.default_value), [form.default_value, form.type]);

  const submit = async () => {
    const payload = {
      label: form.label,
      type: form.type,
      scope: form.scope,
      options: form.type === "SELECT" ? options : undefined,
      description: form.description,
      default_value: form.default_value,
      required: form.required,
      show_in_list: form.show_in_list,
    };
    setBusy(true);
    try {
      const res = await (field
        ? actions.updateCustomField(field.id, payload)
        : actions.addCustomField({ ...payload, entity: form.entity, key: form.key }));
      if (!res.ok) return setError(res.error);
      toast.success(res.message ?? "Saved");
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="3xl"
      title={field ? `Edit ${field.label}` : "New custom field"}
      description="Capture information the standard model does not hold. Custom fields never change how an entry posts."
      buttons={[
        { label: "Cancel", onClick: onClose, className: BTN_SECONDARY },
        { label: field ? "Save field" : "Add field", onClick: submit, className: BTN_PRIMARY, disabled: busy },
      ]}
    >
      <FormError message={error} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-3">
          <Field label="Applies to" required hint={field ? "Fixed once created" : undefined}>
            <select
              value={form.entity}
              disabled={!!field}
              onChange={(e) => set("entity", e.target.value as CustomFieldEntity)}
              className={inputClass}
            >
              {CUSTOM_FIELD_ENTITIES.map((e) => (
                <option key={e}>{e}</option>
              ))}
            </select>
          </Field>
          <Field
            label="Type"
            required
            hint={used > 0 && field ? `Locked: ${used} record(s) hold a value` : undefined}
          >
            <select
              value={form.type}
              disabled={used > 0}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as CustomFieldType, default_value: "" }))}
              className={inputClass}
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {CUSTOM_FIELD_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Label" required>
            <input
              value={form.label}
              onChange={(e) => {
                const label = e.target.value;
                setForm((f) => ({
                  ...f,
                  label,
                  key: field ? f.key : f.key && f.key !== slug(f.label) ? f.key : slug(label),
                }));
              }}
              placeholder="e.g. Delivery route"
              className={inputClass}
            />
          </Field>
          <Field label="Key" required hint={field ? "Fixed once created" : "lower_snake_case; mappings use custom.<key>"}>
            <input
              value={form.key}
              disabled={!!field}
              onChange={(e) => set("key", e.target.value)}
              className={`${inputClass} font-mono`}
            />
          </Field>
          {form.type === "SELECT" && (
            <Field
              label="Options"
              required
              className="sm:col-span-2"
              hint="Comma separated. Options used on records cannot be removed."
            >
              <input
                value={form.options}
                onChange={(e) => set("options", e.target.value)}
                placeholder="North, South, East"
                className={inputClass}
              />
            </Field>
          )}
          <Field label="Help text" className="sm:col-span-2" hint="Shown under the field on forms">
            <input
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="e.g. Route the goods leave on, from the dispatch note"
              className={inputClass}
            />
          </Field>
          <Field label="Default value" className="sm:col-span-2" hint="Pre-filled on new records">
            <CustomFieldInput
              field={{ ...preview, required: false }}
              value={form.default_value}
              onChange={(v) => set("default_value", v)}
            />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:col-span-2 sm:grid-cols-2">
            {(
              [
                { id: "FINANCIAL", title: "Financial", body: "Used to filter and report, like a dimension." },
                {
                  id: "SOURCE_REFERENCE",
                  title: "Source reference",
                  body: "Keeps the source system's identifiers for traceability.",
                },
              ] as const
            ).map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => set("scope", o.id)}
                className={classNames(
                  "rounded-xl border p-3 text-left",
                  form.scope === o.id
                    ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500 dark:bg-brand-900/20"
                    : "border-neutral-200 dark:border-neutral-700",
                )}
              >
                <p className="text-sm font-semibold">{o.title}</p>
                <p className="mt-0.5 text-xs text-neutral-600 dark:text-neutral-300">{o.body}</p>
              </button>
            ))}
          </div>
          <div className="space-y-4 sm:col-span-2">
            <Toggle
              checked={form.required}
              onChange={(v) => set("required", v)}
              label="Required"
              description={
                form.type === "BOOLEAN"
                  ? "Yes/no fields are never blocking; a blank counts as no."
                  : "New and edited records cannot be saved without it. Existing records are not changed."
              }
            />
            <Toggle
              checked={form.show_in_list}
              onChange={(v) => set("show_in_list", v)}
              label="Show in lists"
              description="Adds a column to the list page. Dropdown and yes/no fields also get a filter."
            />
          </div>
        </div>

        <div className="lg:col-span-2">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Preview</p>
          <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50/60 p-4 dark:border-neutral-600 dark:bg-neutral-900/30">
            <Field label={preview.label} required={preview.required && preview.type !== "BOOLEAN"} hint={preview.description}>
              <CustomFieldInput field={preview} value={sample} onChange={setSample} />
            </Field>
            <div className="mt-4 border-t border-neutral-200 pt-3 text-sm dark:border-neutral-700">
              <p className="text-xs text-neutral-500">On the record it reads</p>
              <p className="mt-1 font-medium">{formatCustomValue(preview, sample)}</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">{ENTITY_HINT[form.entity]}</p>
        </div>
      </div>
    </Modal>
  );
};

export const CustomFieldsSettings = () => {
  const { state, actions } = useLedger();
  const [entity, setEntity] = useState<CustomFieldEntity>("Customer");
  const [editing, setEditing] = useState<CustomField | null>(null);
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<CustomField | null>(null);

  const fields = fieldsFor(state.customFields, entity, { includeInactive: true });
  const usage = useCustomFieldUsage();
  const mappedKeys = new Set(state.fieldMappings.map((m) => m.target_field));
  const { pending, track } = usePending();

  const run = (res: { ok: boolean; message?: string; error?: string }) =>
    res.ok ? res.message && toast.success(res.message) : toast.error(res.error ?? "Something went wrong");

  return (
    <div className="space-y-6">
      <Callout tone="info" icon={FiInfo} tour="cf-intro">
        <strong>Financial</strong> fields can be used to filter and report. <strong>Source reference</strong> fields keep the
        original system&apos;s identifiers so any record can be traced back. Neither kind changes how an entry posts, so values
        can still be corrected on approved documents and posted journals.
      </Callout>

      <div className="flex flex-wrap gap-2" data-tour="cf-entities">
        {CUSTOM_FIELD_ENTITIES.map((e) => {
          const count = state.customFields.filter((f) => f.entity === e && f.is_active).length;
          return (
            <button
              key={e}
              onClick={() => setEntity(e)}
              className={classNames(
                "flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium transition",
                entity === e
                  ? "border-brand-600 bg-brand-600 text-white"
                  : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200",
              )}
            >
              {e === "Bill" ? "Bills" : `${e}s`}
              <span
                className={classNames(
                  "rounded-full px-1.5 text-xs",
                  entity === e ? "bg-white/20" : "bg-neutral-100 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-300",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <Panel
        tour="cf-table"
        title={`${entity} fields`}
        subtitle={ENTITY_HINT[entity]}
        actions={
          <Button
            size="sm"
            icon={FiPlus}
            data-tour="cf-new"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            New field
          </Button>
        }
        bodyClassName="px-0 pb-2"
      >
        {fields.length === 0 ? (
          <p className="px-6 py-6 text-sm text-neutral-500">No custom fields on {entity.toLowerCase()}s yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-neutral-500 dark:text-neutral-400">
                <tr>
                  <th className="w-16 px-4 py-2 font-normal">Order</th>
                  <th className="px-4 py-2 font-normal">Field</th>
                  <th className="px-4 py-2 font-normal">Type</th>
                  <th className="px-4 py-2 font-normal">Scope</th>
                  <th className="px-4 py-2 font-normal">Rules</th>
                  <th className="px-4 py-2 text-right font-normal">Used on</th>
                  <th className="px-4 py-2 font-normal">Status</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700">
                {fields.map((f, i) => {
                  const used = usage.get(f.id) ?? 0;
                  const mapped = mappedKeys.has(`custom.${f.key}`);
                  return (
                    <tr key={f.id} className={classNames(!f.is_active && "opacity-60")}>
                      <td className="px-4 py-3">
                        <div className="flex gap-0.5">
                          <button
                            disabled={i === 0 || pending("move")}
                            onClick={() => track("move", async () => run(await actions.moveCustomField(f.id, -1)))}
                            className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-30 dark:hover:bg-neutral-700"
                            aria-label={`Move ${f.label} up`}
                          >
                            <FiArrowUp className="h-4 w-4" />
                          </button>
                          <button
                            disabled={i === fields.length - 1 || pending("move")}
                            onClick={() => track("move", async () => run(await actions.moveCustomField(f.id, 1)))}
                            className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-30 dark:hover:bg-neutral-700"
                            aria-label={`Move ${f.label} down`}
                          >
                            <FiArrowDown className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{f.label}</p>
                        <p className="font-mono text-xs text-neutral-500">custom.{f.key}</p>
                        {f.description && <p className="mt-0.5 max-w-xs text-xs text-neutral-500">{f.description}</p>}
                      </td>
                      <td className="px-4 py-3">
                        {CUSTOM_FIELD_TYPE_LABEL[f.type]}
                        {f.options && <p className="max-w-[14rem] text-xs text-neutral-500">{f.options.join(", ")}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={classNames(
                            "whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium",
                            f.scope === "FINANCIAL"
                              ? "bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300"
                              : "bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300",
                          )}
                        >
                          {f.scope === "FINANCIAL" ? "Financial" : "Source reference"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-neutral-600 dark:text-neutral-300">
                        <div className="flex flex-wrap gap-1">
                          {f.required && <StatusBadge status="WARNING" label="Required" />}
                          {f.show_in_list && <StatusBadge status="INFO" label="In lists" />}
                          {mapped && <StatusBadge status="NEUTRAL" label="Mapped" />}
                          {f.default_value && (
                            <span className="whitespace-nowrap">Default: {formatCustomValue(f, f.default_value)}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{used}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={f.is_active ? "ACTIVE" : "INACTIVE"} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => {
                              setEditing(f);
                              setOpen(true);
                            }}
                            className="rounded p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-700"
                            aria-label={`Edit ${f.label}`}
                          >
                            <FiEdit2 className="h-4 w-4" />
                          </button>
                          <button
                            disabled={pending(f.id)}
                            onClick={() => track(f.id, async () => run(await actions.updateCustomField(f.id, { is_active: !f.is_active })))}
                            className="whitespace-nowrap rounded px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-40 dark:text-brand-300 dark:hover:bg-brand-900/20"
                          >
                            {f.is_active ? "Deactivate" : "Activate"}
                          </button>
                          <button
                            onClick={() => setDeleting(f)}
                            disabled={used > 0 || mapped}
                            title={
                              used > 0
                                ? "Holds values; deactivate instead"
                                : mapped
                                  ? "Target of a field mapping"
                                  : "Delete"
                            }
                            className="rounded p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-neutral-400"
                            aria-label={`Delete ${f.label}`}
                          >
                            <FiTrash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <CustomFieldModal open={open} field={editing} entity={entity} onClose={() => setOpen(false)} />
      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        size="md"
        title={`Delete ${deleting?.label}?`}
        description="No record holds a value for this field, so it can be removed completely. This cannot be undone."
        buttons={[
          { label: "Cancel", onClick: () => setDeleting(null), className: BTN_SECONDARY },
          {
            label: "Delete field",
            className: BTN_DANGER,
            onClick: async () => {
              if (deleting) run(await actions.deleteCustomField(deleting.id));
              setDeleting(null);
            },
          },
        ]}
      />
    </div>
  );
};
