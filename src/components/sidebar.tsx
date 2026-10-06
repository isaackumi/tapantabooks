"use client";

import { Fragment, useRef, useState } from "react";
import { HiMiniXMark, HiChevronDown, HiChevronUp } from "react-icons/hi2";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { navigation, NavigationItem } from "@/data/sidebarData";
import { useSidebar } from "@/utils/useSidebar";
import { useLedger } from "@/store/ledgerStore";
import { classNames } from "@/utils/format";
import Brand from "./brand";

const isActive = (pathname: string, href: string) =>
  href !== "#" && (pathname === href || (href !== "/reports" && pathname.startsWith(`${href}/`)));

const Sidebar = ({
  sidebarOpen,
  setSidebarOpen,
}: {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}) => {
  const pathname = usePathname();
  const { mode } = useSidebar();
  const { state } = useLedger();

  const badges: Record<string, number> = {
    Journals: state.journals.filter((j) => j.status === "PENDING_APPROVAL").length,
    Reconciliation: state.statementLines.filter((l) => l.status !== "MATCHED").length,
    "Data Sources": state.dataSources.filter((d) => d.status === "ERROR" || d.status === "WARNING").length,
    Imports: state.importBatches.filter((b) => b.status === "NEEDS_REVIEW").length,
  };

  const initialOpen = navigation.find((item) => item.subItems?.some((sub) => pathname === sub.href))?.name ?? null;
  const [openAccordion, setOpenAccordion] = useState<string | null>(initialOpen);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [peek, setPeek] = useState(false);
  const [flyout, setFlyout] = useState<{ name: string; top: number } | null>(null);
  const flyoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openFlyout = (name: string, el: HTMLElement) => {
    if (flyoutTimer.current) clearTimeout(flyoutTimer.current);
    setFlyout({ name, top: el.getBoundingClientRect().top });
  };
  const cancelFlyoutClose = () => {
    if (flyoutTimer.current) clearTimeout(flyoutTimer.current);
  };
  const scheduleFlyoutClose = () => {
    if (flyoutTimer.current) clearTimeout(flyoutTimer.current);
    flyoutTimer.current = setTimeout(() => setFlyout(null), 150);
  };

  const groupedNavigation = navigation.reduce<{ title: string | null; items: NavigationItem[] }[]>(
    (sections, item) => {
      const title = item.group ?? null;
      const last = sections[sections.length - 1];
      if (last && last.title === title) last.items.push(item);
      else sections.push({ title, items: [item] });
      return sections;
    },
    [],
  );

  const badge = (name: string) =>
    badges[name] ? (
      <span className="ml-auto rounded-full bg-brand-100 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
        {badges[name]}
      </span>
    ) : null;

  const renderNavItem = (item: NavigationItem) => {
    const isOpen = openAccordion === item.name;
    return (
      <li key={item.name}>
        {item.subItems ? (
          <>
            <button
              onClick={() => setOpenAccordion((prev) => (prev === item.name ? null : item.name))}
              className="group flex w-full items-center justify-between rounded-lg p-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-700"
            >
              <span className="flex items-center gap-x-3">
                <item.icon className="h-5 w-5" />
                {item.name}
              </span>
              {isOpen ? <HiChevronUp className="h-4 w-4" /> : <HiChevronDown className="h-4 w-4" />}
            </button>
            {isOpen && (
              <div className="mt-1 ml-5 flex flex-col border-l border-neutral-200 pl-3 dark:border-neutral-700">
                {item.subItems.map((subItem) => (
                  <Link
                    key={subItem.name}
                    href={subItem.href}
                    onClick={() => setSidebarOpen(false)}
                    className={classNames(
                      "flex items-center gap-x-3 rounded-lg px-3 py-2 text-sm transition-colors",
                      pathname === subItem.href
                        ? "bg-brand-700/10 font-medium text-brand-700 dark:bg-neutral-700 dark:text-white"
                        : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700",
                    )}
                  >
                    <subItem.icon className="h-4 w-4" />
                    {subItem.name}
                  </Link>
                ))}
              </div>
            )}
          </>
        ) : (
          <Link
            href={item.href}
            data-nav={item.href}
            onClick={() => setSidebarOpen(false)}
            className={classNames(
              "group flex items-center gap-x-3 rounded-lg p-2 text-sm font-medium transition-colors",
              isActive(pathname, item.href)
                ? "bg-brand-700/10 text-brand-700 dark:bg-neutral-700 dark:text-white"
                : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-700",
            )}
          >
            <item.icon className="h-5 w-5" />
            {item.name}
            {badge(item.name)}
          </Link>
        )}
      </li>
    );
  };

  const navList = (
    <ul role="list" className="flex flex-1 flex-col gap-y-1">
      {groupedNavigation.map((section, sectionIdx) => (
        <li
          key={section.title ?? `section-${sectionIdx}`}
          className={section.title && sectionIdx > 0 ? "mt-4" : undefined}
          data-nav-group={section.title ?? undefined}
        >
          <ul role="list" className="flex flex-col gap-y-1">
            {section.title && (
              <li>
                <button
                  type="button"
                  onClick={() => setCollapsedGroups((p) => ({ ...p, [section.title!]: !p[section.title!] }))}
                  className="flex w-full items-center justify-between rounded-md px-2 py-1 text-xs font-semibold uppercase tracking-wide text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
                >
                  {section.title}
                  {collapsedGroups[section.title] ? (
                    <HiChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <HiChevronUp className="h-3.5 w-3.5" />
                  )}
                </button>
              </li>
            )}
            {(!section.title || !collapsedGroups[section.title]) && section.items.map(renderNavItem)}
          </ul>
        </li>
      ))}
    </ul>
  );

  const navListCollapsed = (
    <ul role="list" className="flex flex-1 flex-col items-center gap-y-1">
      {navigation.map((item) => {
        const parentActive = item.subItems
          ? item.subItems.some((sub) => pathname === sub.href)
          : isActive(pathname, item.href);
        const iconClasses = classNames(
          "relative flex w-full items-center justify-center rounded-lg p-2.5 transition-colors",
          parentActive
            ? "bg-brand-700/10 text-brand-700 dark:bg-neutral-700 dark:text-white"
            : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-700",
        );
        const dot = badges[item.name] ? (
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-brand-500" />
        ) : null;
        return (
          <li
            key={item.name}
            className="w-full"
            onMouseEnter={(e) => openFlyout(item.name, e.currentTarget)}
            onMouseLeave={scheduleFlyoutClose}
          >
            {item.subItems ? (
              <button type="button" onClick={(e) => openFlyout(item.name, e.currentTarget)} className={iconClasses}>
                <item.icon className="h-5 w-5" />
              </button>
            ) : (
              <Link href={item.href} data-nav={item.href} onClick={() => setFlyout(null)} className={iconClasses}>
                <item.icon className="h-5 w-5" />
                {dot}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );

  const isCollapsed = mode === "collapsed";
  const isHidden = mode === "hidden";

  const flyoutItem = flyout ? navigation.find((i) => i.name === flyout.name) : null;
  const flyoutNode =
    flyout && flyoutItem ? (
      <div
        onMouseEnter={cancelFlyoutClose}
        onMouseLeave={scheduleFlyoutClose}
        style={{ top: flyout.top, left: 72 }}
        className="fixed z-[60] pl-2"
      >
        <div className="sidebar-scroll max-h-[80vh] min-w-[210px] overflow-y-auto rounded-lg border border-neutral-200 bg-white p-2 shadow-xl dark:border-neutral-700 dark:bg-neutral-800">
          <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">{flyoutItem.name}</p>
          {flyoutItem.subItems ? (
            <div className="flex flex-col gap-y-0.5">
              {flyoutItem.subItems.map((subItem) => (
                <Link
                  key={subItem.name}
                  href={subItem.href}
                  onClick={() => setFlyout(null)}
                  className={classNames(
                    "flex items-center gap-x-3 rounded-md px-2 py-1.5 text-sm transition-colors",
                    pathname === subItem.href
                      ? "bg-brand-700/10 font-medium text-brand-700 dark:bg-neutral-700 dark:text-white"
                      : "text-neutral-600 hover:bg-neutral-100 dark:text-white dark:hover:bg-neutral-700",
                  )}
                >
                  <subItem.icon className="h-4 w-4" />
                  {subItem.name}
                </Link>
              ))}
            </div>
          ) : (
            <Link
              href={flyoutItem.href}
              onClick={() => setFlyout(null)}
              className="flex items-center gap-x-3 rounded-md px-2 py-1.5 text-sm text-neutral-600 hover:bg-neutral-100 dark:text-white dark:hover:bg-neutral-700"
            >
              <flyoutItem.icon className="h-4 w-4" />
              {flyoutItem.name}
              {badge(flyoutItem.name)}
            </Link>
          )}
        </div>
      </div>
    ) : null;

  return (
    <aside>
      {/* Mobile drawer */}
      <div
        className={classNames(
          "fixed inset-0 z-50 flex lg:hidden transition-opacity duration-300 ease-in-out",
          sidebarOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <div className="fixed inset-0 bg-neutral-900/80" onClick={() => setSidebarOpen(false)} />
        <div
          className={classNames(
            "relative flex w-full max-w-[260px] flex-1 flex-col bg-white transition-transform duration-300 ease-in-out dark:bg-neutral-800",
            sidebarOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="flex items-center justify-between px-6 pt-6">
            <Brand />
            <button
              onClick={() => setSidebarOpen(false)}
              className="text-neutral-500 hover:text-neutral-700 dark:text-neutral-300 dark:hover:text-white"
            >
              <HiMiniXMark className="h-6 w-6" />
            </button>
          </div>
          <nav className="sidebar-scroll mt-6 flex flex-1 flex-col overflow-y-auto px-4 pb-4">{navList}</nav>
        </div>
      </div>

      {/* Desktop: one drawer that slides and resizes for every mode */}
      <div className="hidden lg:block">
        {isHidden && <div className="fixed inset-y-0 left-0 z-40 w-2.5" onMouseEnter={() => setPeek(true)} />}
        <div
          onMouseLeave={() => isHidden && setPeek(false)}
          className={classNames(
            "fixed inset-y-0 left-0 flex flex-col transition-[width,transform] duration-300 ease-in-out",
            isHidden ? "z-50" : "z-30",
            isCollapsed ? "w-[72px]" : "w-[250px]",
            isHidden && !peek ? "-translate-x-full" : "translate-x-0",
          )}
        >
          <div
            className={classNames(
              "flex min-h-0 grow flex-col border-r border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800",
              isHidden ? "shadow-2xl" : "",
            )}
            data-tour="sidebar"
          >
            <div className={classNames("flex shrink-0 items-center pt-6", isCollapsed ? "justify-center px-2" : "px-6")}>
              <Brand collapsed={isCollapsed} />
            </div>
            <nav
              className={classNames(
                "sidebar-scroll mt-6 flex min-h-0 flex-1 flex-col overflow-y-auto pb-4",
                isCollapsed ? "px-2" : "px-4",
              )}
            >
              {isCollapsed ? navListCollapsed : navList}
            </nav>
          </div>
          {isCollapsed && flyoutNode}
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
