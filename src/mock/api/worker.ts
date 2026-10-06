import { http, HttpResponse } from "msw";
import { setupWorker } from "msw/browser";
import { AppConstants } from "@/core/appConstants";
import { decodeToken, isExpired } from "@/core/session";
import { setBaseCurrency } from "@/utils/format";
import { handleCoreRequest } from "./core";
import { tenantDb } from "./db";
import { ApiFault, envelope } from "./http";
import { resolveHandler } from "./routes";

/** Routes a tenant can call before POST /organisation/setup has been completed. */
const ALLOWED_BEFORE_SETUP = new Set([
  "GET /organisation/get",
  "POST /organisation/setup",
  "GET /users/me",
  "GET /currencies/list",
  "GET /navigation",
]);

const REQUIRED_HEADERS = ["app-id", "org-id", "bus-id", "loc-id"] as const;

const json = (status: number, body: unknown) => HttpResponse.json(body as Record<string, unknown>, { status });

const fault = (status: number, detail: string, error: string | null = null, fieldErrors: Record<string, string> | null = null) =>
  json(status, envelope(status, null, { detail, error, field_errors: fieldErrors }));

const readBody = async (request: Request) => {
  if (request.method === "GET" || request.method === "DELETE") return {};
  const text = await request.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiFault(400, "The request body is not valid JSON.");
  }
};

const latency = () => new Promise((r) => setTimeout(r, 40 + Math.random() * 120));

const accountingHandler = async (request: Request) => {
  await latency();
  const url = new URL(request.url);
  const path = url.pathname.replace(/^.*?\/api\/v1/, "");
  const key = `${request.method} ${path}`;

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const claims = decodeToken(token);
  if (!claims) return fault(401, "Unauthorized access", "UNAUTHORIZED");
  if (isExpired(claims)) return fault(401, "Token expired", "TOKEN_EXPIRED");
  for (const h of REQUIRED_HEADERS) {
    if (!request.headers.get(h)) return fault(400, `Missing required header: ${h}.`, "MISSING_HEADER", { [h]: `${h} is required.` });
  }
  if (request.headers.get("app-id") !== AppConstants.appId) return fault(403, "Invalid app-id for this API.", "INVALID_APP_ID");

  const db = tenantDb(claims.tenant_id);
  if (!db) return fault(403, "TENANT_NOT_FOUND", "TENANT_NOT_FOUND");
  const state = db.ref.current;
  if (!state.users.some((u) => u.id === claims.user_id)) return fault(403, "Unauthorized access", "USER_NOT_IN_TENANT");
  state.currentUserId = claims.user_id;
  setBaseCurrency(state.org.base_currency, state.currencies.find((c) => c.code === state.org.base_currency)?.symbol);

  if (!state.org.setup_completed && !ALLOWED_BEFORE_SETUP.has(key)) {
    return fault(409, "Finish setting up the organisation before using the books.", "ORGANISATION_NOT_SET_UP");
  }

  const handler = resolveHandler(request.method, path);
  if (!handler) return fault(404, `No route for ${key}.`, "NOT_FOUND");

  try {
    const body = await readBody(request);
    const res = handler({ q: url.searchParams, body, state: db.ref.current, engine: db.engine, userId: claims.user_id });
    const status = res.status ?? 200;
    return json(status, envelope(status, res.data, { detail: res.detail, pagination: res.pagination ?? null }));
  } catch (e) {
    if (e instanceof ApiFault) return fault(e.status, e.message, e.status === 404 ? "NOT_FOUND" : "VALIDATION_FAILED", e.fieldErrors);
    console.error("[mock api]", key, e);
    return fault(500, "Something went wrong on the server.", "INTERNAL_ERROR");
  }
};

const coreHandler = async (request: Request) => {
  await latency();
  const path = new URL(request.url).pathname.replace(/^.*?\/api\/v1/, "");
  let body: unknown = {};
  try {
    body = await readBody(request);
  } catch {
    return fault(400, "The request body is not valid JSON.");
  }
  const res = handleCoreRequest(path, body);
  return json(res.status, res.body);
};

let started: Promise<void> | null = null;

/** Starts the service worker that answers /api/v1 and the Core /landingpage routes in the browser. */
export const startMockApi = () => {
  started ??= setupWorker(
    http.all(`${AppConstants.coreApiUrl}/landingpage/*`, ({ request }) => coreHandler(request)),
    http.all(`${AppConstants.baseUrl}/*`, ({ request }) => accountingHandler(request)),
  )
    .start({ onUnhandledRequest: "bypass", quiet: true, serviceWorker: { url: "/mockServiceWorker.js" } })
    .then(() => undefined);
  return started;
};
