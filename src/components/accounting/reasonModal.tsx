"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, Modal } from "@/components/modal";
import { Field, FormError, inputClass } from "@/components/ui";
import type { Result } from "@/store/ledgerStore";
import { todayIso } from "@/utils/dates";

interface ReasonModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  withDate?: boolean;
  defaultDate?: string;
  placeholder?: string;
  onConfirm: (reason: string, date: string) => Result<unknown> | Promise<Result<unknown>>;
}

/** Asks for a reason (kept on the audit trail) and optionally a date before a corrective action. */
const ReasonModal = ({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  danger,
  withDate,
  defaultDate,
  placeholder,
  onConfirm,
}: ReasonModalProps) => {
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(defaultDate ?? todayIso());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setReason("");
      setDate(defaultDate ?? todayIso());
      setError(null);
    }
  }, [open, defaultDate]);

  const submit = async () => {
    setBusy(true);
    try {
      const res = await onConfirm(reason, date);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success(res.message ?? "Done");
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      size="lg"
      buttons={[
        { label: "Cancel", onClick: onClose, className: BTN_SECONDARY },
        { label: confirmLabel, onClick: submit, className: danger ? BTN_DANGER : BTN_PRIMARY, disabled: busy },
      ]}
    >
      <FormError message={error} />
      <div className="space-y-4">
        {withDate && (
          <Field label="Date" required hint="Must fall in an open period.">
            <input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </Field>
        )}
        <Field label="Reason" required hint="Recorded on the audit trail with your name.">
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={placeholder}
            className={inputClass}
          />
        </Field>
      </div>
    </Modal>
  );
};

export default ReasonModal;
