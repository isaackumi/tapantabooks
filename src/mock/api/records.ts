import type { ImportBatchStatus } from "@/models/accounting";
import type { AuditStatistics, ImportListItem, ImportReferenceCheck, ImportStatistics } from "@/models/lists";
import { todayIso } from "@/utils/dates";
import type { LedgerState } from "./engine";
import { ApiFault } from "./http";

const ATTENTION: ImportBatchStatus[] = ["NEEDS_REVIEW", "FAILED", "PARTIALLY_POSTED"];
export const needsAttention = (status: ImportBatchStatus) => ATTENTION.includes(status);

export const importItems = (state: LedgerState): ImportListItem[] => {
  const sources = new Map(state.dataSources.map((s) => [s.id, s.name]));
  return state.importBatches.map((b) => ({
    ...b,
    source_name: sources.get(b.source_id) ?? b.source_id,
    row_count: b.records.length,
    valid_count: b.records.filter((r) => r.status === "VALID").length,
    warning_count: b.records.filter((r) => r.status === "WARNING").length,
    error_count: b.records.filter((r) => r.status === "ERROR").length,
    posted_count: b.records.filter((r) => r.posted).length,
  }));
};

export const importStatistics = (state: LedgerState): ImportStatistics => {
  const items = importItems(state);
  const sum = (k: "row_count" | "posted_count" | "error_count") => items.reduce((t, b) => t + b[k], 0);
  return {
    batch_count: items.length,
    row_count: sum("row_count"),
    posted_rows: sum("posted_count"),
    held_rows: sum("error_count"),
    needs_attention: items.filter((b) => b.status === "NEEDS_REVIEW" || b.status === "FAILED").length,
    status_counts: {
      ALL: items.length,
      ATTENTION: items.filter((b) => needsAttention(b.status)).length,
      POSTED: items.filter((b) => b.status === "POSTED").length,
    },
  };
};

export const MAX_REFERENCE_CHECK = 5000;

/** Case-insensitive; each reference reports the first batch that imported it. */
export const checkImportReferences = (state: LedgerState, references: unknown): ImportReferenceCheck => {
  if (!Array.isArray(references) || references.some((r) => typeof r !== "string")) {
    throw new ApiFault(400, "references must be an array of strings.", { references: "Array of strings" });
  }
  if (references.length > MAX_REFERENCE_CHECK) {
    throw new ApiFault(400, `At most ${MAX_REFERENCE_CHECK} references per check.`, { references: `At most ${MAX_REFERENCE_CHECK}` });
  }
  const wanted = new Map((references as string[]).filter((r) => r.trim()).map((r) => [r.trim().toLowerCase(), r.trim()]));
  const hits = new Map<string, ImportReferenceCheck["items"][number]>();
  for (const b of [...state.importBatches].sort((x, y) => x.created_at.localeCompare(y.created_at))) {
    for (const r of b.records) {
      const key = r.external_reference.toLowerCase();
      if (wanted.has(key) && !hits.has(key)) hits.set(key, { reference: wanted.get(key)!, batch_id: b.id, batch_number: b.number });
    }
  }
  return { items: [...hits.values()] };
};

export const auditStatistics = (state: LedgerState): AuditStatistics => {
  const today = todayIso();
  const events = state.auditEvents;
  const by = (t: string) => events.filter((e) => e.actor_type === t).length;
  return {
    as_at: today,
    total: events.length,
    today: events.filter((e) => e.occurred_at.startsWith(today)).length,
    by_actor_type: { USER: by("USER"), SYSTEM: by("SYSTEM"), INTEGRATION: by("INTEGRATION") },
    entity_types: [...new Set(events.map((e) => e.entity_type))].sort(),
    actor_names: [...new Set(events.map((e) => e.actor_name))].sort(),
  };
};
