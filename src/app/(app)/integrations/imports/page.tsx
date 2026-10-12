"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { FiCheck, FiEdit2, FiTrash2, FiUploadCloud } from "react-icons/fi";
import { Button, Callout, DetailRow, Field, FormError, PageHeader, inputClass } from "@/components/ui";
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, Modal } from "@/components/modal";
import { Tabs } from "@/components/tabs";
import StatCard from "@/components/statCard";
import StatusBadge from "@/components/statusBadge";
import RightDrawer from "@/components/rightDrawer";
import DataTable, { serverPaging, type Column } from "@/components/dataTable";
import { QueryError, QueryState, Skeleton } from "@/components/queryState";
import ImportWizard from "@/components/integrations/importWizard";
import { useJournalViewer } from "@/components/accounting/journalViewer";
import { useLedger } from "@/store/ledgerStore";
import { useDebouncedValue, usePagedList, useReport } from "@/services/useApiQuery";
import type { ImportListItem, ImportStatistics } from "@/models/lists";
import type { ImportRecord } from "@/models/accounting";
import { useGlobalState } from "@/utils/globalStateContext";
import { useQueryParam } from "@/utils/useQueryParam";
import { usePending } from "@/services/usePending";
import { fmtCurrency, fmtDateTime } from "@/utils/format";

type Row = ImportListItem;

export default function ImportsPage() {
  const { actions } = useLedger();
  const { openJournal } = useJournalViewer();
  const { searchQuery } = useGlobalState();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [tab, setTab] = useState("ALL");
  const [viewId, setViewId] = useState<string | null>(null);
  const [fixing, setFixing] = useState<ImportRecord | null>(null);
  const [discarding, setDiscarding] = useState(false);
  useQueryParam("open", setViewId);
  const search = useDebouncedValue(searchQuery.trim());

  const stats = useReport<ImportStatistics>("/imports/statistics", {});
  const list = usePagedList<Row>("/imports/list", {
    status: tab === "POSTED" ? "POSTED" : "",
    attention: tab === "ATTENTION" ? "true" : "",
    search,
  });
  const detail = useReport<Row>(viewId ? "/imports/get" : null, { import_batch_id: viewId ?? "" });
  const viewing = detail.data?.id === viewId ? detail.data : null;
  const ready = viewing ? viewing.records.filter((r) => r.status !== "ERROR" && !r.posted).length : 0;

  const { pending, track, anyPending } = usePending();
  const run = (res: { ok: boolean; message?: string; error?: string }) => {
    if (res.ok) toast.success(res.message ?? "Done");
    else toast.error(res.error ?? "Failed");
  };

  const columns: Column<Row>[] = [
    { accessorKey: "number", header: "Batch", cell: ({ row }) => <span className="font-mono text-xs font-medium">{row.original.number}</span> },
    {
      accessorKey: "source_name",
      header: "Source",
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.original.source_name}</p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">{row.original.file_name ?? "API / connector"}</p>
        </div>
      ),
    },
    { accessorKey: "entity", header: "Records" },
    {
      accessorKey: "row_count",
      header: "Rows",
      cell: ({ row }) => (
        <span className="flex items-center gap-2 text-xs">
          <span className="font-medium">{row.original.row_count}</span>
          <span className="text-emerald-600">{row.original.valid_count} ok</span>
          {row.original.warning_count > 0 && <span className="text-amber-600">{row.original.warning_count} warn</span>}
          {row.original.error_count > 0 && <span className="text-red-600">{row.original.error_count} error</span>}
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

      <QueryState query={stats} skeleton={<Skeleton rows={2} />} className="mb-6">
        {(st) => (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" data-tour="stats">
            <StatCard label="Batches" value={st.batch_count} sub={`${st.row_count} rows received`} />
            <StatCard label="Rows posted" value={st.posted_rows} tone="success" />
            <StatCard label="Rows held" value={st.held_rows} tone="danger" sub="Failed validation" />
            <StatCard label="Need attention" value={st.needs_attention} tone="warning" sub="Waiting for review or failed" />
          </div>
        )}
      </QueryState>

      <Tabs
        tabs={[
          { id: "ALL", label: "All", count: stats.data?.status_counts.ALL },
          { id: "ATTENTION", label: "Needs attention", count: stats.data?.status_counts.ATTENTION },
          { id: "POSTED", label: "Posted", count: stats.data?.status_counts.POSTED },
        ]}
        value={tab}
        onChange={setTab}
      />
      <div className="mt-4">
        <QueryState query={list} skeleton={<Skeleton rows={8} />}>
          {() => (
            <DataTable
              columns={columns}
              data={list.items}
              server={serverPaging(list)}
              onRowClick={(r) => setViewId(r.id)}
              emptyIcon={FiUploadCloud}
              emptyTitle={search ? "No imports match" : "No imports here"}
              emptyDescription={search ? "Try another search or tab." : "Start one with New import."}
              emptyActions={search ? undefined : [{ label: "New import", onClick: () => setWizardOpen(true) }]}
            />
          )}
        </QueryState>
      </div>

      <RightDrawer
        open={!!viewId}
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
        subtitle={viewing && `${viewing.entity} from ${viewing.source_name}`}
        footer={
          viewing && (
            <div className="flex flex-wrap justify-end gap-2">
              {viewing.posted_count === 0 && !viewing.journal_id && (
                <Button variant="ghost" icon={FiTrash2} className="mr-auto text-red-600" onClick={() => setDiscarding(true)}>
                  Discard batch
                </Button>
              )}
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
        {!viewing &&
          (detail.error && !detail.loading ? <QueryError message={detail.error} onRetry={detail.refetch} /> : <Skeleton rows={6} />)}
        {viewing && (
          <div className="space-y-5">
            {viewing.status === "FAILED" && (
              <Callout tone="danger" title="Nothing was received">
                {viewing.records[0]?.message} Fix the connection in Data sources, then the source resends the batch.
              </Callout>
            )}
            <div className="grid grid-cols-4 gap-3 text-center">
              {[
                { label: "Rows", value: viewing.row_count },
                { label: "Posted", value: viewing.posted_count },
                { label: "Warnings", value: viewing.warning_count },
                { label: "Errors", value: viewing.error_count },
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
                      <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{r.amount ? fmtCurrency(r.amount) : "—"}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <StatusBadge status={r.status} />
                          {r.posted && <StatusBadge status="POSTED" />}
                        </div>
                        {r.message && <p className="mt-0.5 max-w-xs text-xs text-neutral-500 dark:text-neutral-400">{r.message}</p>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {!r.posted && viewing.status !== "FAILED" && (
                          <Button
                            size="sm"
                            variant={r.status === "ERROR" ? "secondary" : "ghost"}
                            icon={FiEdit2}
                            disabled={pending("post")}
                            aria-label={`${r.status === "ERROR" ? "Fix" : "Edit"} row ${r.row}`}
                            onClick={() => setFixing(r)}
                          >
                            {r.status === "ERROR" ? "Fix" : ""}
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
      {viewing && <FixRowModal batchId={viewing.id} record={fixing} onClose={() => setFixing(null)} />}
      {viewing && (
        <Modal
          open={discarding}
          onClose={() => setDiscarding(false)}
          size="sm"
          title={`Discard ${viewing.number}?`}
          description={`None of its ${viewing.row_count} row${viewing.row_count === 1 ? "" : "s"} posted, so the ledger does not change. The discard is kept on the audit trail.`}
          buttons={[
            { label: "Cancel", onClick: () => setDiscarding(false), className: BTN_SECONDARY },
            {
              label: "Discard batch",
              className: BTN_DANGER,
              disabled: anyPending,
              onClick: () =>
                track("discard", async () => {
                  const res = await actions.discardImportBatch(viewing.id);
                  run(res);
                  if (res.ok) {
                    setDiscarding(false);
                    setViewId(null);
                  }
                }),
            },
          ]}
        />
      )}
    </div>
  );
}

const FixRowModal = ({ batchId, record, onClose }: { batchId: string; record: ImportRecord | null; onClose: () => void }) => {
  const { actions } = useLedger();
  const [form, setForm] = useState({ external_reference: "", summary: "", amount: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!record) return;
    setError(null);
    setForm({ external_reference: record.external_reference, summary: record.summary, amount: String(record.amount) });
  }, [record]);

  const save = async () => {
    if (!record) return;
    setBusy(true);
    try {
      const res = await actions.updateImportRecord(batchId, record.row, { ...form, amount: Number(form.amount) });
      if (!res.ok) return setError(res.error);
      toast.success(res.message ?? "Saved");
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!record}
      onClose={onClose}
      title={record ? `${record.status === "ERROR" ? "Fix" : "Edit"} row ${record.row}` : ""}
      description={record?.message ?? "Correct the row as it should have arrived. It is checked again and becomes ready to post."}
      buttons={[
        { label: "Cancel", onClick: onClose, className: BTN_SECONDARY },
        { label: "Save row", onClick: save, className: BTN_PRIMARY, disabled: busy },
      ]}
    >
      <FormError message={error} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Source reference" required>
          <input
            value={form.external_reference}
            onChange={(e) => setForm((f) => ({ ...f, external_reference: e.target.value }))}
            className={`${inputClass} font-mono`}
          />
        </Field>
        <Field label="Amount" required>
          <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} className={inputClass} />
        </Field>
        <Field label="Summary" required className="sm:col-span-2">
          <input value={form.summary} onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))} className={inputClass} />
        </Field>
      </div>
    </Modal>
  );
};
