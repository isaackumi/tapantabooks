"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { FiEdit2 } from "react-icons/fi";
import type { CustomField, CustomFieldEntity } from "@/models/accounting";
import { DetailRow, Field, FormError, filterInputClass, inputClass } from "@/components/ui";
import { BTN_PRIMARY, BTN_SECONDARY, Modal } from "@/components/modal";
import type { Column } from "@/components/dataTable";
import { useLedger } from "@/store/ledgerStore";
import { fieldsFor, formatCustomValue } from "@/lib/customFields";
import { classNames } from "@/utils/format";

type Values = Record<string, string>;

export const useEntityFields = (entity: CustomFieldEntity, opts: { includeInactive?: boolean } = {}) => {
  const { state } = useLedger();
  return useMemo(
    () => fieldsFor(state.customFields, entity, opts),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.customFields, entity, opts.includeInactive],
  );
};

export const CustomFieldInput = ({ field, value, onChange }: { field: CustomField; value: string; onChange: (v: string) => void }) => {
  switch (field.type) {
    case "LONG_TEXT":
      return <textarea rows={3} value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} />;
    case "NUMBER":
      return <input type="number" step="any" value={value} onChange={(e) => onChange(e.target.value)} className={`${inputClass} tabular-nums`} />;
    case "DATE":
      return <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} />;
    case "SELECT":
      return (
        <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
          <option value="">{field.required ? "Select…" : "—"}</option>
          {field.options?.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      );
    case "BOOLEAN":
      return (
        <div className="flex gap-2">
          {[
            ["true", "Yes"],
            ["false", "No"],
          ].map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => onChange(value === v ? "" : v)}
              className={classNames(
                "flex-1 rounded-xl border px-3 py-2.5 text-sm font-medium transition",
                value === v
                  ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300"
                  : "border-neutral-200 text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-700/40",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      );
    default:
      return <input value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} />;
  }
};

/** Inputs for every active custom field on an entity, in the configured order. */
export const CustomFieldInputs = ({
  entity,
  values,
  onChange,
  title = "Additional details",
  className,
}: {
  entity: CustomFieldEntity;
  values: Values;
  onChange: (values: Values) => void;
  title?: string | null;
  className?: string;
}) => {
  const fields = useEntityFields(entity);
  if (fields.length === 0) return null;
  return (
    <div className={className}>
      {title && <h4 className="mb-3 text-sm font-semibold text-neutral-800 dark:text-neutral-100">{title}</h4>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {fields.map((f) => (
          <Field
            key={f.id}
            label={f.label}
            required={f.required && f.type !== "BOOLEAN"}
            hint={f.description}
            className={f.type === "LONG_TEXT" ? "sm:col-span-2" : undefined}
          >
            <CustomFieldInput field={f} value={values[f.key] ?? ""} onChange={(v) => onChange({ ...values, [f.key]: v })} />
          </Field>
        ))}
      </div>
    </div>
  );
};

/** Read-only list for drawers. Deactivated fields still show if the record holds a value. */
export const CustomFieldDetails = ({
  entity,
  values,
  onEdit,
  title = "Additional details",
}: {
  entity: CustomFieldEntity;
  values: Values | undefined;
  onEdit?: () => void;
  title?: string;
}) => {
  const fields = useEntityFields(entity, { includeInactive: true }).filter((f) => f.is_active || values?.[f.key]);
  if (fields.length === 0) return null;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h4 className="text-sm font-semibold">{title}</h4>
        {onEdit && (
          <button onClick={onEdit} className="flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline dark:text-brand-300">
            <FiEdit2 className="h-3.5 w-3.5" /> Edit
          </button>
        )}
      </div>
      <div className="divide-y divide-neutral-100 dark:divide-neutral-700">
        {fields.map((f) => (
          <DetailRow key={f.id} label={f.is_active ? f.label : `${f.label} (inactive)`}>
            <span className={classNames(f.type === "LONG_TEXT" && "whitespace-pre-line font-normal")}>
              {formatCustomValue(f, values?.[f.key])}
            </span>
          </DetailRow>
        ))}
      </div>
    </div>
  );
};

/** Edits custom values on an existing record; never touches the ledger. */
export const EditCustomFieldsModal = ({
  entity,
  recordId,
  recordLabel,
  values,
  open,
  onClose,
}: {
  entity: CustomFieldEntity;
  recordId: string;
  recordLabel: string;
  values: Values | undefined;
  open: boolean;
  onClose: () => void;
}) => {
  const { actions } = useLedger();
  const [draft, setDraft] = useState<Values>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setDraft(values ?? {});
      setError(null);
    }
  }, [open, values]);
  const save = async () => {
    setBusy(true);
    try {
      const res = await actions.setCustomFieldValues(entity, recordId, draft);
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
      size="xl"
      title={`Additional details · ${recordLabel}`}
      description="These fields are for reporting and traceability. Changing them does not alter any ledger entry."
      buttons={[
        { label: "Cancel", onClick: onClose, className: BTN_SECONDARY },
        { label: "Save details", onClick: save, className: BTN_PRIMARY, disabled: busy },
      ]}
    >
      <FormError message={error} />
      <CustomFieldInputs entity={entity} values={draft} onChange={setDraft} title={null} />
    </Modal>
  );
};

/** DataTable columns for fields marked "show in lists". */
export const customFieldColumns = <T,>(fields: CustomField[], get: (row: T) => Values | undefined): Column<T>[] =>
  fields
    .filter((f) => f.show_in_list)
    .map((f) => ({
      id: `cf_${f.key}`,
      header: f.label,
      accessorFn: (row: T) => get(row)?.[f.key] ?? "",
      align: f.type === "NUMBER" ? ("right" as const) : undefined,
      cell: ({ row }: { row: { original: T } }) => {
        const v = get(row.original)?.[f.key];
        return v ? (
          <span className={classNames(f.type === "NUMBER" && "tabular-nums", "whitespace-nowrap")}>{formatCustomValue(f, v)}</span>
        ) : (
          <span className="text-neutral-300 dark:text-neutral-600">—</span>
        );
      },
    }));

/** Dropdown filters for list-visible dropdown and yes/no fields. */
export const CustomFieldFilters = ({
  fields,
  value,
  onChange,
}: {
  fields: CustomField[];
  value: Values;
  onChange: (v: Values) => void;
}) => {
  const filterable = fields.filter((f) => f.show_in_list && (f.type === "SELECT" || f.type === "BOOLEAN"));
  if (filterable.length === 0) return null;
  return (
    <>
      {filterable.map((f) => (
        <select
          key={f.id}
          value={value[f.key] ?? ""}
          onChange={(e) => onChange({ ...value, [f.key]: e.target.value })}
          className={`${filterInputClass} w-auto min-w-36`}
          aria-label={f.label}
        >
          <option value="">{`${f.label}: any`}</option>
          {(f.type === "BOOLEAN" ? ["true", "false"] : (f.options ?? [])).map((o) => (
            <option key={o} value={o}>
              {f.type === "BOOLEAN" ? `${f.label}: ${o === "true" ? "yes" : "no"}` : o}
            </option>
          ))}
        </select>
      ))}
    </>
  );
};

export const matchesCustomFilters = (values: Values | undefined, filters: Values) =>
  Object.entries(filters).every(([k, v]) => {
    if (!v) return true;
    const actual = values?.[k] ?? "";
    return v === "false" ? actual !== "true" : actual === v;
  });

/** Custom field filters as list query parameters (`cf_<key>`). */
export const customFilterQuery = (filters: Values) =>
  Object.fromEntries(Object.entries(filters).filter(([, v]) => v).map(([k, v]) => [`cf_${k}`, v]));

/** Free text from custom values so the global search finds them. */
export const customSearchText = (values: Values | undefined) => Object.values(values ?? {}).join(" ");

export const customCsvHeaders = (fields: CustomField[]) => fields.map((f) => f.label);
export const customCsvValues = (fields: CustomField[], values: Values | undefined) =>
  fields.map((f) => (values?.[f.key] ? formatCustomValue(f, values[f.key]) : ""));
