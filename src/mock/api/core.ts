// Mock of the Trovesuite Core Platform landing-page routes (tvs-coreplatform-bk,
// src/entities/landingpage). Status codes, messages and the list-shaped `data`
// follow the Python service so the auth screens behave the same against it.

import { MOCK_TENANT_ID, mintMockToken } from "@/core/session";
import { USERS } from "@/mock/seed";
import { provisionTenant } from "./db";
import { envelope } from "./http";

/* eslint-disable @typescript-eslint/no-explicit-any -- request bodies are untyped JSON */

/** Core emails real OTPs; the mock accepts this one everywhere. */
export const MOCK_OTP = "123456";
export const DEMO_PASSWORD = "Demo@1234";

interface CoreUser {
  id: string;
  tenant_id: string;
  fullname: string;
  email: string;
  contact: string;
  address: string;
  password: string;
  role: string;
  is_owner: boolean;
  is_login_before: boolean;
  is_multi_factor_enabled: boolean;
}

interface CoreDb {
  users: CoreUser[];
  verified_tenants: string[];
}

const STORAGE_KEY = "tvs-mock-core:v1";

const seed = (): CoreDb => ({
  users: Object.values(USERS).map((u, i) => ({
    id: u.id,
    tenant_id: MOCK_TENANT_ID,
    fullname: u.name,
    email: u.email,
    contact: `+23324400000${i + 1}`,
    address: "Adum, Kumasi",
    password: DEMO_PASSWORD,
    role: u.role,
    is_owner: i === 0,
    is_login_before: true,
    is_multi_factor_enabled: false,
  })),
  verified_tenants: [MOCK_TENANT_ID],
});

const load = (): CoreDb => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as CoreDb;
  } catch {
    // Unreadable copy: start again.
  }
  return seed();
};

const save = (db: CoreDb) => window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));

const randomId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;

const reply = (status: number, detail: string, data: unknown[] = [], success = status < 400) => ({
  status,
  body: { ...envelope(status, data, { detail }), success },
});

const byUsername = (db: CoreDb, username: string) => {
  const u = String(username ?? "").trim().toLowerCase();
  return db.users.find((x) => x.email.toLowerCase() === u || x.contact === u);
};

const tokenFor = (user: CoreUser) => ({
  token: mintMockToken({ id: user.id, name: user.fullname, email: user.email, role: user.role }, user.tenant_id),
  permission_details: [],
  profile_picture_url: null,
});

const passwordProblem = (password: string) =>
  !password || password.length < 8 ? "Password must be at least 8 characters long." : null;

type CoreHandler = (body: any) => { status: number; body: unknown };

const HANDLERS: Record<string, CoreHandler> = {
  "/landingpage/signup": (body) => {
    const db = load();
    const fullname = String(body.fullname ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const contact = String(body.contact ?? "").trim();
    const address = String(body.address ?? "").trim();
    if (!fullname || !email || !contact || !address) return reply(422, "fullname, email, contact and address are required.");
    if (db.users.some((u) => u.email.toLowerCase() === email)) {
      return reply(400, `Email ${email} already exists, please provide a different one. Thank you!`);
    }
    if (db.users.some((u) => u.contact === contact)) {
      return reply(400, `Contact ${contact} already exists, please provide a different one. Thank you!`);
    }
    const problem = passwordProblem(body.password);
    if (problem) return reply(400, problem);
    const user: CoreUser = {
      id: randomId("usr"),
      tenant_id: randomId("tnt"),
      fullname,
      email,
      contact,
      address,
      password: body.password,
      role: "Owner",
      is_owner: true,
      is_login_before: true,
      is_multi_factor_enabled: false,
    };
    db.users.push(user);
    save(db);
    provisionTenant(user.tenant_id, { id: user.id, name: fullname, email, role: "Owner" }, `${fullname.split(" ")[0]}'s business`);
    const now = new Date();
    return reply(201, "Hi, signup Successfully. An administrator will reach out to you soon. Thank you.", [
      {
        id: user.id,
        fullname,
        email,
        contact,
        address,
        cdate: now.toISOString().slice(0, 10),
        ctime: now.toISOString().slice(11, 19),
        cdatetime: now.toISOString(),
      },
    ]);
  },

  "/landingpage/login": (body) => {
    const db = load();
    const user = byUsername(db, body.username);
    if (!user || user.password !== body.password) return reply(401, "Invalid username or password");
    if (!db.verified_tenants.includes(user.tenant_id)) return reply(403, "Tenant not verified. Please contact support.");
    if (!user.is_login_before) return reply(200, "First time login detected. Please change your password.", [], false);
    if (user.is_multi_factor_enabled) return reply(200, "An OTP code has been sent to you, thank you!");
    return reply(200, "Login successful", [tokenFor(user)]);
  },

  "/landingpage/login/verify": (body) => {
    const db = load();
    const user = byUsername(db, body.username);
    if (!user) {
      return reply(404, "User not found. Please ensure you're using the same email or contact number you used for login.");
    }
    if (body.otp_code !== MOCK_OTP) {
      return reply(400, "Invalid OTP Code. Please check your code and ensure you're using the same email or contact number you used for login.");
    }
    return reply(200, "OTP verified successfully, thank you!", [{ username: body.username, ...tokenFor(user) }]);
  },

  "/landingpage/verify-tenant": (body) => {
    const db = load();
    const user = byUsername(db, body.username);
    if (!user || !user.is_owner) {
      return reply(403, "User is not the owner of the account, only owner's can verify account, thank you!");
    }
    if (body.otp_code !== MOCK_OTP) return reply(400, "Invalid OTP Code");
    if (!db.verified_tenants.includes(user.tenant_id)) db.verified_tenants.push(user.tenant_id);
    save(db);
    return reply(200, "Tenant Verified successfully, thank you!");
  },

  "/landingpage/change-password-on-first-login": (body) => {
    const db = load();
    const user = byUsername(db, body.username);
    if (!user) return reply(404, "User does not exists");
    if (user.password !== body.old_password) {
      return reply(401, "Invalid username or password, please make sure current password or email / contact is valid");
    }
    const problem = passwordProblem(body.new_password);
    if (problem) return reply(400, problem);
    user.password = body.new_password;
    user.is_login_before = true;
    save(db);
    return reply(200, "Password changed successfully");
  },

  "/landingpage/forget-password/request": (body) => {
    const user = byUsername(load(), body.username);
    if (!user) return reply(404, "Invalid Email or Contact");
    return reply(200, `An OTP Code has been sent to ${body.username}`);
  },

  "/landingpage/forget-password/verify": (body) => {
    const db = load();
    if (body.otp_code !== MOCK_OTP) return reply(400, "Invalid OTP Code");
    const user = byUsername(db, body.username);
    if (!user) return reply(404, "User does not exists");
    const problem = passwordProblem(body.new_password);
    if (problem) return reply(400, problem);
    user.password = body.new_password;
    save(db);
    return reply(200, "Password changed successfully, thank you!");
  },
};

HANDLERS["/landingpage/login/mfa"] = HANDLERS["/landingpage/login/verify"];

export const handleCoreRequest = (path: string, body: unknown) => {
  const handler = HANDLERS[path];
  if (!handler) return reply(404, `No mock Core route for ${path}`);
  return handler(body ?? {});
};

export const resetMockCore = () => window.localStorage.removeItem(STORAGE_KEY);
