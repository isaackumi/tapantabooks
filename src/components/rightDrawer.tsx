"use client";

import { Fragment } from "react";
import { Dialog, DialogPanel, Transition, TransitionChild } from "@headlessui/react";
import { IoCloseCircle } from "react-icons/io5";

interface RightDrawerProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Rendered on the right of the header (e.g. a primary action button). */
  headerAction?: React.ReactNode;
  /** Sticky footer, typically the document's actions. */
  footer?: React.ReactNode;
  /** Tailwind max-width class for the panel, e.g. "max-w-md", "max-w-3xl". */
  widthClass?: string;
  children: React.ReactNode;
}

const RightDrawer: React.FC<RightDrawerProps> = ({
  open,
  onClose,
  title,
  subtitle,
  headerAction,
  footer,
  widthClass = "max-w-md",
  children,
}) => {
  return (
    <Transition appear show={open} as={Fragment}>
      <Dialog as="div" onClose={onClose} className="relative z-40">
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/30 dark:bg-black/50" />
        </TransitionChild>

        <div className="fixed inset-0 overflow-hidden">
          <div className="absolute inset-y-0 right-0 flex max-w-full pl-10">
            <TransitionChild
              as={Fragment}
              enter="transform transition ease-in-out duration-300"
              enterFrom="translate-x-full"
              enterTo="translate-x-0"
              leave="transform transition ease-in-out duration-200"
              leaveFrom="translate-x-0"
              leaveTo="translate-x-full"
            >
              <DialogPanel className={`flex h-full w-screen ${widthClass} flex-col bg-white dark:bg-neutral-800`}>
                <div className="flex items-start justify-between gap-3 border-b border-neutral-200 px-5 py-4 dark:border-neutral-700">
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">{title}</h2>
                    {subtitle && (
                      <div className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">{subtitle}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {headerAction}
                    <button
                      onClick={onClose}
                      className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                    >
                      <span className="sr-only">Close</span>
                      <IoCloseCircle className="h-6 w-6" />
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
                {footer && (
                  <div className="border-t border-neutral-200 px-5 py-3 dark:border-neutral-700">{footer}</div>
                )}
              </DialogPanel>
            </TransitionChild>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

export default RightDrawer;
