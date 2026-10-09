"use client";

import { FiAlertTriangle, FiRefreshCw } from "react-icons/fi";
import { Button, Callout } from "@/components/ui";
import type { ApiQueryResult } from "@/services/useApiQuery";
import { classNames } from "@/utils/format";

/** Grey placeholder rows shown while a report or list loads for the first time. */
export const Skeleton = ({ rows = 6, className }: { rows?: number; className?: string }) => (
  <div aria-busy="true" className={classNames("animate-pulse space-y-3 py-2", className)}>
    <span className="sr-only">Loading…</span>
    {Array.from({ length: rows }, (_, i) => (
      <div key={i} className="flex items-center gap-4">
        <div className="h-3 flex-1 rounded bg-neutral-200 dark:bg-neutral-700" style={{ maxWidth: `${60 + ((i * 17) % 35)}%` }} />
        <div className="h-3 w-24 rounded bg-neutral-200 dark:bg-neutral-700" />
      </div>
    ))}
  </div>
);

export const QueryError = ({ message, onRetry, className }: { message: string; onRetry?: () => void; className?: string }) => (
  <Callout tone="danger" icon={FiAlertTriangle} title="Could not load this data" className={className}>
    <div className="flex flex-wrap items-center gap-3">
      <span>{message}</span>
      {onRetry && (
        <Button size="sm" variant="secondary" icon={FiRefreshCw} onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  </Callout>
);

/**
 * Renders the loading, error and empty states of an API query, and the content once data arrives.
 * A failed refetch keeps the previous data on screen with a warning above it.
 */
export function QueryState<T>({
  query,
  children,
  isEmpty,
  empty,
  skeleton,
  className,
}: {
  query: ApiQueryResult<T>;
  children: (data: T) => React.ReactNode;
  isEmpty?: (data: T) => boolean;
  empty?: React.ReactNode;
  skeleton?: React.ReactNode;
  className?: string;
}) {
  const { data, error, loading, refetch } = query;
  if (data === null) {
    if (error) return <QueryError message={error} onRetry={refetch} className={className} />;
    if (loading) return <div className={className}>{skeleton ?? <Skeleton />}</div>;
    return null;
  }
  return (
    <div className={className} aria-busy={loading}>
      {error && <QueryError message={`Showing the last figures loaded. ${error}`} onRetry={refetch} className="mb-4" />}
      <div className={classNames("transition-opacity", loading && "opacity-60")}>
        {isEmpty?.(data) && empty ? empty : children(data)}
      </div>
    </div>
  );
}
