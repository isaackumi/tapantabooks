"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Tracks which actions on a screen are waiting for the API, so their buttons can be disabled.
 * `track(key, work)` runs `work` once per key at a time (a repeat while it runs is ignored);
 * `pending(key)` is true while it runs.
 */
export const usePending = () => {
  const running = useRef(new Set<string>());
  const [keys, setKeys] = useState<ReadonlySet<string>>(() => new Set());

  const track = useCallback(async (key: string, work: () => Promise<unknown>): Promise<void> => {
    if (running.current.has(key)) return;
    running.current.add(key);
    setKeys(new Set(running.current));
    try {
      await work();
    } finally {
      running.current.delete(key);
      setKeys(new Set(running.current));
    }
  }, []);

  const pending = useCallback((key: string) => keys.has(key), [keys]);

  return { pending, track, anyPending: keys.size > 0 };
};
