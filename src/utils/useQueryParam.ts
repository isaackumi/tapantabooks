"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

/** Calls `onValue` whenever the given query param is present (deep links such as ?open=inv_123). */
export const useQueryParam = (name: string, onValue: (value: string) => void) => {
  const params = useSearchParams();
  const value = params.get(name);
  useEffect(() => {
    if (value) onValue(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return value;
};
