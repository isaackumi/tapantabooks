"use client";

import { useEffect, useRef, useState } from "react";
import { FiAlertTriangle } from "react-icons/fi";
import { Field, inputClass } from "@/components/ui";
import { useLedger } from "@/store/ledgerStore";
import { isForeign, rateDeviationPct, rateOn } from "@/lib/fx";
import { fmtDate, fmtRate } from "@/utils/format";

/**
 * Rate state for a foreign amount. Follows the reference rate for `currency` on
 * `date` until the user types their own, then keeps theirs.
 */
export const useFxRate = (currency: string, date: string, open = true) => {
  const { state } = useLedger();
  const [rate, setRate] = useState("");
  const touched = useRef(false);
  const reference = isForeign(currency) ? rateOn(state.exchangeRates, currency, date) : null;

  useEffect(() => {
    if (!open) return;
    touched.current = false;
  }, [open, currency]);

  useEffect(() => {
    if (!open || touched.current) return;
    setRate(isForeign(currency) ? (reference ? String(reference.rate) : "") : "1");
  }, [open, currency, reference]);

  return {
    rate,
    rateValue: isForeign(currency) ? Number(rate) || 0 : 1,
    reference,
    setRate: (v: string) => {
      touched.current = true;
      setRate(v);
    },
    reset: () => {
      touched.current = false;
      setRate(reference ? String(reference.rate) : "");
    },
  };
};

export const FxRateField = ({
  currency,
  fx,
  label = "Exchange rate",
  className,
}: {
  currency: string;
  fx: ReturnType<typeof useFxRate>;
  label?: string;
  className?: string;
}) => {
  const { state } = useLedger();
  if (!isForeign(currency)) return null;
  const tolerance = state.org.fx_rate_tolerance_pct;
  const deviation = rateDeviationPct(fx.rateValue, fx.reference?.rate ?? null);
  const off = fx.reference && fx.rateValue > 0 && deviation > tolerance;
  return (
    <Field
      label={`${label} (GH₵ per 1 ${currency})`}
      required
      className={className}
      hint={
        off ? (
          <span className="flex items-start gap-1 text-amber-700 dark:text-amber-400">
            <FiAlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {deviation.toFixed(1)}% from the {fmtDate(fx.reference!.date)} rate of {fmtRate(fx.reference!.rate)} (tolerance {tolerance}%).{" "}
            <button type="button" onClick={fx.reset} className="font-medium underline">
              Use it
            </button>
          </span>
        ) : fx.reference ? (
          <span>
            Reference {fmtRate(fx.reference.rate)} · {fx.reference.source === "MANUAL" ? "manual" : "Bank of Ghana"},{" "}
            {fmtDate(fx.reference.date)}
            {fx.rateValue !== fx.reference.rate && (
              <>
                {" · "}
                <button type="button" onClick={fx.reset} className="font-medium text-brand-700 underline dark:text-brand-300">
                  use reference
                </button>
              </>
            )}
          </span>
        ) : (
          <span className="text-amber-700 dark:text-amber-400">No {currency} rate on record; type the rate you agreed.</span>
        )
      }
    >
      <input
        type="number"
        min={0}
        step="0.0001"
        value={fx.rate}
        onChange={(e) => fx.setRate(e.target.value)}
        className={`${inputClass} tabular-nums`}
      />
    </Field>
  );
};
