"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

export type SidebarMode = "docked" | "collapsed" | "hidden";

// Order used when cycling with a single toggle button.
export const SIDEBAR_MODES: SidebarMode[] = ["hidden", "docked", "collapsed"];

const STORAGE_KEY = "sidebar_mode";

interface SidebarContextProps {
  mode: SidebarMode;
  setMode: (mode: SidebarMode) => void;
  cycleMode: () => void;
}

const SidebarContext = createContext<SidebarContextProps | undefined>(undefined);

export const useSidebar = () => {
  const context = useContext(SidebarContext);
  if (!context) throw new Error("useSidebar must be used within a SidebarProvider");
  return context;
};

const isValidMode = (value: unknown): value is SidebarMode =>
  value === "docked" || value === "collapsed" || value === "hidden";

export const SidebarProvider = ({ children }: { children: ReactNode }) => {
  const [mode, setModeState] = useState<SidebarMode>("docked");

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isValidMode(saved)) setModeState(saved);
  }, []);

  const setMode = (next: SidebarMode) => {
    setModeState(next);
    localStorage.setItem(STORAGE_KEY, next);
  };

  const cycleMode = () => {
    const i = SIDEBAR_MODES.indexOf(mode);
    setMode(SIDEBAR_MODES[(i + 1) % SIDEBAR_MODES.length]);
  };

  return (
    <SidebarContext.Provider value={{ mode, setMode, cycleMode }}>{children}</SidebarContext.Provider>
  );
};
