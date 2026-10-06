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

export interface ListOptions {
  /** Fields searched by `search`. */
  search?: string[];
  /** Query param → row field for equality filters. */
  filters?: Record<string, string>;
  /** Row field compared with `from_date` / `to_date`. */
  dateField?: string;
  defaultSort?: { field: string; order: "asc" | "desc" };
}

const MAX_SIZE = 500;

/** Filtering, sorting and pagination shared by every `/list` endpoint. */
export const listResult = (rows: readonly unknown[], q: URLSearchParams, opts: ListOptions = {}): HandlerResult => {
  let items = rows as Row[];
  const search = q.get("search")?.trim().toLowerCase();
  if (search && opts.search?.length) {
    items = items.filter((r) => opts.search!.some((f) => String(r[f] ?? "").toLowerCase().includes(search)));
  }
  for (const [param, field] of Object.entries(opts.filters ?? {})) {
    const value = q.get(param);
    if (value !== null && value !== "") items = items.filter((r) => String(getPath(r, field)) === value);
  }
  if (opts.dateField) {
    const from = q.get("from_date");
    const to = q.get("to_date");
    if (from) items = items.filter((r) => String(r[opts.dateField!]) >= from);
    if (to) items = items.filter((r) => String(r[opts.dateField!]) <= to);
  }
  const sortBy = q.get("sort_by") ?? opts.defaultSort?.field;
  if (sortBy) {
    const dir = (q.get("sort_order") ?? opts.defaultSort?.order ?? "asc") === "desc" ? -1 : 1;
    items = [...items].sort((a, b) => {
      const x = a[sortBy];
      const y = b[sortBy];
      if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
      return String(x ?? "").localeCompare(String(y ?? "")) * dir;
    });
  }
  const page = Math.max(1, Number(q.get("page")) || 1);
  const size = Math.min(MAX_SIZE, Math.max(1, Number(q.get("size")) || 20));
  const total = items.length;
  return {
    data: { items: items.slice((page - 1) * size, page * size) },
    pagination: { page, size, total, has_next: page * size < total },
  };
};

const getPath = (row: Row, path: string): unknown =>
  path.split(".").reduce<unknown>((v, k) => (v && typeof v === "object" ? (v as Row)[k] : undefined), row);
