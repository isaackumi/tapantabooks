"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { FiCheck, FiRefreshCw, FiUploadCloud } from "react-icons/fi";
import { Button, Callout, DetailRow, PageHeader } from "@/components/ui";
import { Tabs } from "@/components/tabs";
import StatCard from "@/components/statCard";
import StatusBadge from "@/components/statusBadge";
import RightDrawer from "@/components/rightDrawer";
import DataTable, { type Column } from "@/components/dataTable";
import ImportWizard from "@/components/integrations/importWizard";
import { useJournalViewer } from "@/components/accounting/journalViewer";
import { useLedger } from "@/store/ledgerStore";
import type { ImportBatch } from "@/models/accounting";
import { matchesSearch, useGlobalState } from "@/utils/globalStateContext";
import { useQueryParam } from "@/utils/useQueryParam";
import { usePending } from "@/services/usePending";
import { fmtCurrency, fmtDateTime } from "@/utils/format";

type Row = ImportBatch & { source: string; valid: number; warnings: number; errors: number; posted: number };

export default function ImportsPage() {
  const { state, actions } = useLedger();
  const { openJournal } = useJournalViewer();
  const { searchQuery } = useGlobalState();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [tab, setTab] = useState("ALL");
  const [viewId, setViewId] = useState<string | null>(null);
  useQueryParam("open", setViewId);

  const sourceName = new Map(state.dataSources.map((s) => [s.id, s.name]));
  const rows: Row[] = state.importBatches.map((b) => ({
    ...b,
    source: sourceName.get(b.source_id) ?? b.source_id,
    valid: b.records.filter((r) => r.status === "VALID").length,
    warnings: b.records.filter((r) => r.status === "WARNING").length,
    errors: b.records.filter((r) => r.status === "ERROR").length,
    posted: b.records.filter((r) => r.posted).length,
  }));
  const filtered = rows.filter(
    (r) =>
      (tab === "ALL" || (tab === "ATTENTION" ? r.status === "NEEDS_REVIEW" || r.status === "FAILED" || r.status === "PARTIALLY_POSTED" : r.status === tab)) &&
      matchesSearch(searchQuery, r.number, r.source, r.entity, r.file_name),
  );
  const viewing = rows.find((r) => r.id === viewId);
  const ready = viewing ? viewing.records.filter((r) => r.status !== "ERROR" && !r.posted).length : 0;

  const { pending, track, anyPending } = usePending();
  const run = (res: { ok: boolean; message?: string; error?: string }) => {
    if (res.ok) toast.success(res.message ?? "Done");
    else toast.error(res.error ?? "Failed");
  };

  const columns: Column<Row>[] = [
    { accessorKey: "number", header: "Batch", cell: ({ row }) => <span className="font-mono text-xs font-medium">{row.original.number}</span> },
    {
      accessorKey: "source",
      header: "Source",
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.original.source}</p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">{row.original.file_name ?? "API / connector"}</p>
        </div>
      ),
    },
    { accessorKey: "entity", header: "Records" },
    {
      id: "rows",
      header: "Rows",
      accessorFn: (r) => r.records.length,
      cell: ({ row }) => (
        <span className="flex items-center gap-2 text-xs">
          <span className="font-medium">{row.original.records.length}</span>
          <span className="text-emerald-600">{row.original.valid} ok</span>
          {row.original.warnings > 0 && <span className="text-amber-600">{row.original.warnings} warn</span>}
          {row.original.errors > 0 && <span className="text-red-600">{row.original.errors} error</span>}
        </span>
      ),
    },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    {
      accessorKey: "created_at",
      header: "Uploaded",
      cell: ({ row }) => (
        <div className="text-xs">
          <p>{fmtDateTime(row.original.created_at)}</p>
          <p className="text-neutral-500">{row.original.created_by}</p>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Imports & migration"
        description="Upload files or pull from other accounting systems. Rows are validated, posted in batches and stay traceable to the source."
        actions={
          <Button icon={FiUploadCloud} onClick={() => setWizardOpen(true)}>
            New import
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" data-tour="stats">
        <StatCard label="Batches" value={rows.length} sub={`${rows.reduce((s, r) => s + r.records.length, 0)} rows received`} />
        <StatCard label="Rows posted" value={rows.reduce((s, r) => s + r.posted, 0)} tone="success" />
        <StatCard label="Rows held" value={rows.reduce((s, r) => s + r.errors, 0)} tone="danger" sub="Failed validation" />
        <StatCard
          label="Need attention"
          value={rows.filter((r) => r.status === "NEEDS_REVIEW" || r.status === "FAILED").length}
          tone="warning"
          sub="Waiting for review or failed"
        />
      </div>

      <Tabs
        tabs={[
          { id: "ALL", label: "All", count: rows.length },
          { id: "ATTENTION", label: "Needs attention", count: rows.filter((r) => ["NEEDS_REVIEW", "FAILED", "PARTIALLY_POSTED"].includes(r.status)).length },
          { id: "POSTED", label: "Posted", count: rows.filter((r) => r.status === "POSTED").length },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div className="mt-4">
        <DataTable
          columns={columns}
          data={filtered}
          onRowClick={(r) => setViewId(r.id)}
          emptyIcon={FiUploadCloud}
          emptyTitle="No imports here"
          emptyDescription="Start one with New import."
          emptyActions={[{ label: "New import", onClick: () => setWizardOpen(true) }]}
        />
      </div>

      <RightDrawer
        open={!!viewing}
        onClose={() => setViewId(null)}
        widthClass="max-w-3xl"
        title={
          viewing && (
            <span className="flex items-center gap-2">
              <span className="font-mono">{viewing.number}</span>
              <StatusBadge status={viewing.status} />
            </span>
          )
        }
        subtitle={viewing && `${viewing.entity} from ${viewing.source}`}
        footer={
          viewing && (
            <div className="flex flex-wrap justify-end gap-2">
              {viewing.journal_id && (
                <Button variant="secondary" onClick={() => openJournal(viewing.journal_id!)}>
                  View journal
                </Button>
              )}
              {ready > 0 && (
                <Button icon={FiCheck} disabled={anyPending} onClick={() => track("post", async () => run(await actions.postImportBatch(viewing.id)))}>
                  {pending("post") ? "Posting…" : `Post ${ready} ready row${ready === 1 ? "" : "s"}`}
                </Button>
              )}
            </div>
          )
        }
      >
        {viewing && (
          <div className="space-y-5">
            {viewing.status === "FAILED" && (
              <Callout tone="danger" title="Nothing was received">
                {viewing.records[0]?.message} Fix the connection in Data sources, then the source resends the batch.
              </Callout>
            )}
            <div className="grid grid-cols-4 gap-3 text-center">
              {[
                { label: "Rows", value: viewing.records.length },
                { label: "Posted", value: viewing.posted },
                { label: "Warnings", value: viewing.warnings },
                { label: "Errors", value: viewing.errors },
              ].map((s) => (
                <div key={s.label} className="rounded-xl bg-neutral-50 p-3 dark:bg-neutral-900/40">
                  <p className="text-xl font-bold tabular-nums">{s.value}</p>
                  <p className="text-xs text-neutral-500">{s.label}</p>
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-neutral-200 px-4 py-1 divide-y divide-neutral-100 dark:border-neutral-700 dark:divide-neutral-700">
              <DetailRow label="File">{viewing.file_name ?? "Received from connector"}</DetailRow>
              <DetailRow label="Uploaded">
                {viewing.created_by} · {fmtDateTime(viewing.created_at)}
              </DetailRow>
              <DetailRow label="Last updated">
                {viewing.updated_by} · {fmtDateTime(viewing.updated_at)}
              </DetailRow>
            </div>
            <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-700">
              <table className="min-w-full text-sm">
                <thead className="bg-neutral-50 text-left text-neutral-500 dark:bg-neutral-900/40">
                  <tr>
                    <th className="px-3 py-2 font-normal">Row</th>
                    <th className="px-3 py-2 font-normal">Reference</th>
                    <th className="px-3 py-2 font-normal">Summary</th>
                    <th className="px-3 py-2 text-right font-normal">Amount</th>
                    <th className="px-3 py-2 font-normal">Result</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700">
                  {viewing.records.map((r) => (
                    <tr key={r.row}>
                      <td className="px-3 py-2 text-neutral-500">{r.row}</td>
                      <td className="px-3 py-2 font-mono text-xs">{r.external_reference}</td>
                      <td className="px-3 py-2">{r.summary}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.amount ? fmtCurrency(r.amount) : "—"}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <StatusBadge status={r.status} />
                          {r.posted && <StatusBadge status="POSTED" />}
                        </div>
                        {r.message && <p className="mt-0.5 max-w-xs text-xs text-neutral-500 dark:text-neutral-400">{r.message}</p>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {r.status === "ERROR" && viewing.status !== "FAILED" && (
                          <Button
                            size="sm"
                            variant="secondary"
                            icon={FiRefreshCw}
                            disabled={pending(`row-${r.row}`) || pending("post")}
                            onClick={() => track(`row-${r.row}`, async () => run(await actions.reprocessRecord(viewing.id, r.row)))}
                          >
                            Mark fixed
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </RightDrawer>

      <ImportWizard open={wizardOpen} onClose={() => setWizardOpen(false)} onDone={setViewId} />
    </div>
  );
}
