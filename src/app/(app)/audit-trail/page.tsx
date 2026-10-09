"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { FiChevronDown, FiChevronRight, FiCpu, FiDownload, FiLink, FiUser } from "react-icons/fi";
import { Button, PageHeader, compactInputClass } from "@/components/ui";
import StatCard from "@/components/statCard";
import Pagination from "@/components/pagination";
import { QueryState, Skeleton } from "@/components/queryState";
import { useJournalViewer } from "@/components/accounting/journalViewer";
import { fetchAll } from "@/core/apiClient";
import { useDebouncedValue, usePagedList, useReport } from "@/services/useApiQuery";
import type { ActorType, AuditEvent } from "@/models/accounting";
import type { AuditStatistics } from "@/models/lists";
import { useGlobalState } from "@/utils/globalStateContext";
import { downloadCsv } from "@/utils/csv";
import { classNames, fmtDateTime, humanize } from "@/utils/format";
import { todayIso } from "@/utils/dates";

const PAGE_SIZE = 50;

const ACTOR_ICON: Record<ActorType, typeof FiUser> = { USER: FiUser, SYSTEM: FiCpu, INTEGRATION: FiLink };
const ACTOR_TONE: Record<ActorType, string> = {
  USER: "bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300",
  SYSTEM: "bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300",
  INTEGRATION: "bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
};

const entityHref = (e: AuditEvent): string | null => {
  if (!e.entity_id) return null;
  switch (e.entity_type) {
    case "Invoice":
      return `/sales/invoices?open=${e.entity_id}`;
    case "Bill":
      return `/purchases/bills?open=${e.entity_id}`;
    case "Import batch":
      return `/integrations/imports?open=${e.entity_id}`;
    case "Account":
      return `/accounting/general-ledger?account=${e.entity_id}`;
    case "Fiscal period":
      return "/accounting/periods";
    case "Data source":
      return "/integrations/sources";
    case "Accounting rule":
      return "/integrations/rules";
    case "Field mapping":
      return "/integrations/mappings";
    case "Custom field":
      return "/settings?tab=fields";
    case "Currency":
    case "Exchange rate":
      return "/settings?tab=currencies";
    case "FX revaluation":
      return "/accounting/revaluation";
    case "Credit note":
      return `/sales/credit-notes?open=${e.entity_id}`;
    case "Supplier credit":
      return `/purchases/supplier-credits?open=${e.entity_id}`;
    case "Opening balances":
      return "/accounting/opening-balances";
    case "Customer":
      return `/sales/customers?open=${e.entity_id}`;
    case "Supplier":
      return `/purchases/suppliers?open=${e.entity_id}`;
    case "Journal":
      return `/accounting/journals?open=${e.entity_id}`;
    case "Bank account":
    case "Statement line":
      return "/banking/reconciliation";
    case "Organisation":
    case "Dimension":
      return "/settings";
    default:
      return null;
  }
};

export default function AuditTrailPage() {
  const { openJournal } = useJournalViewer();
  const { searchQuery } = useGlobalState();
  const [actorType, setActorType] = useState<"" | ActorType>("");
  const [entityType, setEntityType] = useState("");
  const [actor, setActor] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const search = useDebouncedValue(searchQuery.trim());

  const stats = useReport<AuditStatistics>("/audit-logs/statistics", {});
  const list = usePagedList<AuditEvent>(
    "/audit-logs/list",
    { actor_type: actorType, entity_type: entityType, actor_name: actor, from_date: from, to_date: to, search },
    PAGE_SIZE,
  );
  const rows = list.items;
  const total = list.pagination?.total ?? rows.length;

  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const exportCsv = async () => {
    setExporting(true);
    try {
      const all = await fetchAll<AuditEvent>("/audit-logs/list", list.listQuery);
      downloadCsv(`audit-trail-${todayIso()}.csv`, [
        ["Occurred at", "Actor", "Actor type", "Action", "Entity type", "Entity", "Summary", "Changes"],
        ...all.map((e) => [
          e.occurred_at,
          e.actor_name,
          e.actor_type,
          e.action,
          e.entity_type,
          e.entity_label,
          e.summary,
          (e.changes ?? []).map((c) => `${c.field}: ${c.from ?? "—"} → ${c.to ?? "—"}`).join("; "),
        ]),
      ]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  };

  const filtered = actorType || entityType || actor || from || to;

  return (
    <div>
      <PageHeader
        title="Audit trail"
        description="An append-only record of every change: who made it, when, through which channel, and what it changed."
        actions={
          <Button variant="secondary" icon={FiDownload} onClick={exportCsv} disabled={exporting || total === 0}>
            {exporting ? "Exporting…" : "Export"}
          </Button>
        }
      />

      <QueryState query={stats} skeleton={<Skeleton rows={2} />} className="mb-6">
        {(st) => (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Events recorded" value={st.total.toLocaleString()} sub={`${st.today} today`} />
            <StatCard label="By people" value={st.by_actor_type.USER.toLocaleString()} sub="Manual actions and approvals" />
            <StatCard label="By integrations" value={st.by_actor_type.INTEGRATION.toLocaleString()} sub="Syncs, imports and webhooks" />
            <StatCard label="By the posting engine" value={st.by_actor_type.SYSTEM.toLocaleString()} sub="Automatic postings" />
          </div>
        )}
      </QueryState>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select value={actorType} onChange={(e) => setActorType(e.target.value as "" | ActorType)} className={`${compactInputClass} w-40`}>
          <option value="">All channels</option>
          <option value="USER">People</option>
          <option value="INTEGRATION">Integrations</option>
          <option value="SYSTEM">System</option>
        </select>
        <select value={actor} onChange={(e) => setActor(e.target.value)} className={`${compactInputClass} w-48`}>
          <option value="">Anyone</option>
          {(stats.data?.actor_names ?? []).map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
        <select value={entityType} onChange={(e) => setEntityType(e.target.value)} className={`${compactInputClass} w-44`}>
          <option value="">All record types</option>
          {(stats.data?.entity_types ?? []).map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${compactInputClass} w-40`} aria-label="From" />
        <span className="text-sm text-neutral-400">to</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${compactInputClass} w-40`} aria-label="To" />
        {filtered && (
          <button
            onClick={() => {
              setActorType("");
              setEntityType("");
              setActor("");
              setFrom("");
              setTo("");
            }}
            className="text-sm text-brand-700 hover:underline dark:text-brand-300"
          >
            Clear filters
          </button>
        )}
        <span className="ml-auto text-sm text-neutral-500">{list.data ? `${total.toLocaleString()} events` : ""}</span>
      </div>

      <QueryState query={list} skeleton={<Skeleton rows={10} />}>
        {() => (
      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800">
        <table className="min-w-full text-sm">
          <thead className="bg-neutral-50/60 text-left text-neutral-500 dark:bg-neutral-800 dark:text-neutral-300">
            <tr>
              <th className="w-8 px-3 py-3" />
              <th className="px-4 py-3 font-normal">When</th>
              <th className="px-4 py-3 font-normal">Who</th>
              <th className="px-4 py-3 font-normal">Action</th>
              <th className="px-4 py-3 font-normal">Record</th>
              <th className="px-4 py-3 font-normal">Summary</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700">
            {rows.map((e) => {
              const Icon = ACTOR_ICON[e.actor_type];
              const hasChanges = !!e.changes?.length;
              const open = expanded.has(e.id);
              const href = entityHref(e);
              return (
                <Fragment key={e.id}>
                  <tr className={classNames(hasChanges && "cursor-pointer", "hover:bg-neutral-50/60 dark:hover:bg-neutral-700/30")} onClick={() => hasChanges && toggle(e.id)}>
                    <td className="px-3 py-3 text-neutral-400">{hasChanges && (open ? <FiChevronDown /> : <FiChevronRight />)}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-neutral-600 dark:text-neutral-300">{fmtDateTime(e.occurred_at)}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="flex items-center gap-2">
                        <span className={`flex h-6 w-6 items-center justify-center rounded-full ${ACTOR_TONE[e.actor_type]}`}>
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        {e.actor_name}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-neutral-600 dark:text-neutral-300">{e.action}</td>
                    <td className="whitespace-nowrap px-4 py-3" onClick={(ev) => ev.stopPropagation()}>
                      <p className="text-xs text-neutral-500">{e.entity_type}</p>
                      {e.entity_type === "Journal" && e.entity_id ? (
                        <button onClick={() => openJournal(e.entity_id!)} className="font-medium text-brand-700 hover:underline dark:text-brand-300">
                          {e.entity_label}
                        </button>
                      ) : href ? (
                        <Link href={href} className="font-medium text-brand-700 hover:underline dark:text-brand-300">
                          {e.entity_label}
                        </Link>
                      ) : (
                        <span className="font-medium">{e.entity_label}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-neutral-700 dark:text-neutral-200">{e.summary}</td>
                  </tr>
                  {open && hasChanges && (
                    <tr className="bg-neutral-50/60 dark:bg-neutral-900/30">
                      <td />
                      <td colSpan={5} className="px-4 py-3">
                        <table className="text-xs">
                          <thead className="text-left text-neutral-500">
                            <tr>
                              <th className="pb-1 pr-8 font-normal">Field</th>
                              <th className="pb-1 pr-8 font-normal">Before</th>
                              <th className="pb-1 font-normal">After</th>
                            </tr>
                          </thead>
                          <tbody>
                            {e.changes!.map((c, i) => (
                              <tr key={i}>
                                <td className="py-0.5 pr-8 font-medium">{humanize(c.field)}</td>
                                <td className="py-0.5 pr-8 text-red-600 line-through decoration-red-300 dark:text-red-400">{c.from ?? "—"}</td>
                                <td className="py-0.5 text-green-700 dark:text-green-400">{c.to ?? "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="py-10 text-center text-sm text-neutral-500">
            {filtered || search ? "No events match these filters." : "Nothing has been recorded yet."}
          </p>
        )}
        {total > PAGE_SIZE && (
          <div className="border-t border-neutral-100 px-4 py-3 dark:border-neutral-700">
            <Pagination
              currentPage={list.page}
              totalPages={Math.ceil(total / PAGE_SIZE)}
              onPageChange={(p) => {
                setExpanded(new Set());
                list.setPage(p);
              }}
              summary={`${((list.page - 1) * PAGE_SIZE + 1).toLocaleString()}–${Math.min(list.page * PAGE_SIZE, total).toLocaleString()} of ${total.toLocaleString()}`}
            />
          </div>
        )}
      </div>
        )}
      </QueryState>
    </div>
  );
}
