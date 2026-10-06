"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FiAlertTriangle, FiRefreshCw } from "react-icons/fi";
import { hasValidSession, redirectToLogin } from "@/core/session";
import { LedgerProvider, useLedgerShell } from "@/store/ledgerStore";
import { Button } from "./ui";

export const FullPageMessage = ({ children }: { children: React.ReactNode }) => (
  <div className="flex min-h-screen items-center justify-center bg-neutral-100 px-4 dark:bg-neutral-900">{children}</div>
);

export const Spinner = ({ label }: { label: string }) => (
  <div className="flex flex-col items-center gap-3 text-sm text-neutral-500 dark:text-neutral-400">
    <span className="h-8 w-8 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" aria-hidden="true" />
    {label}
  </div>
);

const LedgerReady = ({ children }: { children: React.ReactNode }) => {
  const { status, error, retry } = useLedgerShell();
  const router = useRouter();

  useEffect(() => {
    if (status === "needs-setup") router.replace("/onboarding");
  }, [status, router]);

  if (status === "ready") return <>{children}</>;
  if (status === "error") {
    return (
      <FullPageMessage>
        <div className="max-w-md rounded-2xl border border-neutral-200 bg-white p-6 text-center dark:border-neutral-700 dark:bg-neutral-800">
          <FiAlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
          <p className="mt-3 font-semibold text-neutral-900 dark:text-white">The books could not be loaded</p>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">{error}</p>
          <Button className="mt-5" icon={FiRefreshCw} onClick={retry}>
            Try again
          </Button>
        </div>
      </FullPageMessage>
    );
  }
  return (
    <FullPageMessage>
      <Spinner label={status === "needs-setup" ? "Opening organisation setup…" : "Loading your books…"} />
    </FullPageMessage>
  );
};

/** Sends visitors without a session to login, then loads the books before rendering the app. */
const SessionGate = ({ children }: { children: React.ReactNode }) => {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    if (hasValidSession()) setSignedIn(true);
    else redirectToLogin();
  }, []);

  if (!signedIn) {
    return (
      <FullPageMessage>
        <Spinner label="Checking your session…" />
      </FullPageMessage>
    );
  }
  return (
    <LedgerProvider>
      <LedgerReady>{children}</LedgerReady>
    </LedgerProvider>
  );
};

export default SessionGate;
