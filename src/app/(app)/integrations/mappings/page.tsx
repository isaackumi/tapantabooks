"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import Link from "next/link";
import { FiArrowRight, FiEdit2, FiPlus, FiTrash2, FiInfo } from "react-icons/fi";
import { Button, Callout, Field, FormError, PageHeader, Toggle, compactInputClass, inputClass } from "@/components/ui";
import StatusBadge from "@/components/statusBadge";
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, Modal } from "@/components/modal";
import { useLedger } from "@/store/ledgerStore";
import type { FieldMapping } from "@/models/accounting";
import { matchesSearch, useGlobalState } from "@/utils/globalStateContext";

const TARGETS = [
  "source.reference",
  "journal.date",
  "journal.memo",
  "amounts.total",
  "amounts.subtotal",
  "amounts.tax",
  "amounts.cost",
  "amounts.principal",
  "amounts.interest",
  "amounts.fees",
  "payment.method",
  "customer.name",
  "customer.email",
  "customer.external_reference",
  "customer.payment_terms_days",
  "invoice.external_reference",
  "invoice.customer",
  "invoice.issue_date",
  "invoice.due_date",
  "line.description",
  "line.quantity",
  "line.unit_price",
  "line.tax_code",
  "line.account",
  "dimension.branch",
  "dimension.department",
  "dimension.cost_centre",
];

const MappingModal = ({ open, mapping, onClose }: { open: boolean; mapping: FieldMapping | null; onClose: () => void }) => {
  const { state, actions } = useLedger();
  const [form, setForm] = useState<Omit<FieldMapping, "id">>({ source_id: "ds_store", entity: "", source_field: "", target_field: "", transform: "—", required: false });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const source = state.dataSources.find((s) => s.id === form.source_id);
  const targets = [...TARGETS, ...state.customFields.filter((f) => f.is_active).map((f) => `custom.${f.key}`)];

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(
      mapping
        ? { source_id: mapping.source_id, entity: mapping.entity, source_field: mapping.source_field, target_field: mapping.target_field, transform: mapping.transform, required: mapping.required }
        : { source_id: "ds_store", entity: state.dataSources.find((s) => s.id === "ds_store")?.entities[0] ?? "", source_field: "", target_field: "", transform: "—", required: false },
    );
  }, [open, mapping, state.dataSources]);

  const submit = async () => {
    setBusy(true);
    try {
      const res = await actions.saveMapping({ ...form, transform: form.transform.trim() || "—" }, mapping?.id);
      if (!res.ok) return setError(res.error);
      toast.success(res.message ?? "Saved");
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={mapping ? "Edit mapping" : "New field mapping"}
      description="Tells the integration layer which source field fills which Trovesuite field, and how to transform it."
      buttons={[
        { label: "Cancel", onClick: onClose, className: BTN_SECONDARY },
        { label: "Save mapping", onClick: submit, className: BTN_PRIMARY, disabled: busy },
      ]}
    >
      <FormError message={error} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Source" required>
          <select
            value={form.source_id}
            onChange={(e) => {
              const s = state.dataSources.find((x) => x.id === e.target.value);
              setForm((f) => ({ ...f, source_id: e.target.value, entity: s?.entities[0] ?? "" }));
            }}
            className={inputClass}
          >
            {state.dataSources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Record type" required>
          <select value={form.entity} onChange={(e) => setForm((f) => ({ ...f, entity: e.target.value }))} className={inputClass}>
            {source?.entities.map((e) => (
              <option key={e}>{e}</option>
            ))}
          </select>
        </Field>
        <Field label="Source field" required hint="Exactly as it appears in the payload or file header">
          <input value={form.source_field} onChange={(e) => setForm((f) => ({ ...f, source_field: e.target.value }))} className={`${inputClass} font-mono`} placeholder="e.g. gross_amount" />
        </Field>
        <Field label="Trovesuite field" required>
          <select value={form.target_field} onChange={(e) => setForm((f) => ({ ...f, target_field: e.target.value }))} className={`${inputClass} font-mono`}>
            <option value="">Select field</option>
            {targets.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="Transform" className="sm:col-span-2" hint="e.g. date: DD/MM/YYYY · decimal(2) · map: CASH→CASH · lookup: customer by name">
          <input value={form.transform} onChange={(e) => setForm((f) => ({ ...f, transform: e.target.value }))} className={`${inputClass} font-mono`} />
        </Field>
        <div className="sm:col-span-2">
          <Toggle
            checked={form.required}
            onChange={(v) => setForm((f) => ({ ...f, required: v }))}
            label="Required"
            description="Records without this field are held for review instead of posting."
          />
        </div>
      </div>
    </Modal>
  );
};

export default function MappingsPage() {
  const { state, actions } = useLedger();
  const { searchQuery } = useGlobalState();
  const [sourceId, setSourceId] = useState("");
  const [editing, setEditing] = useState<FieldMapping | null>(null);
  const [removing, setRemoving] = useState<FieldMapping | null>(null);
  const [mappingOpen, setMappingOpen] = useState(false);

  const sourceName = new Map(state.dataSources.map((s) => [s.id, s.name]));
  const mappings = state.fieldMappings.filter(
    (m) => (!sourceId || m.source_id === sourceId) && matchesSearch(searchQuery, m.source_field, m.target_field, m.entity, m.transform),
  );
  const grouped = [...new Set(mappings.map((m) => `${m.source_id}|${m.entity}`))];

  return (
    <div>
      <PageHeader
        title="Field mappings"
        description="Translate each source's fields into the Trovesuite model. Mapping is configuration, so a new source never needs code changes."
        actions={
          <>
            <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} className={`${compactInputClass} w-56`}>
              <option value="">All sources</option>
              {[...new Set(state.fieldMappings.map((m) => m.source_id))].map((id) => (
                <option key={id} value={id}>
                  {sourceName.get(id)}
                </option>
              ))}
            </select>
            <Button
              icon={FiPlus}
              onClick={() => {
                setEditing(null);
                setMappingOpen(true);
              }}
            >
              New mapping
            </Button>
          </>
        }
      />

      <Callout tone="info" icon={FiInfo} className="mb-4">
        Source fields with no standard home can map to a custom field as <span className="font-mono">custom.&lt;key&gt;</span>.{" "}
        {state.customFields.filter((f) => f.is_active).length} custom fields are active; manage them in{" "}
        <Link href="/settings?tab=fields" className="font-medium underline">
          Settings → Custom fields
        </Link>
        .
      </Callout>

      <div className="space-y-4">
          {grouped.map((g) => {
            const [sid, entity] = g.split("|");
            const items = mappings.filter((m) => m.source_id === sid && m.entity === entity);
            return (
              <div key={g} className="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800">
                <div className="flex items-center justify-between border-b border-neutral-100 bg-neutral-50/60 px-5 py-3 dark:border-neutral-700 dark:bg-neutral-900/30">
                  <p className="text-sm font-semibold">
                    {sourceName.get(sid)} <span className="font-normal text-neutral-500">· {entity}</span>
                  </p>
                  <span className="text-xs text-neutral-500">
                    {items.length} fields · {items.filter((i) => i.required).length} required
                  </span>
                </div>
                <table className="min-w-full text-sm">
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-700">
                    {items.map((m) => (
                      <tr key={m.id}>
                        <td className="w-1/4 px-5 py-2.5 font-mono text-xs">{m.source_field}</td>
                        <td className="w-8 text-neutral-300">
                          <FiArrowRight />
                        </td>
                        <td className="w-1/4 px-5 py-2.5 font-mono text-xs text-brand-700 dark:text-brand-300">{m.target_field}</td>
                        <td className="px-5 py-2.5 text-xs text-neutral-500 dark:text-neutral-400">{m.transform}</td>
                        <td className="px-5 py-2.5">{m.required && <StatusBadge status="WARNING" label="Required" />}</td>
                        <td className="px-5 py-2.5 text-right">
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={() => {
                                setEditing(m);
                                setMappingOpen(true);
                              }}
                              className="rounded p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-700"
                              aria-label="Edit mapping"
                            >
                              <FiEdit2 className="h-4 w-4" />
                            </button>
                            {!m.required && (
                              <button
                                onClick={() => setRemoving(m)}
                                className="rounded p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600"
                                aria-label={`Remove mapping ${m.source_field}`}
                              >
                                <FiTrash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
          {grouped.length === 0 && <p className="py-10 text-center text-sm text-neutral-500">No mappings match.</p>}
      </div>

      <MappingModal open={mappingOpen} mapping={editing} onClose={() => setMappingOpen(false)} />
      <Modal
        open={!!removing}
        onClose={() => setRemoving(null)}
        size="sm"
        title="Remove this mapping?"
        description={removing ? `${removing.source_field} will no longer fill ${removing.target_field}. Records already imported are unchanged.` : ""}
        buttons={[
          { label: "Cancel", onClick: () => setRemoving(null), className: BTN_SECONDARY },
          {
            label: "Remove mapping",
            className: BTN_DANGER,
            onClick: async () => {
              if (!removing) return;
              const res = await actions.removeMapping(removing.id);
              if (!res.ok) return toast.error(res.error);
              toast.success(res.message ?? "Removed");
              setRemoving(null);
            },
          },
        ]}
      />
    </div>
  );
}
