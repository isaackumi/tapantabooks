"use client";

import { useDarkMode } from "@/utils/useDarkMode";

export const useChartTheme = () => {
  const { darkMode } = useDarkMode();
  return {
    grid: darkMode ? "#404040" : "#e5e5e5",
    axis: darkMode ? "#a3a3a3" : "#737373",
    tooltipBg: darkMode ? "#262626" : "#ffffff",
    tooltipBorder: darkMode ? "#404040" : "#e5e5e5",
    tooltipText: darkMode ? "#f5f5f5" : "#171717",
    brand: "#ce1440",
    brandSoft: darkMode ? "#8f1033" : "#ffc6d1",
    rose: "#f43f5e",
    emerald: "#10b981",
    amber: "#f59e0b",
    sky: "#0ea5e9",
  };
};
