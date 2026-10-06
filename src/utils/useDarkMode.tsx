"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

export type ThemeMode = "system" | "light" | "dark";

interface DarkModeContextProps {
  themeMode: ThemeMode;
  darkMode: boolean;
  setThemeMode: (mode: ThemeMode) => void;
}

const DarkModeContext = createContext<DarkModeContextProps | undefined>(undefined);

export const useDarkMode = () => {
  const context = useContext(DarkModeContext);
  if (!context) throw new Error("useDarkMode must be used within a DarkModeProvider");
  return context;
};

const STORAGE_KEY = "theme";
const VALID: ThemeMode[] = ["system", "light", "dark"];

const systemPrefersDark = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;

const resolveDark = (mode: ThemeMode) => (mode === "system" ? systemPrefersDark() : mode === "dark");

const applyTheme = (mode: ThemeMode) => {
  document.documentElement.classList.toggle("dark", resolveDark(mode));
};

export const DarkModeProvider = ({ children }: { children: ReactNode }) => {
  const [themeMode, setThemeModeState] = useState<ThemeMode>("system");
  const [darkMode, setDarkMode] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    const initial = saved && VALID.includes(saved) ? saved : "system";
    setThemeModeState(initial);
    applyTheme(initial);
    setDarkMode(resolveDark(initial));
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || themeMode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      applyTheme("system");
      setDarkMode(systemPrefersDark());
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [themeMode, mounted]);

  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
    applyTheme(mode);
    setDarkMode(resolveDark(mode));
    localStorage.setItem(STORAGE_KEY, mode);
  };

  // Avoid a light-mode flash before the saved theme is known.
  if (!mounted) return null;

  return (
    <DarkModeContext.Provider value={{ themeMode, darkMode, setThemeMode }}>
      {children}
    </DarkModeContext.Provider>
  );
};
