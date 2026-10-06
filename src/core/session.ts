import { AppConstants } from "./appConstants";

/**
 * Trovesuite platform context. The Core shell opens the app with
 * `#token=…&org_id=…&bus_id=…&loc_id=…&app_id=…`; we keep the values in
 * localStorage (same keys as loandrift) and send them on every API call.
 */
export interface TroveContext {
  app_id: string;
  org_id: string;
  bus_id: string;
  loc_id: string;
}

export interface TroveSession extends TroveContext {
  token: string;
}

export interface TokenClaims {
  sub: string;
  user_id: string;
  tenant_id: string;
  name?: string;
  email?: string;
  role?: string;
  iat?: number;
  exp?: number;
}

const KEYS = {
  token: "access_token",
  org_id: "org_id",
  bus_id: "bus_id",
  loc_id: "loc_id",
  app_id: "app_id",
} as const;

export const MOCK_TENANT_ID = "tnt_kumasi_traders";
export const MOCK_CONTEXT: Omit<TroveContext, "app_id"> = {
  org_id: "org_kumasi_traders",
  bus_id: "le_ktl",
  loc_id: "br_adum",
};

const isBrowser = () => typeof window !== "undefined";
const read = (key: string) => (isBrowser() ? window.localStorage.getItem(key) : null);
const write = (key: string, value: string) => isBrowser() && window.localStorage.setItem(key, value);

const listeners = new Set<() => void>();
let version = 0;
const emit = () => {
  version++;
  listeners.forEach((l) => l());
};

export const subscribeSession = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const sessionVersion = () => version;

const base64UrlEncode = (value: object) => {
  let binary = "";
  new TextEncoder().encode(JSON.stringify(value)).forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
};

export const decodeToken = (token: string | null | undefined): TokenClaims | null => {
  if (!token) return null;
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const binary = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    const json = new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
    return JSON.parse(json) as TokenClaims;
  } catch {
    return null;
  }
};

export const isExpired = (claims: TokenClaims | null) => !claims?.exp || claims.exp * 1000 <= Date.now();

/** Unsigned token with the claims the API reads (`tenant_id`, `user_id`). Only the mock backend accepts it. */
export const mintMockToken = (
  user: { id: string; name: string; email: string; role: string },
  tenantId: string = MOCK_TENANT_ID,
  hours = 8,
) => {
  const now = Math.floor(Date.now() / 1000);
  const claims: TokenClaims = {
    sub: user.id,
    user_id: user.id,
    tenant_id: tenantId,
    name: user.name,
    email: user.email,
    role: user.role,
    iat: now,
    exp: now + hours * 3600,
  };
  return `${base64UrlEncode({ alg: "none", typ: "JWT", kid: "tvs-mock" })}.${base64UrlEncode(claims)}.mock-signature`;
};

/** Moves a Core shell hand-off from the URL hash into storage and strips it from the address bar. */
export const captureHandoff = () => {
  if (!isBrowser()) return;
  const hash = window.location.hash.substring(1);
  if (!hash) return;
  const params = new URLSearchParams(hash);
  const token = params.get("token") ?? params.get("access_token");
  let found = false;
  if (token) {
    write(KEYS.token, token);
    found = true;
  }
  for (const key of ["org_id", "bus_id", "loc_id", "app_id"] as const) {
    const value = params.get(key);
    if (value) {
      write(KEYS[key], value);
      found = true;
    }
  }
  if (found) {
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    emit();
  }
};

export const getSession = (): Partial<TroveSession> => ({
  token: read(KEYS.token) ?? undefined,
  org_id: read(KEYS.org_id) ?? undefined,
  bus_id: read(KEYS.bus_id) ?? undefined,
  loc_id: read(KEYS.loc_id) ?? undefined,
  app_id: read(KEYS.app_id) ?? AppConstants.appId,
});

export const currentClaims = () => decodeToken(read(KEYS.token));

export const setToken = (token: string) => {
  write(KEYS.token, token);
  emit();
};

/** Switches the business (legal entity) and location the API calls are scoped to. */
export const setContext = (patch: Partial<Pick<TroveContext, "bus_id" | "loc_id">>) => {
  if (patch.bus_id) write(KEYS.bus_id, patch.bus_id);
  if (patch.loc_id) write(KEYS.loc_id, patch.loc_id);
  emit();
};

/** Mock platform ids for a tenant; the real ids come from the Core shell hand-off. */
export const mockContextFor = (tenantId: string): Omit<TroveContext, "app_id"> => {
  if (tenantId === MOCK_TENANT_ID) return MOCK_CONTEXT;
  const suffix = tenantId.replace(/^tnt_/, "");
  return { org_id: `org_${suffix}`, bus_id: `bus_${suffix}`, loc_id: `loc_${suffix}` };
};

/** Stores a token from Core login together with the org / business / location it should act in. */
export const startSession = (token: string, context: Omit<TroveContext, "app_id">) => {
  write(KEYS.token, token);
  write(KEYS.org_id, context.org_id);
  write(KEYS.bus_id, context.bus_id);
  write(KEYS.loc_id, context.loc_id);
  write(KEYS.app_id, AppConstants.appId);
  emit();
};

export const hasValidSession = () => {
  const claims = currentClaims();
  return !!claims && !isExpired(claims) && !!read(KEYS.org_id);
};

export const clearSession = () => {
  if (!isBrowser()) return;
  Object.values(KEYS).forEach((k) => window.localStorage.removeItem(k));
  emit();
};

/** Inside the Core shell, ask it to log in again; standalone, go to the Core login page or our own. */
export const redirectToLogin = () => {
  if (!isBrowser()) return;
  if (window.parent !== window) {
    window.parent.postMessage({ type: "REDIRECT_TO_LOGIN" }, "*");
    return;
  }
  clearSession();
  window.location.href = AppConstants.loginUrl;
};
