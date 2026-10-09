import { AppConstants } from "./appConstants";
import { getSession, redirectToLogin } from "./session";

export interface Pagination {
  page: number;
  size: number;
  total: number;
  has_next: boolean;
}

/** tvs-accounting-bk response envelope (docs/API_RESPONSE_FORMAT.md). */
export interface ApiEnvelope<T> {
  success: boolean;
  status_code: number;
  detail: string | null;
  error: string | null;
  data: T | null;
  field_errors: Record<string, string> | null;
  pagination: Pagination | null;
}

export interface ListData<T> {
  items: T[];
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fieldErrors: Record<string, string> | null = null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type QueryValue = string | number | boolean | null | undefined;
export type Query = Record<string, QueryValue>;

export interface RequestOptions {
  query?: Query;
  body?: unknown;
  signal?: AbortSignal;
}

export const TROVE_HEADERS = ["authorization", "app-id", "org-id", "bus-id", "loc-id"] as const;

export const troveHeaders = (): Record<string, string> => {
  const s = getSession();
  const headers: Record<string, string> = {};
  if (s.token) headers["authorization"] = `Bearer ${s.token}`;
  if (s.app_id) headers["app-id"] = s.app_id;
  if (s.org_id) headers["org-id"] = s.org_id;
  if (s.bus_id) headers["bus-id"] = s.bus_id;
  if (s.loc_id) headers["loc-id"] = s.loc_id;
  return headers;
};

// ---------------------------------------------------------------------------
// Transport hooks (set by the mock backend while there is no real API)
// ---------------------------------------------------------------------------

type Transport = (request: Request) => Promise<Response>;

let ready: Promise<void> = Promise.resolve();
let transport: Transport = (request) => fetch(request);
let onUnauthorized: (() => boolean) | null = null;

/** Resolves once the transport can take requests (the mock service worker has started). */
export const whenApiReady = () => ready;

export const configureApiClient = (opts: {
  ready?: Promise<void>;
  transport?: Transport;
  onUnauthorized?: () => boolean;
}) => {
  if (opts.ready) ready = opts.ready;
  if (opts.transport) transport = opts.transport;
  if (opts.onUnauthorized) onUnauthorized = opts.onUnauthorized;
};

// ---------------------------------------------------------------------------
// Request log (Settings → API shows the last calls and the headers they carried)
// ---------------------------------------------------------------------------

export interface RequestLogEntry {
  id: number;
  method: HttpMethod;
  path: string;
  status: number;
  ms: number;
  at: string;
  headers: Record<string, string>;
  detail: string | null;
}

const LOG_SIZE = 40;
let log: RequestLogEntry[] = [];
let logSeq = 0;
const logListeners = new Set<() => void>();

export const subscribeRequestLog = (listener: () => void) => {
  logListeners.add(listener);
  return () => logListeners.delete(listener);
};
export const requestLog = () => log;

const record = (entry: Omit<RequestLogEntry, "id">) => {
  log = [{ ...entry, id: ++logSeq }, ...log].slice(0, LOG_SIZE);
  logListeners.forEach((l) => l());
};

let inFlight = 0;
const inFlightListeners = new Set<() => void>();
export const subscribeInFlight = (listener: () => void) => {
  inFlightListeners.add(listener);
  return () => inFlightListeners.delete(listener);
};
export const inFlightCount = () => inFlight;
const setInFlight = (delta: number) => {
  inFlight += delta;
  inFlightListeners.forEach((l) => l());
};

// ---------------------------------------------------------------------------

export const buildUrl = (path: string, query?: Query) => {
  const url = new URL(`${AppConstants.baseUrl}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url;
};

const redact = (headers: Record<string, string>) => {
  const copy = { ...headers };
  if (copy.authorization) copy.authorization = `${copy.authorization.slice(0, 20)}…`;
  return copy;
};

const send = async <T>(method: HttpMethod, path: string, opts: RequestOptions): Promise<ApiEnvelope<T>> => {
  const url = buildUrl(path, opts.query);
  const headers: Record<string, string> = { accept: "application/json", ...troveHeaders() };
  const hasBody = opts.body !== undefined && method !== "GET";
  if (hasBody) headers["content-type"] = "application/json";
  const started = performance.now();
  const response = await transport(
    new Request(url, { method, headers, body: hasBody ? JSON.stringify(opts.body) : undefined, signal: opts.signal }),
  );
  let envelope: ApiEnvelope<T>;
  try {
    envelope = (await response.json()) as ApiEnvelope<T>;
  } catch {
    envelope = {
      success: false,
      status_code: response.status,
      detail: response.statusText || "The server returned an unreadable response.",
      error: "INVALID_RESPONSE",
      data: null,
      field_errors: null,
      pagination: null,
    };
  }
  record({
    method,
    path: url.pathname.replace(/^.*\/api\/v1/, "") + url.search,
    status: response.status,
    ms: Math.round(performance.now() - started),
    at: new Date().toISOString(),
    headers: redact(headers),
    detail: envelope.detail,
  });
  return { ...envelope, status_code: envelope.status_code ?? response.status };
};

const fieldErrorText = (fe: Record<string, string> | null) => (fe ? Object.values(fe).join(" ") : "");

/** Sends one request with the Trove headers and returns the envelope; throws `ApiError` on failure. */
export const apiRequest = async <T>(method: HttpMethod, path: string, opts: RequestOptions = {}) => {
  await ready;
  setInFlight(1);
  try {
    let envelope = await send<T>(method, path, opts);
    if (envelope.status_code === 401) {
      if (onUnauthorized?.()) envelope = await send<T>(method, path, opts);
      else redirectToLogin();
    }
    if (!envelope.success) {
      const message = envelope.detail || fieldErrorText(envelope.field_errors) || envelope.error || "Request failed.";
      throw new ApiError(message, envelope.status_code, envelope.field_errors);
    }
    return envelope;
  } finally {
    setInFlight(-1);
  }
};

export const api = {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) => apiRequest<T>("GET", path, { query, signal }),
  post: <T>(path: string, body?: unknown, query?: Query) => apiRequest<T>("POST", path, { body: body ?? {}, query }),
  put: <T>(path: string, body?: unknown, query?: Query) => apiRequest<T>("PUT", path, { body: body ?? {}, query }),
  delete: <T>(path: string, query?: Query) => apiRequest<T>("DELETE", path, { query }),
};

/** Largest page the API serves. */
export const MAX_PAGE_SIZE = 100;

/** Reads every page of a list endpoint. */
export const fetchAll = async <T>(path: string, query: Query = {}, size = MAX_PAGE_SIZE): Promise<T[]> => {
  const items: T[] = [];
  for (let page = 1; ; page++) {
    const res = await api.get<ListData<T>>(path, { ...query, page, size });
    items.push(...(res.data?.items ?? []));
    if (!res.pagination?.has_next) return items;
  }
};
