import { http, HttpResponse } from "msw";
import { setupWorker } from "msw/browser";
import { AppConstants } from "@/core/appConstants";
import { decodeToken, isExpired, mockContextFor } from "@/core/session";
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

const REQUIRED_HEADERS = ["app-id", "authorization", "bus-id", "loc-id", "org-id"] as const;

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

  // Same order, status codes and messages as TroveRequestHeadersMiddleware on tvs-accounting-bk.
  const header = (name: string) => request.headers.get(name)?.trim() ?? "";
  for (const h of REQUIRED_HEADERS) {
    if (!header(h)) {
      return fault(400, "Validation failed.", "MISSING_HEADER", {
        [h]: `Required header '${h}' is missing. Include it on every /api/v1/* request.`,
      });
    }
  }
  if (header("app-id").toLowerCase() !== AppConstants.appId.toLowerCase()) {
    return fault(400, "Validation failed.", "INVALID_APP_ID", { "app-id": `Header 'app-id' must be '${AppConstants.appId}'.` });
  }
  const token = /^Bearer\s+(.+)$/i.exec(header("authorization"))?.[1];
  if (!token) return fault(401, "Validation failed.", "UNAUTHORIZED", { authorization: "Header 'authorization' must be a Bearer JWT." });
  const claims = decodeToken(token);
  if (!claims?.tenant_id) {
    return fault(401, "Validation failed.", "UNAUTHORIZED", {
      authorization: "JWT must include a tenant_id claim for platform context validation.",
    });
  }
  if (isExpired(claims)) return fault(401, "Token expired", "TOKEN_EXPIRED");

  const db = tenantDb(claims.tenant_id);
  const state = db?.ref.current;
  const expected = mockContextFor(claims.tenant_id);
  const contextOk =
    header("org-id") === expected.org_id && header("bus-id") === expected.bus_id && header("loc-id") === expected.loc_id;
  if (!db || !state || !contextOk || !state.users.some((u) => u.id === claims.user_id)) {
    return fault(
      403,
      "Invalid platform context: org-id, bus-id, loc-id, and app-id are not configured for this user/tenant, or the user has no access.",
      "FORBIDDEN",
    );
  }
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

let activating: Promise<void> | null = null;

// The browser stops an idle service worker (a background tab throttles MSW's keep-alive), and
// a restarted worker has forgotten which tabs it serves, so it passes their requests through
// to the dev server, which answers 404. Re-registering before each request avoids that.
const reactivate = () =>
  new Promise<void>((resolve) => {
    const container = navigator.serviceWorker;
    const controller = container.controller;
    if (!controller) return resolve();
    const done = () => {
      clearTimeout(timer);
      container.removeEventListener("message", onMessage);
      resolve();
    };
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "MOCKING_ENABLED") done();
    };
    const timer = setTimeout(done, 1000);
    container.addEventListener("message", onMessage);
    container.startMessages();
    controller.postMessage("MOCK_ACTIVATE");
  });

/** Resolves when the mock worker has started and is serving this tab. */
export const mockApiReady = () =>
  startMockApi().then(() => (activating ??= reactivate().finally(() => (activating = null))));
