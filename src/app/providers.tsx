"use client";

import { Toaster } from "react-hot-toast";
import { DarkModeProvider } from "@/utils/useDarkMode";
import { SidebarProvider } from "@/utils/useSidebar";
import { GlobalStateProvider } from "@/utils/globalStateContext";
import { LedgerProvider } from "@/store/ledgerStore";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <DarkModeProvider>
      <SidebarProvider>
        <GlobalStateProvider>
          <LedgerProvider>
            {children}
            <Toaster
              position="top-right"
              toastOptions={{
                className: "!text-sm dark:!bg-neutral-800 dark:!text-neutral-100",
                duration: 4000,
              }}
            />
          </LedgerProvider>
        </GlobalStateProvider>
      </SidebarProvider>
    </DarkModeProvider>
  );
}
