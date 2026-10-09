import type { ApiEnvelope, Pagination } from "@/core/apiClient";
import type { Result } from "./engine";

export class ApiFault extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fieldErrors: Record<string, string> | null = null,
  ) {
    super(message);
  }
}

export interface HandlerResult {
  data: unknown;
  detail?: string;
  status?: number;
  pagination?: Pagination | null;
}

export const envelope = <T>(
  status: number,
  data: T | null,
  extra: Partial<Pick<ApiEnvelope<T>, "detail" | "error" | "field_errors" | "pagination">> = {},
): ApiEnvelope<T> => ({
  success: status < 400,
  status_code: status,
  detail: extra.detail ?? (status < 400 ? "Success" : "Request failed."),
  error: extra.error ?? null,
  data,
  field_errors: extra.field_errors ?? null,
  pagination: extra.pagination ?? null,
});

/** Engine result → handler result; business-rule failures become 400s with the engine's message. */
export const fromResult = <T>(res: Result<T>, status = 200): HandlerResult => {
  if (!res.ok) throw new ApiFault(400, res.error);
  return { data: res.data ?? null, detail: res.message, status };
};

export const need = (value: string | null, name: string): string => {
  if (!value) throw new ApiFault(400, `Query parameter '${name}' is required.`, { [name]: `${name} is required.` });
  return value;
};

export const found = <T>(row: T | undefined, label: string): T => {
  if (!row) throw new ApiFault(404, `${label} not found.`);
  return row;
};

type Row = Record<string, unknown>;

export interface ListOptions<R = Row> {
  /** Fields searched by `search` (dot paths allowed; `custom_fields` searches every custom value). */
  search?: string[];
  /** Query param → row field for equality filters. */
  filters?: Record<string, string>;
  /** Row field whose date part is compared with `from_date` / `to_date`. */
  dateField?: string;
  /** Applied when `sort_by` is absent; `then` breaks ties. */
  defaultSort?: { field: string; order: "asc" | "desc"; then?: string };
  /** Extra keys returned beside `items`, computed over every matching row (not just the page). */
  summarise?: (matching: R[]) => Record<string, unknown>;
}

/** Same ceiling as the API's PagedQuery. */
export const MAX_PAGE_SIZE = 100;
const CUSTOM_FIELD_PARAM = "cf_";

/** `cf_<key>` addresses a custom field value in filters and `sort_by`. */
const fieldPath = (field: string) => (field.startsWith(CUSTOM_FIELD_PARAM) ? `custom_fields.${field.slice(CUSTOM_FIELD_PARAM.length)}` : field);

const searchable = (r: Row, field: string) => {
  const v = getPath(r, field);
  return v && typeof v === "object" ? Object.values(v).join(" ") : String(v ?? "");
};

const compare = (x: unknown, y: unknown) =>
  typeof x === "number" && typeof y === "number" ? x - y : String(x ?? "").localeCompare(String(y ?? ""));

/** Filtering, sorting and pagination shared by every `/list` endpoint. */
export const listResult = <R>(rows: readonly R[], q: URLSearchParams, opts: ListOptions<R> = {}): HandlerResult => {
  let items = rows as unknown as Row[];
  const search = q.get("search")?.trim().toLowerCase();
  if (search && opts.search?.length) {
    items = items.filter((r) => opts.search!.some((f) => searchable(r, f).toLowerCase().includes(search)));
  }
  for (const [param, field] of Object.entries(opts.filters ?? {})) {
    const value = q.get(param);
    if (value !== null && value !== "") items = items.filter((r) => String(getPath(r, field)) === value);
  }
  // Custom fields: "false" also matches records where the yes/no field was never set.
  for (const [param, value] of q.entries()) {
    if (!param.startsWith(CUSTOM_FIELD_PARAM) || value === "") continue;
    const path = fieldPath(param);
    items = items.filter((r) => {
      const actual = String(getPath(r, path) ?? "");
      return value === "false" ? actual !== "true" : actual === value;
    });
  }
  if (opts.dateField) {
    const from = q.get("from_date");
    const to = q.get("to_date");
    const day = (r: Row) => String(r[opts.dateField!] ?? "").slice(0, 10);
    if (from) items = items.filter((r) => day(r) >= from);
    if (to) items = items.filter((r) => day(r) <= to);
  }
  const requested = q.get("sort_by");
  const sortBy = requested ? fieldPath(requested) : opts.defaultSort?.field;
  if (sortBy) {
    const dir = (q.get("sort_order") ?? (requested ? "asc" : opts.defaultSort?.order) ?? "asc") === "desc" ? -1 : 1;
    const tie = opts.defaultSort?.then;
    items = [...items].sort(
      (a, b) => (compare(getPath(a, sortBy), getPath(b, sortBy)) || (tie ? compare(getPath(a, tie), getPath(b, tie)) : 0)) * dir,
    );
  }
  const page = Math.max(1, Number(q.get("page")) || 1);
  const size = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(q.get("size")) || 20));
  const total = items.length;
  return {
    data: { items: items.slice((page - 1) * size, page * size), ...opts.summarise?.(items as unknown as R[]) },
    pagination: { page, size, total, has_next: page * size < total },
  };
};

const getPath = (row: Row, path: string): unknown =>
  path.split(".").reduce<unknown>((v, k) => (v && typeof v === "object" ? (v as Row)[k] : undefined), row);
