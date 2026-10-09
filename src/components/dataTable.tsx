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
import type { ListSort, PagedList } from "@/services/useApiQuery";
import type { ListData } from "@/core/apiClient";

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
  /** Keep every cell on one line; the table scrolls sideways instead. For dense transaction lists. */
  nowrap?: boolean;
  /**
   * Server-side paging and sorting: `data` is one page and column ids are the API's `sort_by` fields.
   * Set `enableSorting: false` on columns the API cannot sort by.
   */
  server?: {
    page: number;
    size: number;
    total: number;
    onPageChange: (page: number) => void;
    sort: ListSort | null;
    onSortChange: (sort: ListSort | null) => void;
  };
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
  nowrap = false,
  server,
}: DataTableProps<T>) => {
  const [localSorting, setLocalSorting] = useState<SortingState>([]);
  const [localPagination, setLocalPagination] = useState({ pageIndex: 0, pageSize: pageSize || 100000 });

  // Filters and tabs change the data; start again from page one.
  useEffect(() => {
    if (!server) setLocalPagination((p) => ({ ...p, pageIndex: 0 }));
  }, [data.length, server]);

  const sorting: SortingState = server ? (server.sort ? [{ id: server.sort.by, desc: server.sort.order === "desc" }] : []) : localSorting;
  const pagination = server ? { pageIndex: server.page - 1, pageSize: server.size } : localPagination;

  const table = useReactTable({
    data,
    columns,
    state: { sorting, pagination },
    onSortingChange: (updater) => {
      if (!server) return setLocalSorting(updater);
      const next = typeof updater === "function" ? updater(sorting) : updater;
      server.onSortChange(next[0] ? { by: next[0].id, order: next[0].desc ? "desc" : "asc" } : null);
    },
    onPaginationChange: (updater) => {
      if (!server) return setLocalPagination(updater);
      const next = typeof updater === "function" ? updater(pagination) : updater;
      server.onPageChange(next.pageIndex + 1);
    },
    manualSorting: !!server,
    manualPagination: !!server,
    pageCount: server ? Math.max(1, Math.ceil(server.total / server.size)) : undefined,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  if (data.length === 0 && !prefixRows) {
    return <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} actions={emptyActions} />;
  }

  const padX = dense ? (nowrap ? "px-3" : "px-4") : "px-6";
  const cellPad = `${padX} ${dense ? "py-2.5" : "py-4"}${nowrap ? " whitespace-nowrap" : ""}`;
  const pageCount = table.getPageCount();
  const { pageIndex } = table.getState().pagination;
  const totalRows = server ? server.total : data.length;
  const first = pageIndex * pagination.pageSize + 1;
  const last = Math.min(totalRows, (pageIndex + 1) * pagination.pageSize);

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
                    <th key={header.id} className={`${padX} ${dense ? "py-2.5" : "py-3"} whitespace-nowrap`}>
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
      {(server || pageSize > 0) && pageCount > 1 && (
        <Pagination
          currentPage={pageIndex + 1}
          totalPages={pageCount}
          onPageChange={(p) => table.setPageIndex(p - 1)}
          summary={`Showing ${first}–${last} of ${totalRows}`}
        />
      )}
    </div>
  );
};

/** `server` props for a page from `usePagedList`. */
export const serverPaging = <T,>(list: PagedList<T, ListData<T>>): NonNullable<DataTableProps<object>["server"]> => ({
  page: list.page,
  size: list.size,
  total: list.pagination?.total ?? list.items.length,
  onPageChange: list.setPage,
  sort: list.sort,
  onSortChange: list.setSort,
});

export default DataTable;
