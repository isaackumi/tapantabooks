"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { FiAlertCircle, FiAlertTriangle, FiLink, FiRefreshCw, FiSettings, FiZap } from "react-icons/fi";
import { Button, Callout, DetailRow, Field, FormError, PageHeader, inputClass } from "@/components/ui";
import { Tabs } from "@/components/tabs";
import StatCard from "@/components/statCard";
import StatusBadge from "@/components/statusBadge";
import RightDrawer from "@/components/rightDrawer";
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, Modal } from "@/components/modal";
import { QueryError, Skeleton } from "@/components/queryState";
import { useLedger } from "@/store/ledgerStore";
import { useReport } from "@/services/useApiQuery";
import type { ListData } from "@/core/apiClient";
import type { DataSource, DataSourceKind } from "@/models/accounting";
import type { ImportListItem } from "@/models/lists";
import { matchesSearch, useGlobalState } from "@/utils/globalStateContext";
import { classNames, fmtDateTime, fmtRelative, humanize } from "@/utils/format";

const SOURCE_HISTORY_SIZE = 10;

const KIND_LABEL: Record<DataSourceKind, string> = {
  TROVESUITE: "Trovesuite apps",
  ACCOUNTING_SYSTEM: "Accounting systems",
  FILE: "Files",
  BANK: "Banks",
  API: "APIs & POS",
};

const KIND_TILE: Record<DataSourceKind, string> = {
  TROVESUITE: "bg-brand-600 text-white",
  ACCOUNTING_SYSTEM: "bg-sky-600 text-white",
  FILE: "bg-amber-500 text-white",
  BANK: "bg-emerald-600 text-white",
  API: "bg-neutral-800 text-white dark:bg-neutral-600",
};

/** Connection fields asked for when connecting a source. Keys matching token/secret/key are masked when saved. */
const connectionFields = (s: DataSource): { key: string; placeholder: string; secret?: boolean }[] => {
  switch (s.kind) {
    case "TROVESUITE":
      return [
        { key: "Tenant", placeholder: "e.g. kumasi-traders" },
        { key: "Environment", placeholder: "Production" },
      ];
    case "ACCOUNTING_SYSTEM":
      return [
        { key: "Company", placeholder: `Company name in ${s.name}` },
        { key: "Server URL", placeholder: "https://…" },
        { key: "API key", placeholder: "Paste the key from the source system", secret: true },
        { key: "Cut-over date", placeholder: "e.g. 31 Dec 2025" },
      ];
    case "BANK":
      return [
        { key: "Account", placeholder: "Account number" },
        { key: "Format", placeholder: "camt.053 / MT940 / CSV" },
      ];
    case "API":
      return [
        { key: "Endpoint", placeholder: "https://…" },
        { key: "API token", placeholder: "Bearer token", secret: true },
      ];
    default:
      return [];
  }
};

const SCHEDULES = ["Real-time", "Every 15 minutes", "Hourly", "Daily at 22:00", "Manual", "One-off migration"];

const SourceLogo = ({ source, size = "h-11 w-11" }: { source: DataSource; size?: string }) => (
  <span className={classNames("flex shrink-0 items-center justify-center rounded-xl text-sm font-bold", size, KIND_TILE[source.kind])}>
    {source.name
      .split(/\s|\//)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase()}
  </span>
);

const ConnectModal = ({ source, onClose }: { source: DataSource | null; onClose: () => void }) => {
  const { actions } = useLedger();
  const [entities, setEntities] = useState<string[]>([]);
  const [schedule, setSchedule] = useState("Hourly");
  const [connection, setConnection] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!source) return;
    setEntities(source.entities);
    setSchedule(source.schedule === "Manual" ? "Hourly" : source.schedule);
    setConnection(Object.fromEntries(connectionFields(source).map((f) => [f.key, ""])));
    setError(null);
  }, [source]);

  const submit = async () => {
    if (!source) return;
    setBusy(true);
    try {
      const res = await actions.connectSource(source.id, { entities, schedule, connection });
      if (!res.ok) return setError(res.error);
      toast.success(res.message ?? "Connected");
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!source}
      onClose={onClose}
      size="xl"
      title={source ? `${source.status === "NOT_CONNECTED" ? "Connect" : "Reconnect"} ${source.name}` : ""}
      description="Records arrive as source events, are mapped to Trovesuite fields, then posted through accounting rules. Nothing posts without passing validation."
      buttons={[
        { label: "Cancel", onClick: onClose, className: BTN_SECONDARY },
        { label: "Connect", onClick: submit, className: BTN_PRIMARY, disabled: busy },
      ]}
    >
      <FormError message={error} />
      {source && (
        <div className="space-y-5">
          <div>
            <p className="mb-2 text-sm font-medium">Records to bring in</p>
            <div className="flex flex-wrap gap-2">
              {source.entities.map((e) => {
                const on = entities.includes(e);
                return (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setEntities((xs) => (on ? xs.filter((x) => x !== e) : [...xs, e]))}
                    className={classNames(
                      "rounded-full border px-3 py-1 text-sm",
                      on
                        ? "border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-700 dark:bg-brand-900/30 dark:text-brand-300"
                        : "border-neutral-200 text-neutral-500 dark:border-neutral-600",
                    )}
                  >
                    {e}
                  </button>
                );
              })}
            </div>
          </div>
          {source.kind !== "FILE" && (
            <Field label="Schedule">
              <select value={schedule} onChange={(e) => setSchedule(e.target.value)} className={inputClass}>
                {SCHEDULES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
          )}
          {connectionFields(source).map((f) => (
            <Field key={f.key} label={f.key} required hint={f.secret ? "Stored encrypted and never shown again." : undefined}>
              <input
                type={f.secret ? "password" : "text"}
                autoComplete="off"
                value={connection[f.key] ?? ""}
                onChange={(e) => setConnection((c) => ({ ...c, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                className={inputClass}
              />
            </Field>
          ))}
        </div>
      )}
    </Modal>
  );
};

export default function SourcesPage() {
  const { state, actions } = useLedger();
  const { searchQuery } = useGlobalState();
  const [tab, setTab] = useState<string>("ALL");
  const [viewId, setViewId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<DataSource | null>(null);
  const [disconnecting, setDisconnecting] = useState<DataSource | null>(null);

  const sources = state.dataSources.filter(
    (s) => (tab === "ALL" || s.kind === tab) && matchesSearch(searchQuery, s.name, s.provider, s.description),
  );
  const viewing = state.dataSources.find((s) => s.id === viewId);
  const connected = state.dataSources.filter((s) => s.status !== "NOT_CONNECTED");
  const issues = state.dataSources.filter((s) => s.status === "ERROR" || s.status === "WARNING");
  const history = useReport<ListData<ImportListItem>>(viewing ? "/imports/list" : null, {
    source_id: viewing?.id ?? "",
    size: SOURCE_HISTORY_SIZE,
  });
  const batches = (history.data?.items ?? []).filter((b) => b.source_id === viewing?.id);
  const moreBatches = (history.pagination?.total ?? 0) - batches.length;

  const sync = async (s: DataSource) => {
    const res = await actions.syncSource(s.id);
    if (res.ok) toast.success(res.message ?? "Synced");
    else toast.error(res.error);
  };

  const primaryAction = (s: DataSource) =>
    s.status === "NOT_CONNECTED" ? (
      <Button size="sm" icon={FiLink} onClick={() => setConnecting(s)}>
        Connect
      </Button>
    ) : s.status === "ERROR" ? (
      <Button size="sm" variant="danger" icon={FiZap} onClick={() => setConnecting(s)}>
        Reconnect
      </Button>
    ) : (
      <Button size="sm" variant="secondary" icon={FiRefreshCw} onClick={() => sync(s)}>
        Sync now
      </Button>
    );

  return (
    <div>
      <PageHeader
        title="Data sources"
        description="Trovesuite apps, other accounting systems, files, banks and APIs. Each one feeds the same governed posting engine."
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" data-tour="stats">
        <StatCard label="Connected" value={`${connected.length} / ${state.dataSources.length}`} sub="Sources sending data" />
        <StatCard
          label="Records received"
          value={state.dataSources.reduce((s, d) => s + d.records_synced, 0).toLocaleString()}
          sub="Since go-live"
        />
        <StatCard
          label="Held for review"
          value={state.dataSources.reduce((s, d) => s + d.error_count, 0)}
          tone={issues.length ? "warning" : "default"}
          sub="Records that failed validation"
        />
        <StatCard label="Need attention" value={issues.length} tone={issues.length ? "danger" : "success"} sub={issues.map((i) => i.name).join(", ") || "All healthy"} />
      </div>

      <Tabs
        tabs={[
          { id: "ALL", label: "All", count: state.dataSources.length },
          ...(Object.keys(KIND_LABEL) as DataSourceKind[]).map((k) => ({
            id: k,
            label: KIND_LABEL[k],
            count: state.dataSources.filter((s) => s.kind === k).length,
          })),
        ]}
        value={tab}
        onChange={setTab}
      />

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" data-tour="sources-grid">
        {sources.map((s) => (
          <div
            key={s.id}
            className={classNames(
              "flex flex-col rounded-xl border bg-white p-5 dark:bg-neutral-800",
              s.status === "ERROR"
                ? "border-red-200 dark:border-red-900"
                : s.status === "WARNING"
                  ? "border-amber-200 dark:border-amber-900"
                  : "border-neutral-200 dark:border-neutral-700",
            )}
          >
            <div className="flex items-start gap-3">
              <SourceLogo source={s} />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate font-semibold">{s.name}</p>
                  <StatusBadge status={s.status} />
                </div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  {s.provider} · {humanize(s.sync_direction)}
                </p>
              </div>
            </div>
            <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-300">{s.description}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {s.entities.map((e) => (
                <span key={e} className="rounded bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300">
                  {e}
                </span>
              ))}
            </div>
            {s.status_message && (
              <p
                className={classNames(
                  "mt-3 flex items-start gap-2 rounded-lg p-2.5 text-xs",
                  s.status === "ERROR" ? "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300" : "bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300",
                )}
              >
                {s.status === "ERROR" ? <FiAlertCircle className="mt-0.5 shrink-0" /> : <FiAlertTriangle className="mt-0.5 shrink-0" />}
                {s.status_message}
              </p>
            )}
            <div className="mt-auto pt-4">
              <div className="mb-3 flex justify-between border-t border-neutral-100 pt-3 text-xs text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
                <span>{s.status === "NOT_CONNECTED" ? "Not connected" : `Last sync ${fmtRelative(s.last_run_at)}`}</span>
                <span>{s.records_synced ? `${s.records_synced.toLocaleString()} records` : s.schedule}</span>
              </div>
              <div className="flex gap-2">
                {primaryAction(s)}
                <Button size="sm" variant="ghost" icon={FiSettings} onClick={() => setViewId(s.id)}>
                  Details
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <RightDrawer
        open={!!viewing}
        onClose={() => setViewId(null)}
        widthClass="max-w-xl"
        title={
          viewing && (
            <span className="flex items-center gap-3">
              <SourceLogo source={viewing} size="h-8 w-8" />
              {viewing.name}
            </span>
          )
        }
        subtitle={viewing?.provider}
        footer={
          viewing && (
            <div className="flex flex-wrap justify-end gap-2">
              {viewing.status !== "NOT_CONNECTED" && (
                <Button variant="ghost" className="mr-auto text-red-600" onClick={() => setDisconnecting(viewing)}>
                  Disconnect
                </Button>
              )}
              {viewing.status !== "NOT_CONNECTED" && (
                <Button variant="secondary" icon={FiZap} onClick={() => setConnecting(viewing)}>
                  Reconnect
                </Button>
              )}
              {primaryAction(viewing)}
            </div>
          )
        }
      >
        {viewing && (
          <div className="space-y-5">
            {viewing.status_message && (
              <Callout tone={viewing.status === "ERROR" ? "danger" : "warning"} title={viewing.status === "ERROR" ? "Connection failing" : "Partial sync"}>
                {viewing.status_message}
              </Callout>
            )}
            <div className="rounded-xl border border-neutral-200 px-4 py-1 divide-y divide-neutral-100 dark:border-neutral-700 dark:divide-neutral-700">
              <DetailRow label="Status">
                <StatusBadge status={viewing.status} />
              </DetailRow>
              <DetailRow label="Type">{KIND_LABEL[viewing.kind]}</DetailRow>
              <DetailRow label="Direction">{humanize(viewing.sync_direction)}</DetailRow>
              <DetailRow label="Schedule">{viewing.schedule}</DetailRow>
              <DetailRow label="Last run">
                {viewing.last_run_at ? (
                  <span className="flex items-center gap-2">
                    {fmtDateTime(viewing.last_run_at)} {viewing.last_run_status && <StatusBadge status={viewing.last_run_status} />}
                  </span>
                ) : (
                  "Never"
                )}
              </DetailRow>
              <DetailRow label="Records received">{viewing.records_synced.toLocaleString()}</DetailRow>
              <DetailRow label="Held for review">{viewing.error_count}</DetailRow>
            </div>

            {Object.keys(viewing.connection).length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-semibold">Connection</h4>
                <div className="rounded-xl border border-neutral-200 px-4 py-1 divide-y divide-neutral-100 dark:border-neutral-700 dark:divide-neutral-700">
                  {Object.entries(viewing.connection).map(([k, v]) => (
                    <DetailRow key={k} label={k}>
                      <span className="font-mono text-xs">{v}</span>
                    </DetailRow>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h4 className="mb-2 text-sm font-semibold">How its data is handled</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Link href="/integrations/mappings" className="rounded-xl border border-neutral-200 p-3 hover:border-brand-300 dark:border-neutral-700">
                  <p className="text-lg font-bold">{state.fieldMappings.filter((m) => m.source_id === viewing.id).length}</p>
                  <p className="text-xs text-neutral-500">Field mappings</p>
                </Link>
                <Link href="/integrations/rules" className="rounded-xl border border-neutral-200 p-3 hover:border-brand-300 dark:border-neutral-700">
                  <p className="text-lg font-bold">{state.rules.filter((r) => r.source_id === viewing.id).length}</p>
                  <p className="text-xs text-neutral-500">Posting rules</p>
                </Link>
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-sm font-semibold">Import history</h4>
              {history.error && !history.loading ? (
                <QueryError message={history.error} onRetry={history.refetch} />
              ) : !history.data || (history.loading && batches.length === 0) ? (
                <Skeleton rows={3} />
              ) : batches.length === 0 ? (
                <p className="text-sm text-neutral-500">No batches yet. Event-driven sources post continuously through rules.</p>
              ) : (
                <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 dark:divide-neutral-700 dark:border-neutral-700">
                  {batches.map((b) => (
                    <li key={b.id}>
                      <Link href={`/integrations/imports?open=${b.id}`} className="flex items-center justify-between px-4 py-2.5 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-700/40">
                        <span>
                          <span className="font-mono text-xs">{b.number}</span>
                          <span className="ml-2">{b.entity}</span>
                          <span className="ml-2 text-xs text-neutral-500">{b.row_count} rows</span>
                        </span>
                        <StatusBadge status={b.status} />
                      </Link>
                    </li>
                  ))}
                  {moreBatches > 0 && (
                    <li>
                      <Link href="/integrations/imports" className="block px-4 py-2.5 text-xs text-brand-700 hover:underline dark:text-brand-300">
                        {moreBatches} earlier batch{moreBatches === 1 ? "" : "es"} in Imports
                      </Link>
                    </li>
                  )}
                </ul>
              )}
            </div>
          </div>
        )}
      </RightDrawer>

      <ConnectModal source={connecting} onClose={() => setConnecting(null)} />
      <Modal
        open={!!disconnecting}
        onClose={() => setDisconnecting(null)}
        title={disconnecting ? `Disconnect ${disconnecting.name}?` : ""}
        description="New records stop arriving. Everything already posted stays in the ledger with its source reference."
        buttons={[
          { label: "Keep connected", onClick: () => setDisconnecting(null), className: BTN_SECONDARY },
          {
            label: "Disconnect",
            className: BTN_DANGER,
            onClick: async () => {
              if (!disconnecting) return;
              const res = await actions.disconnectSource(disconnecting.id);
              if (res.ok) toast.success(res.message ?? "Disconnected");
              setDisconnecting(null);
            },
          },
        ]}
      />
    </div>
  );
}
