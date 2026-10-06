"use client";

import { useState } from "react";
import { FiInfo } from "react-icons/fi";

const InfoTooltip = ({ text, label }: { text: React.ReactNode; label: string }) => {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={label}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
      >
        <FiInfo className="h-3.5 w-3.5" />
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-1/2 top-full z-50 mt-2 w-64 -translate-x-1/2 rounded-lg border border-neutral-200 bg-white p-3 text-xs font-normal leading-relaxed text-neutral-600 shadow-lg dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
        >
          {text}
        </span>
      )}
    </span>
  );
};

export default InfoTooltip;
