"use client";

import React, { useEffect, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { FaSort, FaSortDown, FaSortUp } from "react-icons/fa";
import { FiInbox } from "react-icons/fi";
import type { IconType } from "react-icons";
import Pagination from "./pagination";
import EmptyState, { type EmptyAction } from "./emptyState";

export type Column<T> = ColumnDef<T, unknown> & { align?: "left" | "right" | "center" };

interface DataTableProps<T extends object> {
  columns: Column<T>[];
  data: T[];
  /** Client-side page size. Pass 0 to show every row. */
  pageSize?: number;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string;
  emptyIcon?: IconType;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyActions?: EmptyAction[];
  /** Extra rows rendered in <tfoot>, e.g. totals. */
  footer?: React.ReactNode;
  /** Extra rows rendered before the data, e.g. an opening balance. */
  prefixRows?: React.ReactNode;
  dense?: boolean;
}

const alignClass = (align?: string) =>
  align === "right" ? "text-right justify-end" : align === "center" ? "text-center justify-center" : "text-left";

const DataTable = <T extends object>({
  columns,
  data,
  pageSize = 15,
  onRowClick,
  rowClassName,
  emptyIcon = FiInbox,
  emptyTitle = "Nothing here yet",
  emptyDescription = "There are no records to show.",
  emptyActions = [],
  footer,
  prefixRows,
  dense = false,
}: DataTableProps<T>) => {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: pageSize || 100000 });

  // Filters and tabs change the data; start again from page one.
  useEffect(() => {
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }, [data.length]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting, pagination },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  if (data.length === 0 && !prefixRows) {
    return <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} actions={emptyActions} />;
  }

  const cellPad = dense ? "px-4 py-2.5" : "px-6 py-4";
  const pageCount = table.getPageCount();
  const { pageIndex } = table.getState().pagination;
  const first = pageIndex * pagination.pageSize + 1;
  const last = Math.min(data.length, (pageIndex + 1) * pagination.pageSize);

  return (
    <div className="w-full" data-tour="table">
      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800">
        <table className="min-w-full divide-y divide-neutral-200 dark:divide-neutral-700">
          <thead className="bg-neutral-50/60 dark:bg-neutral-800">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => {
                  const align = (header.column.columnDef as Column<T>).align;
                  const sortable = header.column.getCanSort();
                  return (
                    <th key={header.id} className={`${dense ? "px-4 py-2.5" : "px-6 py-3"} whitespace-nowrap`}>
                      {header.isPlaceholder ? null : (
                        <div
                          className={`flex items-center gap-x-2 ${alignClass(align)} ${
                            sortable ? "cursor-pointer select-none" : ""
                          }`}
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          <span className="text-sm font-normal text-neutral-500 dark:text-neutral-300">
                            {flexRender(header.column.columnDef.header, header.getContext())}
                          </span>
                          {sortable &&
                            ({
                              asc: <FaSortUp className="w-3.5 h-3.5 text-neutral-400" />,
                              desc: <FaSortDown className="w-3.5 h-3.5 text-neutral-400" />,
                            }[header.column.getIsSorted() as string] ?? (
                              <FaSort className="w-3.5 h-3.5 text-neutral-300 dark:text-neutral-600" />
                            ))}
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
            {prefixRows}
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                onClick={(e) => {
                  const target = e.target as HTMLElement;
                  if (target.closest("button, a, input, select, [data-actions-menu]")) return;
                  onRowClick?.(row.original);
                }}
                className={`${
                  onRowClick ? "cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-700/50 transition-colors" : ""
                } ${rowClassName?.(row.original) ?? ""}`}
              >
                {row.getVisibleCells().map((cell) => {
                  const align = (cell.column.columnDef as Column<T>).align;
                  return (
                    <td key={cell.id} className={`${cellPad} text-sm text-neutral-800 dark:text-neutral-100 ${alignClass(align)}`}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          {footer && (
            <tfoot className="border-t-2 border-neutral-200 bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-900/40">
              {footer}
            </tfoot>
          )}
        </table>
      </div>
      {pageSize > 0 && pageCount > 1 && (
        <Pagination
          currentPage={pageIndex + 1}
          totalPages={pageCount}
          onPageChange={(p) => table.setPageIndex(p - 1)}
          summary={`Showing ${first}–${last} of ${data.length}`}
        />
      )}
    </div>
  );
};

export default DataTable;
