import type { CurrentUser } from "@/models/accounting";
import { MOCK_TENANT_ID } from "@/core/session";
import {
  createInitialState,
  createLedgerEngine,
  createTenantState,
  type LedgerEngine,
  type LedgerState,
  type StateRef,
} from "./engine";

const STORAGE_PREFIX = "tvs-mock-db:";
/** Bump when the seed or model shape changes so stale browser copies are discarded. */
const SCHEMA_VERSION = 3;

interface TenantDb {
  ref: StateRef;
  engine: LedgerEngine;
}

const tenants = new Map<string, TenantDb>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

const storageKey = (tenantId: string) => `${STORAGE_PREFIX}${tenantId}`;

const read = (tenantId: string): LedgerState | null => {
  try {
    const raw = window.localStorage.getItem(storageKey(tenantId));
    if (!raw) return null;
    const saved = JSON.parse(raw) as { version: number; state: LedgerState };
    if (saved.version !== SCHEMA_VERSION || !saved.state?.journals) return null;
    // Collections added after a tenant was provisioned start empty.
    const state = saved.state as Partial<LedgerState>;
    return { ...saved.state, creditNotes: state.creditNotes ?? [], supplierCredits: state.supplierCredits ?? [] };
  } catch {
    return null;
  }
};

const persist = (tenantId: string) => (state: LedgerState) => {
  clearTimeout(timers.get(tenantId));
  timers.set(
    tenantId,
    setTimeout(() => {
      try {
        window.localStorage.setItem(storageKey(tenantId), JSON.stringify({ version: SCHEMA_VERSION, state }));
      } catch {
        // Storage full or blocked: the demo keeps working in memory.
      }
    }, 250),
  );
};

const open = (tenantId: string, initial: LedgerState): TenantDb => {
  const ref: StateRef = { current: initial };
  const db = { ref, engine: createLedgerEngine(ref, persist(tenantId)) };
  tenants.set(tenantId, db);
  return db;
};

/** The tenant's books, or `null` when the tenant has never been provisioned. */
export const tenantDb = (tenantId: string): TenantDb | null => {
  const cached = tenants.get(tenantId);
  if (cached) return cached;
  const saved = read(tenantId);
  if (saved) return open(tenantId, saved);
  if (tenantId === MOCK_TENANT_ID) return open(tenantId, createInitialState());
  return null;
};

/** Called by the mock Core sign-up: creates empty books for a new tenant. */
export const provisionTenant = (tenantId: string, owner: CurrentUser, orgName: string) => {
  const db = open(tenantId, createTenantState(owner, orgName));
  persist(tenantId)(db.ref.current);
  return db;
};

export const resetTenant = (tenantId: string) => {
  clearTimeout(timers.get(tenantId));
  window.localStorage.removeItem(storageKey(tenantId));
  tenants.delete(tenantId);
};
