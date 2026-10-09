"use client";

import { useMemo } from "react";
import type { ListData } from "@/core/apiClient";
import type { DocumentListItem } from "@/models/lists";
import { useApiQuery } from "@/services/useApiQuery";

export const OPEN_DOCUMENTS_PAGE = 100;

/**
 * Invoices or bills with something still owed, soonest due first, for pickers. `includeId` is
 * fetched on its own when it is open but falls outside the first page. Loads only while `enabled`.
 */
export const useOpenDocuments = (kind: "invoice" | "bill", enabled: boolean, includeId?: string | null) => {
  const base = kind === "invoice" ? "/invoices" : "/bills";
  const list = useApiQuery<ListData<DocumentListItem>>(enabled ? `${base}/list` : null, {
    open: "true",
    sort_by: "due_date",
    sort_order: "asc",
    size: OPEN_DOCUMENTS_PAGE,
  });
  const listed = useMemo(() => list.data?.items ?? [], [list.data]);
  const missing = enabled && !!includeId && !!list.data && !listed.some((d) => d.id === includeId);
  const extra = useApiQuery<DocumentListItem>(missing ? `${base}/get` : null, { [`${kind}_id`]: includeId ?? "" });

  const docs = useMemo(() => {
    const e = extra.data;
    return missing && e && e.id === includeId && e.outstanding_base > 0 ? [e, ...listed] : listed;
  }, [extra.data, includeId, listed, missing]);

  return {
    docs,
    loading: list.loading || extra.loading,
    error: list.error ?? extra.error,
    /** More open documents exist than the picker shows. */
    truncated: (list.pagination?.total ?? 0) > listed.length,
  };
};
