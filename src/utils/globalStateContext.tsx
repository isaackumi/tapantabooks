"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

interface GlobalStateContextProps {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
}

const GlobalStateContext = createContext<GlobalStateContextProps | undefined>(undefined);

export const useGlobalState = () => {
  const context = useContext(GlobalStateContext);
  if (!context) throw new Error("useGlobalState must be used within a GlobalStateProvider");
  return context;
};

export const GlobalStateProvider = ({ children }: { children: ReactNode }) => {
  const [searchQuery, setSearchQuery] = useState("");
  const pathname = usePathname();

  // The header search filters the current page; a new page starts unfiltered.
  useEffect(() => {
    setSearchQuery("");
  }, [pathname]);

  return (
    <GlobalStateContext.Provider value={{ searchQuery, setSearchQuery }}>{children}</GlobalStateContext.Provider>
  );
};

export const matchesSearch = (query: string, ...values: (string | number | null | undefined)[]) => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return values.some((v) => v !== null && v !== undefined && String(v).toLowerCase().includes(q));
};
