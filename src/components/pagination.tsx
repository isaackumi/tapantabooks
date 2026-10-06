"use client";

import React from "react";
import { MdKeyboardArrowLeft, MdKeyboardArrowRight } from "react-icons/md";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  summary?: React.ReactNode;
}

const Pagination: React.FC<PaginationProps> = ({ currentPage, totalPages, onPageChange, summary }) => {
  const visiblePages = 3;
  const halfVisible = Math.floor(visiblePages / 2);

  let startPage = Math.max(1, currentPage - halfVisible);
  let endPage = Math.min(totalPages, currentPage + halfVisible);
  if (currentPage <= halfVisible + 1) {
    endPage = Math.min(totalPages, visiblePages);
  } else if (currentPage + halfVisible >= totalPages) {
    startPage = Math.max(1, totalPages - visiblePages + 1);
  }

  const pageClass = (page: number) =>
    `relative inline-flex cursor-pointer rounded-lg items-center justify-center px-3.5 py-2 text-sm font-medium ${
      currentPage === page
        ? "z-10 bg-brand-500 text-white border border-brand-600 hover:bg-brand-600"
        : "bg-white text-neutral-700 hover:bg-neutral-100 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
    }`;

  const pages: React.ReactNode[] = [];
  if (startPage > 1) {
    pages.push(
      <button key={1} onClick={() => onPageChange(1)} className={pageClass(1)}>
        1
      </button>,
    );
    if (startPage > 2) pages.push(<span key="s" className="px-2 text-neutral-500">…</span>);
  }
  for (let i = startPage; i <= endPage; i++) {
    pages.push(
      <button key={i} onClick={() => onPageChange(i)} className={pageClass(i)} aria-label={`Go to page ${i}`}>
        {i}
      </button>,
    );
  }
  if (endPage < totalPages) {
    if (endPage < totalPages - 1) pages.push(<span key="e" className="px-2 text-neutral-500">…</span>);
    pages.push(
      <button key={totalPages} onClick={() => onPageChange(totalPages)} className={pageClass(totalPages)}>
        {totalPages}
      </button>,
    );
  }

  return (
    <div className="mt-4 flex w-full flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-neutral-500 dark:text-neutral-400">{summary}</p>
      <nav className="flex items-center gap-1" aria-label="Pagination">
        <button
          onClick={() => currentPage > 1 && onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="inline-flex items-center px-3 py-2 text-sm font-medium text-neutral-700 rounded-l-md hover:bg-neutral-100 disabled:opacity-40 dark:text-neutral-200 dark:hover:bg-neutral-700"
        >
          <MdKeyboardArrowLeft className="h-5 w-5" />
          Previous
        </button>
        {pages}
        <button
          onClick={() => currentPage < totalPages && onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="inline-flex items-center px-3 py-2 text-sm font-medium text-neutral-700 rounded-r-md hover:bg-neutral-100 disabled:opacity-40 dark:text-neutral-200 dark:hover:bg-neutral-700"
        >
          Next
          <MdKeyboardArrowRight className="h-5 w-5" />
        </button>
      </nav>
    </div>
  );
};

export default Pagination;
