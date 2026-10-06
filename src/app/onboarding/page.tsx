"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FiAlertTriangle, FiArrowRight, FiLogOut } from "react-icons/fi";
import { AuthShell } from "@/components/auth/authShell";
import { FullPageMessage, Spinner } from "@/components/sessionGate";
import { Button, Callout, Field, FormError, inputClass } from "@/components/ui";
import { api, ApiError } from "@/core/apiClient";
import { hasValidSession, redirectToLogin } from "@/core/session";
import { BASE_CURRENCY_OPTIONS, COUNTRY_OPTIONS, FISCAL_YEAR_START_OPTIONS } from "@/data/locales";
import type { OrganisationSetupInput, OrgSettings } from "@/models/accounting";
import { DEFAULT_BASE_CURRENCY } from "@/utils/format";

const EMPTY: OrganisationSetupInput = {
  name: "",
  legal_name: "",
  tin: "",
  country: "GH",
  base_currency: DEFAULT_BASE_CURRENCY,
  fiscal_year_start: "01-01",
  address: "",
  email: "",
  phone: "",
};

export default function OnboardingPage() {
  const router = useRouter();
  const [form, setForm] = useState<OrganisationSetupInput | null>(null);
  const [currencyTouched, setCurrencyTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!hasValidSession()) {
      redirectToLogin();
      return;
    }
    api
      .get<OrgSettings>("/organisation/get")
      .then(({ data: org }) => {
        if (!org) throw new Error("The organisation could not be loaded.");
        if (org.setup_completed) return router.replace("/dashboard");
        setForm({
          ...EMPTY,
          name: org.name,
          legal_name: org.legal_name,
          tin: org.tin,
          country: org.country || EMPTY.country,
          base_currency: org.base_currency || EMPTY.base_currency,
          fiscal_year_start: org.fiscal_year_start || EMPTY.fiscal_year_start,
          address: org.address,
          email: org.email,
          phone: org.phone,
        });
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : "The organisation could not be loaded."));
  }, [router]);

  if (loadError) {
    return (
      <FullPageMessage>
        <div className="max-w-md rounded-2xl border border-neutral-200 bg-white p-6 text-center dark:border-neutral-700 dark:bg-neutral-800">
          <FiAlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
          <p className="mt-3 font-semibold text-neutral-900 dark:text-white">Setup could not start</p>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">{loadError}</p>
          <Button className="mt-5" variant="secondary" icon={FiLogOut} onClick={redirectToLogin}>
            Back to sign in
          </Button>
        </div>
      </FullPageMessage>
    );
  }

  if (!form) {
    return (
      <FullPageMessage>
        <Spinner label="Loading your organisation…" />
      </FullPageMessage>
    );
  }

  const set = <K extends keyof OrganisationSetupInput>(key: K, value: OrganisationSetupInput[K]) => setForm({ ...form, [key]: value });

  const chooseCountry = (code: string) => {
    const suggested = COUNTRY_OPTIONS.find((c) => c.code === code)?.currency;
    setForm({ ...form, country: code, base_currency: !currencyTouched && suggested ? suggested : form.base_currency });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = "Enter the name customers know you by.";
    if (!form.legal_name.trim()) errors.legal_name = "Enter the registered name.";
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    setSaving(true);
    setError(null);
    try {
      await api.post<OrgSettings>("/organisation/setup", form);
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed.");
      if (err instanceof ApiError && err.fieldErrors) setFieldErrors(err.fieldErrors);
      setSaving(false);
    }
  };

  const currencyName = BASE_CURRENCY_OPTIONS.find((c) => c.code === form.base_currency)?.name ?? form.base_currency;

  return (
    <AuthShell wide title="Set up your organisation" subtitle="A few details before you open the books. You can change most of these later in Settings.">
      <form onSubmit={submit} className="space-y-5" noValidate>
        <FormError message={error} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Trading name" required error={fieldErrors.name}>
            <input className={inputClass} value={form.name} onChange={(e) => set("name", e.target.value)} autoFocus />
          </Field>
          <Field label="Legal name" required error={fieldErrors.legal_name} hint="As registered, e.g. Kumasi Traders Ltd">
            <input className={inputClass} value={form.legal_name} onChange={(e) => set("legal_name", e.target.value)} />
          </Field>
          <Field label="Country" required error={fieldErrors.country}>
            <select className={inputClass} value={form.country} onChange={(e) => chooseCountry(e.target.value)}>
              {COUNTRY_OPTIONS.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tax identification number" error={fieldErrors.tin}>
            <input className={inputClass} value={form.tin} onChange={(e) => set("tin", e.target.value)} />
          </Field>
        </div>

        <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-700">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Base currency" required error={fieldErrors.base_currency} hint="Your reports and ledger balances are kept in this currency.">
              <select
                className={inputClass}
                value={form.base_currency}
                onChange={(e) => {
                  setCurrencyTouched(true);
                  set("base_currency", e.target.value);
                }}
              >
                {BASE_CURRENCY_OPTIONS.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} · {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Financial year starts" required error={fieldErrors.fiscal_year_start} hint="We open twelve monthly periods from here.">
              <select className={inputClass} value={form.fiscal_year_start} onChange={(e) => set("fiscal_year_start", e.target.value)}>
                {FISCAL_YEAR_START_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Callout tone="warning" className="mt-4">
            You can change the base currency only until the first entry is posted. After that, {currencyName} stays the base and other
            currencies are recorded at an exchange rate.
          </Callout>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Business email" error={fieldErrors.email}>
            <input className={inputClass} type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label="Business phone" error={fieldErrors.phone}>
            <input className={inputClass} type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </Field>
          <Field label="Address" className="sm:col-span-2" error={fieldErrors.address}>
            <input className={inputClass} value={form.address} onChange={(e) => set("address", e.target.value)} />
          </Field>
        </div>

        <div className="flex items-center justify-between gap-3 pt-2">
          <Button variant="ghost" icon={FiLogOut} onClick={redirectToLogin}>
            Sign out
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Setting up…" : "Open my books"}
            {!saving && <FiArrowRight className="h-4 w-4" />}
          </Button>
        </div>
      </form>
    </AuthShell>
  );
}
