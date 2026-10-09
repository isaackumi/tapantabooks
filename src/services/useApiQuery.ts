"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type ListData, type Pagination, type Query } from "@/core/apiClient";
import { useLedger } from "@/store/ledgerStore";

export interface ApiQueryResult<T> {
  data: T | null;
  /** Present on list endpoints. */
  pagination: Pagination | null;
  error: string | null;
  /** True while a request is in flight, including refetches that keep the previous `data`. */
  loading: boolean;
  refetch: () => void;
}

/**
 * GETs an endpoint that is not one of the cached collections (previews, reports, list pages).
 * Refetches when the path, query or any of `deps` change; keeps the last data while refetching.
 * Pass `path: null` to skip the request (for example while a required parameter is missing).
 */
export const useApiQuery = <T>(path: string | null, query: Query, deps: readonly unknown[] = []): ApiQueryResult<T> => {
  const [data, setData] = useState<T | null>(null);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify(query);

  useEffect(() => {
    if (path === null) {
      setData(null);
      setPagination(null);
      setError(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    api
      .get<T>(path, JSON.parse(key) as Query, controller.signal)
      .then((res) => {
        setData(res.data);
        setPagination(res.pagination ?? null);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Request failed.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- callers pass the values that should trigger a refetch
  }, [path, key, attempt, ...deps]);

  const refetch = useCallback(() => setAttempt((n) => n + 1), []);
  return { data, pagination, error, loading, refetch };
};

/** A report or statistics endpoint: refetches whenever the books change (any successful write). */
export const useReport = <T>(path: string | null, query: Query): ApiQueryResult<T> => {
  const { revision } = useLedger();
  return useApiQuery<T>(path, query, [revision]);
};

export interface ListSort {
  by: string;
  order: "asc" | "desc";
}

export interface PagedList<T, D extends ListData<T>> extends ApiQueryResult<D> {
  items: T[];
  page: number;
  setPage: (page: number) => void;
  size: number;
  /** null means the endpoint's default order. */
  sort: ListSort | null;
  setSort: (sort: ListSort | null) => void;
  /** The filters and sort as sent, without paging; reuse them to export every matching row. */
  listQuery: Query;
}

/**
 * One page of a `/list` endpoint. Filters, sort and paging go to the server; the page returns to 1
 * whenever the filters or sort change, and the page refetches after any successful write.
 */
export const usePagedList = <T, D extends ListData<T> = ListData<T>>(
  path: string,
  filters: Query,
  size = 25,
): PagedList<T, D> => {
  const filterKey = JSON.stringify(filters);
  const [sort, setSortState] = useState<ListSort | null>(null);
  const [paging, setPaging] = useState({ key: "", page: 1 });
  const scope = `${filterKey}|${sort?.by ?? ""}|${sort?.order ?? ""}`;
  const page = paging.key === scope ? paging.page : 1;
  const listQuery: Query = { ...filters, ...(sort ? { sort_by: sort.by, sort_order: sort.order } : {}) };
  const query = useReport<D>(path, { ...listQuery, page, size });
  return {
    ...query,
    items: query.data?.items ?? [],
    page,
    setPage: (p) => setPaging({ key: scope, page: p }),
    size,
    sort,
    setSort: setSortState,
    listQuery,
  };
};

/** `value` after it has stopped changing for `ms`; use for search boxes that hit the server. */
export const useDebouncedValue = <T>(value: T, ms = 300): T => {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
};
