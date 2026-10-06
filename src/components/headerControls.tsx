"use client";

import { useEffect, useState } from "react";
import { Menu, MenuButton, MenuItem, MenuItems, Transition } from "@headlessui/react";
import { MdDarkMode, MdLightMode, MdComputer } from "react-icons/md";
import { FiCheck, FiChevronDown, FiMaximize, FiMinimize } from "react-icons/fi";
import { HiBars3, HiViewColumns, HiBars3BottomLeft, HiOutlineBuildingOffice2 } from "react-icons/hi2";
import { useDarkMode, type ThemeMode } from "@/utils/useDarkMode";
import { useSidebar, type SidebarMode } from "@/utils/useSidebar";
import { useLedger } from "@/store/ledgerStore";

const themeOptions: { mode: ThemeMode; label: string; icon: React.ReactNode }[] = [
  { mode: "system", label: "System default", icon: <MdComputer size={20} /> },
  { mode: "light", label: "Light mode", icon: <MdLightMode size={20} /> },
  { mode: "dark", label: "Dark mode", icon: <MdDarkMode size={20} /> },
];

const menuTransition = {
  enter: "transition ease-out duration-100",
  enterFrom: "transform opacity-0 scale-95",
  enterTo: "transform opacity-100 scale-100",
  leave: "transition ease-in duration-75",
  leaveFrom: "transform opacity-100 scale-100",
  leaveTo: "transform opacity-0 scale-95",
};

export const DarkModeToggle = () => {
  const { themeMode, darkMode, setThemeMode } = useDarkMode();
  const icon =
    themeMode === "system" ? (
      <MdComputer size={22} className={darkMode ? "text-white" : "text-neutral-800"} />
    ) : darkMode ? (
      <MdLightMode size={22} className="text-white" />
    ) : (
      <MdDarkMode size={22} className="text-neutral-800" />
    );
  return (
    <Menu as="div" className="relative">
      <MenuButton
        aria-label="Theme"
        className="p-2 rounded-full bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 focus:outline-none transition duration-200 cursor-pointer"
      >
        {icon}
      </MenuButton>
      <Transition {...menuTransition}>
        <MenuItems className="absolute right-0 z-10 mt-2 w-48 origin-top-right rounded-md bg-white dark:bg-neutral-800 py-2 shadow-lg ring-1 ring-neutral-900/5 dark:ring-white/10 focus:outline-none">
          {themeOptions.map((option) => (
            <MenuItem key={option.mode}>
              {({ focus }) => (
                <button
                  onClick={() => setThemeMode(option.mode)}
                  className={`${focus ? "bg-neutral-50 dark:bg-neutral-700" : ""} ${
                    themeMode === option.mode ? "text-brand-600 dark:text-brand-400" : "text-neutral-900 dark:text-neutral-200"
                  } flex items-center gap-3 w-full text-left px-4 py-2 text-sm cursor-pointer`}
                >
                  <span className={themeMode === option.mode ? "" : "text-neutral-500 dark:text-neutral-400"}>
                    {option.icon}
                  </span>
                  <span className="flex-1">{option.label}</span>
                  {themeMode === option.mode && <FiCheck size={16} />}
                </button>
              )}
            </MenuItem>
          ))}
        </MenuItems>
      </Transition>
    </Menu>
  );
};

const SIDEBAR_CONFIG: Record<SidebarMode, { Icon: typeof HiBars3; label: string; next: string }> = {
  hidden: { Icon: HiBars3, label: "Sidebar hidden", next: "dock sidebar" },
  docked: { Icon: HiViewColumns, label: "Sidebar docked", next: "collapse sidebar" },
  collapsed: { Icon: HiBars3BottomLeft, label: "Sidebar collapsed", next: "hide sidebar" },
};

export const SidebarModeToggle = () => {
  const { mode, cycleMode } = useSidebar();
  const { Icon, label, next } = SIDEBAR_CONFIG[mode];
  return (
    <button
      type="button"
      onClick={cycleMode}
      title={`${label} — click to ${next}`}
      className="hidden lg:inline-flex items-center justify-center rounded-lg p-1.5 text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700"
    >
      <span className="sr-only">{`${label}, click to ${next}`}</span>
      <Icon className="h-5 w-5" aria-hidden="true" />
    </button>
  );
};

export const FullScreenToggle = () => {
  const [isFull, setIsFull] = useState(false);
  useEffect(() => {
    const onChange = () => setIsFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggle = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  };
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isFull ? "Exit full screen" : "Full screen"}
      className="hidden sm:inline-flex p-2 rounded-lg text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700"
    >
      {isFull ? <FiMinimize className="h-5 w-5" /> : <FiMaximize className="h-5 w-5" />}
    </button>
  );
};

/** Scope switcher: legal entity and branch the user is looking at. Display-only in the MVP. */
export const EntitySwitcher = () => {
  const { state } = useLedger();
  const entities = state.dimensions.filter((d) => d.kind === "LEGAL_ENTITY");
  const branches = state.dimensions.filter((d) => d.kind === "BRANCH" && d.is_active);
  const [entity, setEntity] = useState(entities[0]?.id ?? "");
  const [branch, setBranch] = useState("all");
  const entityName = entities.find((e) => e.id === entity)?.name ?? "";
  const branchName = branch === "all" ? "All branches" : branches.find((b) => b.id === branch)?.name ?? "";

  return (
    <Menu as="div" className="relative hidden md:block" data-tour="entity-switcher">
      <MenuButton className="flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-1.5 text-left hover:bg-neutral-50 dark:border-neutral-600 dark:hover:bg-neutral-700">
        <HiOutlineBuildingOffice2 className="h-5 w-5 text-brand-600 dark:text-brand-400" />
        <span className="leading-tight">
          <span className="block text-xs font-semibold text-neutral-900 dark:text-neutral-100">{entityName}</span>
          <span className="block text-[11px] text-neutral-500 dark:text-neutral-400">{branchName}</span>
        </span>
        <FiChevronDown className="h-4 w-4 text-neutral-400" />
      </MenuButton>
      <Transition {...menuTransition}>
        <MenuItems className="absolute right-0 z-10 mt-2 w-64 origin-top-right rounded-md bg-white dark:bg-neutral-800 py-2 shadow-lg ring-1 ring-neutral-900/5 dark:ring-white/10 focus:outline-none">
          <p className="px-4 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Legal entity</p>
          {entities.map((e) => (
            <MenuItem key={e.id}>
              {({ focus }) => (
                <button
                  onClick={() => setEntity(e.id)}
                  className={`${focus ? "bg-neutral-50 dark:bg-neutral-700" : ""} flex w-full items-center justify-between px-4 py-2 text-sm text-neutral-800 dark:text-neutral-200`}
                >
                  {e.name}
                  {entity === e.id && <FiCheck className="text-brand-600" />}
                </button>
              )}
            </MenuItem>
          ))}
          <p className="mt-2 border-t border-neutral-100 px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-neutral-400 dark:border-neutral-700">
            Branch
          </p>
          {[{ id: "all", name: "All branches" }, ...branches].map((b) => (
            <MenuItem key={b.id}>
              {({ focus }) => (
                <button
                  onClick={() => setBranch(b.id)}
                  className={`${focus ? "bg-neutral-50 dark:bg-neutral-700" : ""} flex w-full items-center justify-between px-4 py-2 text-sm text-neutral-800 dark:text-neutral-200`}
                >
                  {b.name}
                  {branch === b.id && <FiCheck className="text-brand-600" />}
                </button>
              )}
            </MenuItem>
          ))}
        </MenuItems>
      </Transition>
    </Menu>
  );
};
