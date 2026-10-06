"use client";

import { Fragment } from "react";
import { Dialog, DialogPanel, DialogTitle, Transition, TransitionChild } from "@headlessui/react";
import { IoCloseCircle } from "react-icons/io5";

export type ModalButton = {
  label: string;
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
  className?: string;
  disabled?: boolean;
  icon?: React.ReactNode;
};

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children?: React.ReactNode;
  buttons?: ModalButton[];
  size?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "5xl";
};

const sizeClasses = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
  "4xl": "max-w-4xl",
  "5xl": "max-w-5xl",
};

export const BTN_PRIMARY = "bg-brand-600 dark:bg-brand-700 hover:bg-brand-700 text-white disabled:opacity-50";
export const BTN_SECONDARY =
  "bg-neutral-100 text-neutral-900 hover:bg-neutral-200 dark:bg-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-600";
export const BTN_DANGER = "bg-red-600 hover:bg-red-700 text-white disabled:opacity-50";

export const Modal = ({ open, onClose, title, description, children, buttons = [], size = "md" }: ModalProps) => {
  return (
    <Transition appear show={open} as={Fragment}>
      <Dialog as="div" onClose={onClose} className="relative z-50">
        <TransitionChild
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/20 dark:bg-black/50" />
        </TransitionChild>

        <div className="fixed inset-0 flex items-center justify-center p-4 text-center">
          <TransitionChild
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0 translate-y-4 sm:scale-95"
            enterTo="opacity-100 translate-y-0 sm:scale-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100 translate-y-0 sm:scale-100"
            leaveTo="opacity-0 translate-y-4 sm:scale-95"
          >
            <DialogPanel
              className={`w-full relative ${sizeClasses[size]} transform overflow-hidden rounded-lg bg-white dark:bg-neutral-800 p-6 lg:p-8 text-left shadow-xl transition-all`}
            >
              <div className="absolute top-4 right-5">
                <button
                  type="button"
                  onClick={onClose}
                  className="text-neutral-400 cursor-pointer hover:text-neutral-500 focus:outline-none"
                >
                  <span className="sr-only">Close</span>
                  <IoCloseCircle className="h-6 w-6" />
                </button>
              </div>

              {title && (
                <DialogTitle as="h3" className="text-md font-semibold text-neutral-800 dark:text-neutral-100">
                  {title}
                </DialogTitle>
              )}
              {description && <p className="text-sm pt-2 text-neutral-600 dark:text-neutral-300">{description}</p>}
              <hr className="border border-neutral-200 dark:border-neutral-600 mt-4" />

              <div className="mt-4 max-h-[62vh] overflow-y-auto pr-2">{children}</div>

              {buttons.length > 0 && (
                <div className="mt-6 flex justify-between gap-3">
                  {buttons.map((button, index) => (
                    <button
                      key={index}
                      type={button.type || "button"}
                      onClick={button.onClick}
                      disabled={button.disabled}
                      className={`inline-flex items-center gap-2 justify-center cursor-pointer rounded-md px-4 py-2 text-sm font-medium disabled:cursor-not-allowed ${button.className}`}
                    >
                      {button.icon} {button.label}
                    </button>
                  ))}
                </div>
              )}
            </DialogPanel>
          </TransitionChild>
        </div>
      </Dialog>
    </Transition>
  );
};
