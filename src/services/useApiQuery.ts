"use client";

import { useEffect, useState } from "react";
import { api, type Query } from "@/core/apiClient";

/**
 * GETs an endpoint that is not one of the cached collections (previews, reports).
 * Refetches when the path, query or any of `deps` change; keeps the last data while refetching.
 */
export const useApiQuery = <T>(path: string, query: Query, deps: readonly unknown[] = []) => {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const key = JSON.stringify(query);

  useEffect(() => {
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
  }, [path, key, ...deps]);

  return { data, error, loading };
};
