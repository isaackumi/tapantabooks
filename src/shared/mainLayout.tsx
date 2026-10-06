"use client";

import { useState } from "react";
import Header from "@/components/header";
import Sidebar from "@/components/sidebar";
import { useSidebar } from "@/utils/useSidebar";

// Desktop content offset per sidebar mode (must be literal classes for Tailwind JIT).
const CONTENT_PADDING: Record<string, string> = {
  docked: "lg:pl-[250px]",
  collapsed: "lg:pl-[72px]",
  hidden: "lg:pl-0",
};

const MainLayout = ({ children }: { children: React.ReactNode }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { mode } = useSidebar();

  return (
    <div className="min-h-screen bg-neutral-100 dark:bg-neutral-900">
      <Sidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />
      <div
        data-layout-content
        className={`transition-[padding] duration-300 ease-in-out ${CONTENT_PADDING[mode] ?? "lg:pl-0"}`}
      >
        <Header setSidebarOpen={setSidebarOpen} />
        <main className="py-8">
          <div className="px-4 sm:px-6 lg:px-8">{children}</div>
        </main>
      </div>
    </div>
  );
};

export default MainLayout;
