"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IoEllipsisHorizontal } from "react-icons/io5";

export interface ActionItem {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  className?: string;
  hidden?: boolean;
}

const ActionsDropdown: React.FC<{ actions: ActionItem[] }> = ({ actions: all }) => {
  const actions = all.filter((a) => !a.hidden);
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onClick = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    const update = () => {
      if (!buttonRef.current) return;
      const rect = buttonRef.current.getBoundingClientRect();
      const width = 208;
      let left = rect.right - width;
      if (left < 8) left = rect.left;
      if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
      setPosition({ top: rect.bottom + 8, left });
    };
    update();
    document.addEventListener("mousedown", onClick);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      document.removeEventListener("mousedown", onClick);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [isOpen]);

  if (actions.length === 0) return null;

  if (actions.length === 1) {
    const a = actions[0];
    return (
      <button
        onClick={a.onClick}
        className={`py-2 px-2.5 inline-flex items-center gap-x-2 text-xs font-medium rounded-xl border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 dark:bg-neutral-800 dark:border-neutral-600 dark:text-white dark:hover:bg-neutral-900 ${
          a.className ?? ""
        }`}
      >
        {a.icon}
        {a.label}
      </button>
    );
  }

  return (
    <div className="relative inline-block text-left" data-actions-menu>
      <button
        ref={buttonRef}
        type="button"
        aria-label="Actions"
        className="inline-flex justify-center px-3 py-2 text-sm font-medium text-neutral-500 dark:text-neutral-400 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-700 focus:outline-none"
        onClick={() => setIsOpen((o) => !o)}
      >
        <IoEllipsisHorizontal className="h-4 w-4" />
      </button>
      {isOpen &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-[9999] w-52 rounded-md bg-white dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 shadow-lg"
            style={{ top: position.top, left: position.left }}
          >
            <div className="py-1" role="menu">
              {actions.map((a) => (
                <button
                  key={a.label}
                  onClick={() => {
                    a.onClick();
                    setIsOpen(false);
                  }}
                  className={`px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-600 w-full text-left flex items-center ${
                    a.className ?? ""
                  }`}
                  role="menuitem"
                >
                  <span className="mr-2">{a.icon}</span>
                  {a.label}
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};

export default ActionsDropdown;
