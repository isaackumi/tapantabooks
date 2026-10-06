"use client";

import { configureApiClient } from "./apiClient";
import { AppConstants } from "./appConstants";
import { captureHandoff } from "./session";

// Runs on import, before any component effect: React fires child effects before
// parent ones, so the first API call would otherwise race the mock worker.
if (typeof window !== "undefined") {
  captureHandoff();
  if (AppConstants.useMockApi) {
    configureApiClient({ ready: import("@/mock/api/worker").then((m) => m.startMockApi()) });
  }
}
