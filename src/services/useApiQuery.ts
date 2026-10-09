"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type Query } from "@/core/apiClient";
import { useLedger } from "@/store/ledgerStore";

export interface ApiQueryResult<T> {
  data: T | null;
  error: string | null;
  /** True while a request is in flight, including refetches that keep the previous `data`. */
  loading: boolean;
  refetch: () => void;
}

/**
 * GETs an endpoint that is not one of the cached collections (previews, reports).
 * Refetches when the path, query or any of `deps` change; keeps the last data while refetching.
 * Pass `path: null` to skip the request (for example while a required parameter is missing).
 */
export const useApiQuery = <T>(path: string | null, query: Query, deps: readonly unknown[] = []): ApiQueryResult<T> => {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify(query);

  useEffect(() => {
    if (path === null) {
      setData(null);
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
  return { data, error, loading, refetch };
};

/** A report or statistics endpoint: refetches whenever the books change (any successful write). */
export const useReport = <T>(path: string | null, query: Query): ApiQueryResult<T> => {
  const { revision } = useLedger();
  return useApiQuery<T>(path, query, [revision]);
};
