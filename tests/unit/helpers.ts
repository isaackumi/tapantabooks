import { expect } from "vitest";
import { createInitialState, createLedgerEngine, type LedgerState, type Result, type StateRef } from "@/mock/api/engine";
import { documentTotals } from "@/lib/documents";
import { USERS } from "@/mock/seed";

/** A fresh copy of the demo books with an engine over it. */
export const demoBooks = () => {
  const ref: StateRef = { current: createInitialState() };
  const engine = createLedgerEngine(ref, () => {});
  return {
    ref,
    engine,
    get state(): LedgerState {
      return ref.current;
    },
    actAs(user: keyof typeof USERS) {
      ref.current = { ...ref.current, currentUserId: USERS[user].id };
    },
  };
};

export const expectOk = <T>(r: Result<T>): T => {
  if (!r.ok) throw new Error(`Expected success, got: ${r.error}`);
  return r.data;
};

export const expectFail = (r: Result<unknown>, message?: string | RegExp) => {
  expect(r.ok).toBe(false);
  if (!r.ok && message !== undefined) expect(r.error).toMatch(message);
};

export const outstanding = (s: LedgerState, doc: LedgerState["invoices"][number] | LedgerState["bills"][number]) =>
  Math.round((documentTotals(doc.lines, s.taxCodes).total - doc.amount_paid) * 100) / 100;
