"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FiCheckCircle, FiUserPlus } from "react-icons/fi";
import { AuthShell, MockHint, OtpInput, PasswordInput, passwordProblem } from "@/components/auth/authShell";
import { Button, Field, FormError, inputClass } from "@/components/ui";
import { beginSession, login, signup, verifyTenant } from "@/services/coreAuth";

const EMPTY = { fullname: "", email: "", contact: "", address: "", password: "", confirm: "" };

export default function SignUpPage() {
  const router = useRouter();
  const [form, setForm] = useState(EMPTY);
  const [step, setStep] = useState<"details" | "verify">("details");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof typeof EMPTY, string>>>({});
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const validate = () => {
    const errors: typeof fieldErrors = {};
    if (form.fullname.trim().split(/\s+/).length < 2) errors.fullname = "Enter your first and last name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = "Enter a valid email address.";
    if (!/^\+?\d{9,15}$/.test(form.contact.replace(/[\s-]/g, ""))) errors.contact = "Enter a phone number with country code, e.g. +233 24 000 0000.";
    if (!form.address.trim()) errors.address = "Enter the business address.";
    const pw = passwordProblem(form.password, form.confirm);
    if (pw) errors[pw.includes("match") ? "confirm" : "password"] = pw;
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } finally {
      setBusy(false);
    }
  };

  const submitDetails = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    void run(async () => {
      const res = await signup({
        fullname: form.fullname.trim(),
        email: form.email.trim().toLowerCase(),
        contact: form.contact.replace(/[\s-]/g, ""),
        address: form.address.trim(),
        password: form.password,
      });
      if (!res.ok) return setError(res.message);
      setStep("verify");
    });
  };

  const goToLogin = (message: string) =>
    router.replace(`/auth/login?username=${encodeURIComponent(form.email.trim().toLowerCase())}&notice=${encodeURIComponent(message)}`);

  const submitCode = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const username = form.email.trim().toLowerCase();
      const verified = await verifyTenant(username, otp);
      if (!verified.ok) return setError(verified.message);
      const outcome = await login(username, form.password);
      if (outcome.kind !== "signed-in") return goToLogin("Your account is verified. Sign in to continue.");
      const started = await beginSession(outcome.token);
      if (!started.ok) return setError(started.message);
      router.replace("/onboarding");
    });
  };

  if (step === "verify") {
    return (
      <AuthShell title="Verify your account" subtitle="One step before you open your books.">
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
          <FiCheckCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <p>
            Account created for <span className="font-semibold">{form.email.trim().toLowerCase()}</span>. Trovesuite will send you a verification
            code once your company is approved. Enter it here, or sign in later and we will ask for it then.
          </p>
        </div>
        <form onSubmit={submitCode} className="space-y-4">
          <FormError message={error} />
          <Field label="Verification code">
            <OtpInput value={otp} onChange={setOtp} />
          </Field>
          <Button type="submit" className="w-full" disabled={busy || otp.length !== 6}>
            {busy ? "Verifying…" : "Verify and continue"}
          </Button>
          <button
            type="button"
            onClick={() => goToLogin("Your account was created. Sign in once you have your verification code.")}
            className="w-full text-sm text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
          >
            I&apos;ll do this later
          </button>
        </form>
        <MockHint>
          Demo backend: the verification code is <span className="font-mono font-semibold">123456</span>.
        </MockHint>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Create your account" subtitle="Start keeping your books on Trovesuite. You will set up your company's currency and financial year next.">
      <form onSubmit={submitDetails} className="space-y-4" noValidate>
        <FormError message={error} />
        <Field label="Full name" required error={fieldErrors.fullname}>
          <input className={inputClass} value={form.fullname} onChange={set("fullname")} autoComplete="name" autoFocus />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Work email" required error={fieldErrors.email}>
            <input className={inputClass} type="email" value={form.email} onChange={set("email")} autoComplete="email" />
          </Field>
          <Field label="Phone number" required error={fieldErrors.contact}>
            <input className={inputClass} type="tel" value={form.contact} onChange={set("contact")} autoComplete="tel" placeholder="+233…" />
          </Field>
        </div>
        <Field label="Business address" required error={fieldErrors.address}>
          <input className={inputClass} value={form.address} onChange={set("address")} autoComplete="street-address" />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Password" required error={fieldErrors.password} hint="8+ characters, letters and a number">
            <PasswordInput value={form.password} onChange={(v) => setForm((f) => ({ ...f, password: v }))} autoComplete="new-password" />
          </Field>
          <Field label="Confirm password" required error={fieldErrors.confirm}>
            <PasswordInput value={form.confirm} onChange={(v) => setForm((f) => ({ ...f, confirm: v }))} autoComplete="new-password" />
          </Field>
        </div>
        <Button type="submit" className="w-full" icon={FiUserPlus} disabled={busy}>
          {busy ? "Creating account…" : "Create account"}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-neutral-600 dark:text-neutral-400">
        Already have an account?{" "}
        <Link href="/auth/login" className="font-semibold text-brand-700 hover:underline dark:text-brand-400">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
