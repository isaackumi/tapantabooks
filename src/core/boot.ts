"use client";

import { configureApiClient } from "./apiClient";
import { AppConstants } from "./appConstants";
import { captureHandoff } from "./session";

// Runs on import, before any component effect: React fires child effects before
// parent ones, so the first API call would otherwise race the mock worker.
if (typeof window !== "undefined") {
  captureHandoff();
  if (AppConstants.useMockApi) {
    const worker = import("@/mock/api/worker");
    void worker.then((m) => m.startMockApi());
    configureApiClient({
      ready: () => worker.then((m) => m.mockApiReady()),
      transport: (request) => worker.then((m) => m.mockTransport(request)),
    });
  }
}
