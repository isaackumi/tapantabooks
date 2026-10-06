"use client";

import "@/core/boot";
import { Toaster } from "react-hot-toast";
import { DarkModeProvider } from "@/utils/useDarkMode";
import { SidebarProvider } from "@/utils/useSidebar";
import { GlobalStateProvider } from "@/utils/globalStateContext";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <DarkModeProvider>
      <SidebarProvider>
        <GlobalStateProvider>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              className: "!text-sm dark:!bg-neutral-800 dark:!text-neutral-100",
              duration: 4000,
            }}
          />
        </GlobalStateProvider>
      </SidebarProvider>
    </DarkModeProvider>
  );
}
