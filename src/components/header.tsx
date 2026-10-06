"use client";

import Link from "next/link";
import toast from "react-hot-toast";
import { HiMiniBars4, HiMagnifyingGlass } from "react-icons/hi2";
import { FiCheck, FiRefreshCw } from "react-icons/fi";
import { Menu, MenuButton, MenuItem, MenuItems, Transition } from "@headlessui/react";
import { useGlobalState } from "@/utils/globalStateContext";
import { ALL_USERS, periodForDate, useCurrentUser, useLedger } from "@/store/ledgerStore";
import { todayIso } from "@/utils/dates";
import { DarkModeToggle, EntitySwitcher, FullScreenToggle, SidebarModeToggle } from "./headerControls";

const initials = (name: string) =>
  name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

const Avatar = ({ name, size = "h-8 w-8" }: { name: string; size?: string }) => (
  <span
    className={`${size} inline-flex items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300`}
  >
    {initials(name)}
  </span>
);

const Separator = () => <div className="h-6 w-px bg-neutral-900/10 dark:bg-white/10 lg:hidden" aria-hidden="true" />;

const Header = ({ setSidebarOpen }: { setSidebarOpen: (open: boolean) => void }) => {
  const { searchQuery, setSearchQuery } = useGlobalState();
  const { state, actions } = useLedger();
  const user = useCurrentUser();
  const period = periodForDate(state, todayIso());

  return (
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center border-b border-neutral-200 dark:border-neutral-700 gap-x-4 bg-white dark:bg-neutral-800 px-4 sm:gap-x-6 sm:px-6 lg:px-8">
      <button
        type="button"
        className="-m-2.5 p-2.5 text-neutral-700 dark:text-white lg:hidden"
        onClick={() => setSidebarOpen(true)}
      >
        <span className="sr-only">Open sidebar</span>
        <HiMiniBars4 className="h-6 w-6" aria-hidden="true" />
      </button>

      <SidebarModeToggle />
      <Separator />

      <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
        <div className="hidden flex-1 max-w-xs m-auto sm:block">
          <label htmlFor="global-search" className="sr-only">
            Search
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <HiMagnifyingGlass className="w-5 h-5 text-neutral-400" aria-hidden="true" />
            </div>
            <input
              id="global-search"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="block w-full py-2 pl-10 pr-3 border dark:text-neutral-200 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 sm:text-sm"
              placeholder="Search this page"
            />
          </div>
        </div>

        <div className="flex flex-1 justify-end items-center gap-x-3 lg:gap-x-5">
          {period && (
            <Link
              href="/accounting/periods"
              className="hidden xl:inline-flex items-center gap-2 rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-600"
            >
              <span
                className={`h-2 w-2 rounded-full ${period.status === "OPEN" ? "bg-emerald-500" : "bg-amber-500"}`}
              />
              {period.name} · {period.status.toLowerCase()}
            </Link>
          )}
          <EntitySwitcher />
          <Separator />
          <FullScreenToggle />
          <DarkModeToggle />
          <Separator />

          <Menu as="div" className="relative">
            <MenuButton className="-m-1.5 flex items-center gap-2 p-1.5">
              <span className="sr-only">Open user menu</span>
              <Avatar name={user.name} />
              <span className="hidden text-left leading-tight lg:block">
                <span className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">{user.name}</span>
                <span className="block text-xs text-neutral-500 dark:text-neutral-400">{user.role}</span>
              </span>
            </MenuButton>
            <Transition
              enter="transition ease-out duration-100"
              enterFrom="transform opacity-0 scale-95"
              enterTo="transform opacity-100 scale-100"
              leave="transition ease-in duration-75"
              leaveFrom="transform opacity-100 scale-100"
              leaveTo="transform opacity-0 scale-95"
            >
              <MenuItems className="absolute right-0 z-10 mt-2.5 w-72 origin-top-right rounded-md bg-white dark:bg-neutral-800 pb-2 shadow-lg ring-1 ring-neutral-900/5 focus:outline-none">
                <div className="py-3 px-5 bg-neutral-100 rounded-t-lg dark:bg-neutral-700">
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">Signed in as</p>
                  <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">{user.name}</p>
                  <p className="text-xs text-neutral-700 dark:text-neutral-300">{user.email}</p>
                </div>
                <p className="px-5 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                  Switch user (demo maker-checker)
                </p>
                {ALL_USERS.map((u) => (
                  <MenuItem key={u.id}>
                    {({ focus }) => (
                      <button
                        onClick={() => {
                          actions.switchUser(u.id);
                          toast.success(`Now acting as ${u.name}`);
                        }}
                        className={`${focus ? "bg-neutral-50 dark:bg-neutral-700" : ""} flex w-full items-center gap-3 px-5 py-2 text-left`}
                      >
                        <Avatar name={u.name} size="h-7 w-7" />
                        <span className="flex-1 leading-tight">
                          <span className="block text-sm text-neutral-900 dark:text-white">{u.name}</span>
                          <span className="block text-xs text-neutral-500 dark:text-neutral-400">{u.role}</span>
                        </span>
                        {u.id === user.id && <FiCheck className="text-brand-600" />}
                      </button>
                    )}
                  </MenuItem>
                ))}
                <div className="my-2 border-t border-neutral-100 dark:border-neutral-700" />
                <MenuItem>
                  {({ focus }) => (
                    <button
                      onClick={() => {
                        actions.resetDemo();
                        toast.success("Demo data reset");
                      }}
                      className={`${focus ? "bg-neutral-50 dark:bg-neutral-700" : ""} flex w-full items-center gap-2 px-5 py-2 text-sm text-neutral-900 dark:text-white`}
                    >
                      <FiRefreshCw className="h-4 w-4" /> Reset demo data
                    </button>
                  )}
                </MenuItem>
              </MenuItems>
            </Transition>
          </Menu>
        </div>
      </div>
    </header>
  );
};

export default Header;
