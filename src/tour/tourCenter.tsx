"use client";

import "driver.js/dist/driver.css";
import "./tour.css";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { driver, type Driver, type DriveStep, type PopoverDOM } from "driver.js";
import toast from "react-hot-toast";
import { FiCheck, FiClock, FiHelpCircle, FiMapPin, FiPlay, FiRotateCcw } from "react-icons/fi";
import RightDrawer from "@/components/rightDrawer";
import { classNames } from "@/utils/format";
import { TOURS, TOUR_CATEGORIES, selectorFor, tourById, type Tour } from "./tours";

const STORAGE_KEY = "tvs-tours";

type Progress = { completed: string[]; welcomeSeen: boolean };

const EMPTY: Progress = { completed: [], welcomeSeen: false };

const routeOf = (tour: Tour, index: number) => tour.steps[index]?.route ?? tour.route;

const minutesFor = (tour: Tour) => Math.max(1, Math.round(tour.steps.length / 5));

const pagesFor = (tour: Tour) => new Set(tour.steps.map((_, i) => routeOf(tour, i))).size;

const isShown = (el: Element) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.right > 0 && r.left < window.innerWidth;
};

const find = (target?: string) =>
  target ? Array.from(document.querySelectorAll(selectorFor(target))).find(isShown) : undefined;

const waitFor = (check: () => unknown, timeout: number) =>
  new Promise<boolean>((resolve) => {
    if (check()) return resolve(true);
    const started = Date.now();
    const tick = () => {
      if (check()) resolve(true);
      else if (Date.now() - started >= timeout) resolve(false);
      else window.setTimeout(tick, 60);
    };
    window.setTimeout(tick, 60);
  });

/** Waits for layout to settle; the timeout covers hosts that throttle animation frames. */
const nextFrame = () =>
  new Promise<void>((resolve) => {
    const fallback = window.setTimeout(resolve, 120);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        window.clearTimeout(fallback);
        resolve();
      }),
    );
  });

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));

interface TourContextValue {
  start: (id: string) => void;
  openCenter: () => void;
  completed: Set<string>;
  pageTours: Tour[];
}

const TourContext = createContext<TourContextValue | null>(null);

export const useTours = () => {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTours must be used inside TourProvider");
  return ctx;
};

export const TourProvider = ({ children }: { children: React.ReactNode }) => {
  const router = useRouter();
  const pathname = usePathname();
  const [progress, setProgress] = useState<Progress>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [centerOpen, setCenterOpen] = useState(false);
  const run = useRef<{ drv: Driver; tour: Tour } | null>(null);
  const moving = useRef(false);
  const progressRef = useRef(progress);
  progressRef.current = progress;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setProgress({ ...EMPTY, ...JSON.parse(raw) });
    } catch {
      // Corrupt or blocked storage: start fresh.
    }
    setLoaded(true);
  }, []);

  const save = useCallback((update: (p: Progress) => Progress) => {
    setProgress((prev) => {
      const next = update(prev);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Progress is a convenience; ignore storage failures.
      }
      return next;
    });
  }, []);

  /** Brings the page into the state a step expects: right route, right tab, target rendered. */
  const prepare = useCallback(
    async (tour: Tour, index: number) => {
      const step = tour.steps[index];
      const route = routeOf(tour, index);
      let moved = false;
      if (window.location.pathname !== route) {
        const notice = window.setTimeout(() => toast.loading("Opening page…", { id: "tour-nav" }), 500);
        router.push(route);
        await waitFor(() => window.location.pathname === route, 15000);
        window.clearTimeout(notice);
        toast.dismiss("tour-nav");
        moved = true;
      }
      if (step.tab) {
        await waitFor(() => find(`tab:${step.tab}`), 4000);
        const tab = find(`tab:${step.tab}`) as HTMLElement | undefined;
        if (tab && tab.getAttribute("aria-selected") !== "true") {
          tab.click();
          moved = true;
        }
      }
      if (step.target) await waitFor(() => find(step.target), moved ? 4000 : 250);
      await nextFrame();
    },
    [router],
  );

  const setBusy = (drv: Driver, busy: boolean) => {
    const pop = drv.getState("popover") as PopoverDOM | undefined;
    if (!pop) return;
    pop.nextButton.dataset.busy = String(busy);
    pop.previousButton.dataset.busy = String(busy);
  };

  const finish = useCallback(() => {
    const current = run.current;
    if (!current) return;
    const done = new Set([...progressRef.current.completed, current.tour.id]);
    save((p) => ({ ...p, completed: [...new Set([...p.completed, current.tour.id])] }));
    current.drv.destroy();
    toast.success(`${current.tour.title}: done. ${done.size} of ${TOURS.length} tours completed. Press ? for more.`, { duration: 5000 });
  }, [save]);

  const decorate = useCallback((pop: PopoverDOM, tour: Tour, index: number, el: Element | undefined) => {
    const total = tour.steps.length;
    const centred = !el || el.id === "driver-dummy-element";
    const opening = index === 0 && centred;
    pop.wrapper.classList.toggle("tvs-tour-centered", centred);
    pop.wrapper.classList.toggle("tvs-tour-has-hero", opening);

    const head = document.createElement("div");
    head.className = "tvs-tour-head";
    head.innerHTML = `<span class="tvs-tour-chip">${escapeHtml(tour.title)}</span><span class="tvs-tour-count">${index + 1} of ${total}</span>`;
    const bar = document.createElement("div");
    bar.className = "tvs-tour-bar";
    bar.innerHTML = `<span style="width:${((index + 1) / total) * 100}%"></span>`;
    pop.title.before(head, bar);

    if (opening) {
      const pages = pagesFor(tour);
      const hero = document.createElement("div");
      hero.className = "tvs-tour-hero";
      hero.innerHTML = `<div class="tvs-tour-hero-kicker">Guided tour</div><div class="tvs-tour-hero-meta">${total} steps · about ${minutesFor(tour)} min${
        pages > 1 ? ` · visits ${pages} pages` : ""
      }</div>`;
      head.before(hero);
      bar.style.display = "none";
    }

    pop.progress.style.display = "block";
    pop.progress.innerHTML = "<kbd>←</kbd><kbd>→</kbd> to move";
    if (index === 0) pop.previousButton.style.display = "none";
    if (index === total - 1) pop.nextButton.innerHTML = "Finish";
    else if (index === 0) pop.nextButton.innerHTML = opening ? "Start tour" : "Next";
  }, []);

  const go = useCallback(
    async (index: number) => {
      const current = run.current;
      if (!current || moving.current) return;
      const { drv, tour } = current;
      moving.current = true;
      setBusy(drv, true);
      try {
        await prepare(tour, index);
      } finally {
        moving.current = false;
      }
      if (run.current !== current) return;
      drv.drive(index);
    },
    [prepare],
  );

  const start = useCallback(
    async (id: string) => {
      const tour = tourById(id);
      if (!tour) return;
      run.current?.drv.destroy();
      moving.current = false;
      const wasOpen = centerOpen;
      setCenterOpen(false);
      if (id === "welcome") save((p) => ({ ...p, welcomeSeen: true }));

      const steps: DriveStep[] = tour.steps.map((s, i) => ({
        element: s.target
          ? () => (window.location.pathname === routeOf(tour, i) ? find(s.target) : undefined) as Element
          : undefined,
        popover: { title: s.title, description: s.body, side: s.side ?? "bottom", align: s.align ?? "start" },
      }));

      const drv = driver({
        steps,
        animate: true,
        smoothScroll: true,
        allowClose: true,
        overlayClickBehavior: "none",
        overlayColor: "#0a0a0a",
        overlayOpacity: 0.55,
        stagePadding: 8,
        stageRadius: 12,
        popoverOffset: 8,
        disableActiveInteraction: true,
        popoverClass: "tvs-tour",
        nextBtnText: "Next",
        prevBtnText: "Back",
        doneBtnText: "Finish",
        onNextClick: (_el, _step, { state }) => {
          const i = state.activeIndex ?? 0;
          if (i >= steps.length - 1) finish();
          else void go(i + 1);
        },
        onPrevClick: (_el, _step, { state }) => {
          const i = state.activeIndex ?? 0;
          if (i > 0) void go(i - 1);
        },
        onPopoverRender: (pop, { state }) => decorate(pop, tour, state.activeIndex ?? 0, state.activeElement),
        onDestroyed: () => {
          if (run.current?.drv === drv) run.current = null;
        },
      });
      run.current = { drv, tour };

      if (wasOpen) await new Promise((r) => window.setTimeout(r, 280));
      await prepare(tour, 0);
      if (run.current?.drv === drv) drv.drive(0);
    },
    [centerOpen, decorate, finish, go, prepare, save],
  );

  useEffect(() => {
    if (!loaded || progress.welcomeSeen || pathname !== "/dashboard" || run.current) return;
    const timer = window.setTimeout(() => void start("welcome"), 900);
    return () => window.clearTimeout(timer);
  }, [loaded, pathname, progress.welcomeSeen, start]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "?" || e.metaKey || e.ctrlKey || isTyping(e.target) || run.current) return;
      e.preventDefault();
      setCenterOpen((o) => !o);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => () => run.current?.drv.destroy(), []);

  const completed = useMemo(() => new Set(progress.completed), [progress.completed]);
  const pageTours = useMemo(() => TOURS.filter((t) => t.route === pathname), [pathname]);

  const value = useMemo<TourContextValue>(
    () => ({ start: (id) => void start(id), openCenter: () => setCenterOpen(true), completed, pageTours }),
    [start, completed, pageTours],
  );

  return (
    <TourContext.Provider value={value}>
      {children}
      <TourCenter
        open={centerOpen}
        onClose={() => setCenterOpen(false)}
        onReset={() => {
          save(() => ({ completed: [], welcomeSeen: true }));
          toast.success("Tour progress cleared");
        }}
      />
    </TourContext.Provider>
  );
};

const Kbd = ({ children }: { children: React.ReactNode }) => (
  <kbd className="inline-flex min-w-5 items-center justify-center rounded border border-b-2 border-neutral-200 bg-white px-1 font-mono text-[11px] leading-[18px] text-neutral-700 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200">
    {children}
  </kbd>
);

const TourCenter = ({ open, onClose, onReset }: { open: boolean; onClose: () => void; onReset: () => void }) => {
  const { start, completed, pageTours } = useTours();
  const done = TOURS.filter((t) => completed.has(t.id)).length;
  const pct = Math.round((done / TOURS.length) * 100);

  return (
    <RightDrawer
      open={open}
      onClose={onClose}
      title="Guided tours"
      subtitle="Short, step-by-step walkthroughs. Each one takes a few minutes and never changes your data."
      widthClass="max-w-lg"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-neutral-500 dark:text-neutral-400">
          <span className="flex flex-wrap items-center gap-1.5">
            <Kbd>?</Kbd> opens this panel <span className="mx-1 text-neutral-300">·</span>
            <Kbd>←</Kbd>
            <Kbd>→</Kbd> move <span className="mx-1 text-neutral-300">·</span>
            <Kbd>Esc</Kbd> exits
          </span>
          {done > 0 && (
            <button onClick={onReset} className="inline-flex items-center gap-1 font-medium hover:text-neutral-800 dark:hover:text-neutral-200">
              <FiRotateCcw className="h-3 w-3" /> Reset progress
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-7">
        <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-700">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium text-neutral-900 dark:text-neutral-100">Your progress</span>
            <span className="tabular-nums text-neutral-500 dark:text-neutral-400">
              {done} of {TOURS.length} completed
            </span>
          </div>
          <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-700">
            <div className="h-2 rounded-full bg-gradient-to-r from-brand-500 to-brand-700 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {pageTours.length > 0 && (
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 p-5 text-white">
            <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-white/10" />
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-white/75">
              <FiMapPin className="h-3.5 w-3.5" /> On this page
            </p>
            <div className="mt-3 space-y-4">
              {pageTours.map((t) => (
                <div key={t.id} className="relative flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold">{t.title}</p>
                    <p className="mt-0.5 text-sm text-white/80">{t.summary}</p>
                  </div>
                  <button
                    onClick={() => start(t.id)}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-brand-700 shadow-sm transition hover:bg-brand-50"
                  >
                    {completed.has(t.id) ? <FiRotateCcw className="h-4 w-4" /> : <FiPlay className="h-4 w-4" />}
                    {completed.has(t.id) ? "Replay" : "Start"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {TOUR_CATEGORIES.map((category) => (
          <section key={category}>
            <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-neutral-400">{category}</h3>
            <ul className="space-y-2">
              {TOURS.filter((t) => t.category === category).map((t) => {
                const isDone = completed.has(t.id);
                const pages = pagesFor(t);
                return (
                  <li key={t.id}>
                    <button
                      onClick={() => start(t.id)}
                      className="group flex w-full items-start gap-3 rounded-xl border border-neutral-200 p-3.5 text-left transition hover:border-brand-300 hover:bg-brand-50/40 dark:border-neutral-700 dark:hover:border-brand-800 dark:hover:bg-brand-900/10"
                    >
                      <span
                        className={classNames(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                          isDone
                            ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400"
                            : "bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300",
                        )}
                      >
                        {isDone ? <FiCheck className="h-5 w-5" /> : <t.icon className="h-5 w-5" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="font-medium text-neutral-900 dark:text-neutral-100">{t.title}</span>
                          {isDone && (
                            <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                              Done
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block text-sm text-neutral-500 dark:text-neutral-400">{t.summary}</span>
                        <span className="mt-1.5 flex items-center gap-1 text-xs text-neutral-400">
                          <FiClock className="h-3 w-3" />
                          {minutesFor(t)} min · {t.steps.length} steps{pages > 1 ? ` · ${pages} pages` : ""}
                        </span>
                      </span>
                      <span className="flex items-center gap-1 self-center text-sm font-medium text-brand-700 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100 dark:text-brand-300">
                        {isDone ? "Replay" : "Start"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </RightDrawer>
  );
};

/** Header button that opens the tour list; pulses when this page has a tour not yet taken. */
export const TourButton = () => {
  const { openCenter, completed, pageTours } = useTours();
  const pending = pageTours.some((t) => !completed.has(t.id));
  return (
    <button
      type="button"
      onClick={openCenter}
      data-tour="help-button"
      title="Guided tours (press ?)"
      className="relative inline-flex rounded-lg p-2 text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700"
    >
      <span className="sr-only">Guided tours</span>
      <FiHelpCircle className="h-5 w-5" />
      {pending && (
        <span className="absolute right-1.5 top-1.5 flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full border-2 border-white bg-brand-600 dark:border-neutral-800" />
        </span>
      )}
    </button>
  );
};
