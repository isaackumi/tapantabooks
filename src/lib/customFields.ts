import type { CustomField, CustomFieldEntity } from "@/models/accounting";
import { fmtDate, fmtNumber } from "@/utils/format";

export const CUSTOM_FIELD_TYPE_LABEL: Record<CustomField["type"], string> = {
  TEXT: "Short text",
  LONG_TEXT: "Long text",
  NUMBER: "Number",
  DATE: "Date",
  SELECT: "Dropdown",
  BOOLEAN: "Yes / no",
};

export const fieldsFor = (
  fields: CustomField[],
  entity: CustomFieldEntity,
  opts: { includeInactive?: boolean } = {},
) =>
  fields
    .filter((f) => f.entity === entity && (opts.includeInactive || f.is_active))
    .sort((a, b) => a.position - b.position);

export const defaultCustomValues = (fields: CustomField[], entity: CustomFieldEntity) =>
  Object.fromEntries(
    fieldsFor(fields, entity)
      .filter((f) => f.default_value)
      .map((f) => [f.key, f.default_value!]),
  );

/** Checks one value against its field definition; returns an error message or null. */
export const validateCustomValue = (f: CustomField, raw: string | undefined): string | null => {
  const v = (raw ?? "").trim();
  if (!v) return f.required && f.type !== "BOOLEAN" ? `${f.label} is required.` : null;
  switch (f.type) {
    case "NUMBER":
      return Number.isFinite(Number(v)) ? null : `${f.label} must be a number.`;
    case "DATE":
      return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? null : `${f.label} must be a date.`;
    case "SELECT":
      return f.options?.includes(v) ? null : `${f.label} must be one of: ${f.options?.join(", ")}.`;
    case "BOOLEAN":
      return v === "true" || v === "false" ? null : `${f.label} must be yes or no.`;
    default:
      return null;
  }
};

export const validateCustomValues = (
  fields: CustomField[],
  entity: CustomFieldEntity,
  values: Record<string, string> | undefined,
): string | null => {
  for (const f of fieldsFor(fields, entity)) {
    const err = validateCustomValue(f, values?.[f.key]);
    if (err) return err;
  }
  return null;
};

/**
 * Trims values and drops blanks. Values for deactivated fields are kept so that
 * reactivating a field brings its history back.
 */
export const normaliseCustomValues = (
  values: Record<string, string> | undefined,
  previous?: Record<string, string>,
): Record<string, string> => {
  const out: Record<string, string> = { ...(previous ?? {}) };
  for (const [k, v] of Object.entries(values ?? {})) {
    const t = String(v ?? "").trim();
    if (t) out[k] = t;
    else delete out[k];
  }
  return out;
};

export const formatCustomValue = (f: Pick<CustomField, "type">, value: string | undefined) => {
  if (value === undefined || value === "") return "—";
  switch (f.type) {
    case "BOOLEAN":
      return value === "true" ? "Yes" : "No";
    case "DATE":
      return fmtDate(value);
    case "NUMBER":
      return Number.isFinite(Number(value)) ? fmtNumber(Number(value)) : value;
    default:
      return value;
  }
};

interface HasCustom {
  custom_fields?: Record<string, string>;
}

export const recordsForEntity = (
  s: {
    customers: HasCustom[];
    suppliers: HasCustom[];
    invoices: HasCustom[];
    bills: HasCustom[];
    journals: HasCustom[];
    accounts: HasCustom[];
  },
  entity: CustomFieldEntity,
): HasCustom[] => {
  switch (entity) {
    case "Customer":
      return s.customers;
    case "Supplier":
      return s.suppliers;
    case "Invoice":
      return s.invoices;
    case "Bill":
      return s.bills;
    case "Journal":
      return s.journals;
    case "Account":
      return s.accounts;
  }
};

/** How many records hold a value for this field. */
export const customFieldUsage = (s: Parameters<typeof recordsForEntity>[0], f: CustomField) =>
  recordsForEntity(s, f.entity).filter((r) => (r.custom_fields?.[f.key] ?? "") !== "").length;
