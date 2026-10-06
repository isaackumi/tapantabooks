"use client";

import { whenApiReady } from "@/core/apiClient";
import { AppConstants } from "@/core/appConstants";
import { decodeToken, mockContextFor, startSession, type TroveContext } from "@/core/session";

/**
 * Client for the Trovesuite Core Platform auth routes (tvs-coreplatform-bk, /api/v1/landingpage/*).
 * Unlike the accounting client this never throws on `success: false`: the login screen
 * branches on Core's status code and message.
 */

export interface CoreReply<T> {
  ok: boolean;
  status: number;
  message: string;
  data: T[];
}

export interface CoreToken {
  token: string;
  permission_details: unknown[];
  profile_picture_url: string | null;
}

export interface SignupInput {
  fullname: string;
  email: string;
  contact: string;
  address: string;
  password: string;
}

const coreRequest = async <T>(method: "GET" | "POST", path: string, body?: unknown, token?: string): Promise<CoreReply<T>> => {
  await whenApiReady();
  const headers: Record<string, string> = { accept: "application/json" };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (token) headers["authorization"] = `Bearer ${token}`;
  try {
    const response = await fetch(`${AppConstants.coreApiUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await response.json().catch(() => null)) as {
      success?: boolean;
      status_code?: number;
      detail?: string;
      error?: string;
      data?: T[] | T | null;
    } | null;
    const status = json?.status_code ?? response.status;
    const data = json?.data == null ? [] : Array.isArray(json.data) ? json.data : [json.data];
    return {
      ok: (json?.success ?? response.ok) && status < 400,
      status,
      message: json?.detail || json?.error || response.statusText || "Request failed.",
      data,
    };
  } catch {
    return { ok: false, status: 0, message: "Could not reach the Trovesuite sign-in service. Check your connection and try again.", data: [] };
  }
};

export const signup = (input: SignupInput) => coreRequest<{ id: string }>("POST", "/landingpage/signup", input);

export const verifyTenant = (username: string, otp_code: string) =>
  coreRequest("POST", "/landingpage/verify-tenant", { username, otp_code });

export const changePasswordOnFirstLogin = (username: string, old_password: string, new_password: string) =>
  coreRequest("POST", "/landingpage/change-password-on-first-login", { username, old_password, new_password });

export const forgotPasswordRequest = (username: string) => coreRequest("POST", "/landingpage/forget-password/request", { username });

export const forgotPasswordVerify = (username: string, otp_code: string, new_password: string) =>
  coreRequest("POST", "/landingpage/forget-password/verify", { username, otp_code, new_password });

/** What Core's login answered, reduced to the screen the user should see next. */
export type LoginOutcome =
  | { kind: "signed-in"; token: string }
  | { kind: "mfa"; message: string }
  | { kind: "tenant-not-verified"; message: string }
  | { kind: "first-login"; message: string }
  | { kind: "error"; message: string };

const outcomeOf = (res: CoreReply<CoreToken>): LoginOutcome => {
  const token = res.data[0]?.token;
  if (res.ok && token) return { kind: "signed-in", token };
  if (res.status === 403 && /not verified/i.test(res.message)) return { kind: "tenant-not-verified", message: res.message };
  if (res.status === 200 && /first time login/i.test(res.message)) return { kind: "first-login", message: res.message };
  if (res.ok) return { kind: "mfa", message: res.message };
  return { kind: "error", message: res.message };
};

export const login = async (username: string, password: string) =>
  outcomeOf(await coreRequest<CoreToken>("POST", "/landingpage/login", { username, password }));

export const verifyLoginOtp = async (username: string, otp_code: string) =>
  outcomeOf(await coreRequest<CoreToken>("POST", "/landingpage/login/mfa", { username, otp_code }));

// ---------------------------------------------------------------------------
// Platform context: which organisation / business / location the session acts in
// ---------------------------------------------------------------------------

interface CoreOrg {
  id: string;
  org_name: string;
  is_active: boolean;
}
interface CoreBusiness {
  id: string;
  bus_name: string;
  org_id: string | null;
  is_active: boolean;
}
interface CoreLocation {
  id: string;
  loc_name: string;
  is_active: boolean;
}

const firstActive = <T extends { is_active: boolean }>(rows: T[]) => rows.find((r) => r.is_active) ?? rows[0];

/**
 * Core's login returns only a token. Inside the Core shell the context arrives in the URL hash;
 * standalone we take the first active organisation, business and location the tenant has.
 */
export const resolveContext = async (token: string): Promise<{ ok: true; context: Omit<TroveContext, "app_id"> } | { ok: false; message: string }> => {
  const claims = decodeToken(token);
  if (!claims?.tenant_id) return { ok: false, message: "The sign-in token has no tenant. Sign in again." };
  if (AppConstants.useMockApi) return { ok: true, context: mockContextFor(claims.tenant_id) };

  const orgs = await coreRequest<CoreOrg>("GET", "/organizations/get-organizations?size=100", undefined, token);
  const org = firstActive(orgs.data);
  if (!org) return { ok: false, message: "Your account has no organisation yet. Create one in the Trovesuite portal, then open Accounting." };
  const businesses = await coreRequest<CoreBusiness>("GET", `/businesses/get-businesses?org_id=${encodeURIComponent(org.id)}&size=100`, undefined, token);
  const business = firstActive(businesses.data);
  const locations = await coreRequest<CoreLocation>("GET", "/locations/get-locations?size=100", undefined, token);
  const location = firstActive(locations.data);
  if (!business || !location) {
    return { ok: false, message: "Add a business and a location to your organisation in the Trovesuite portal, then open Accounting." };
  }
  return { ok: true, context: { org_id: org.id, bus_id: business.id, loc_id: location.id } };
};

/** Stores the token and its context; afterwards the accounting API calls carry the Trove headers. */
export const beginSession = async (token: string) => {
  const resolved = await resolveContext(token);
  if (!resolved.ok) return resolved;
  startSession(token, resolved.context);
  return { ok: true as const };
};
