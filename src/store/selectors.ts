import type { Account } from "@/models/accounting";
import type { ClientState } from "./ledgerStore";

export const accountMap = (s: Pick<ClientState, "accounts">) => new Map(s.accounts.map((a) => [a.id, a]));

export const postableAccounts = (s: Pick<ClientState, "accounts">, opts: { includeControl?: boolean } = {}) =>
  s.accounts
    .filter((a) => !a.is_group && a.is_active && (opts.includeControl || !a.is_control))
    .sort((a, b) => a.code.localeCompare(b.code));

export const accountLabel = (a: Account | undefined) => (a ? `${a.code} · ${a.name}` : "—");

export const dimensionsOf = (s: Pick<ClientState, "dimensions">, kind: string) =>
  s.dimensions.filter((d) => d.kind === kind && d.is_active);

export const dimensionName = (s: Pick<ClientState, "dimensions">, id: string | null | undefined) =>
  s.dimensions.find((d) => d.id === id)?.name ?? "—";
