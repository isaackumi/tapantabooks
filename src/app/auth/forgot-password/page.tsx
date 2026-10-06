"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthShell, MockHint, OtpInput, PasswordInput, passwordProblem } from "@/components/auth/authShell";
import { Button, Field, FormError, inputClass } from "@/components/ui";
import { forgotPasswordRequest, forgotPasswordVerify } from "@/services/coreAuth";

const ForgotPasswordFlow = () => {
  const router = useRouter();
  const params = useSearchParams();
  const [username, setUsername] = useState(params.get("username") ?? "");
  const [step, setStep] = useState<"request" | "reset">("request");
  const [notice, setNotice] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (step === "reset") {
      const problem = passwordProblem(password, confirm);
      if (problem) return setError(problem);
    }
    setBusy(true);
    try {
      if (step === "request") {
        const res = await forgotPasswordRequest(username.trim());
        if (!res.ok) return setError(res.message);
        setNotice(res.message);
        setStep("reset");
      } else {
        const res = await forgotPasswordVerify(username.trim(), otp, password);
        if (!res.ok) return setError(res.message);
        router.replace(`/auth/login?username=${encodeURIComponent(username.trim())}&notice=${encodeURIComponent("Password changed. Sign in with your new password.")}`);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title={step === "request" ? "Reset your password" : "Choose a new password"}
      subtitle={step === "request" ? "We will send a 6-digit code to the email or phone on your account." : (notice ?? undefined)}
    >
      <form onSubmit={submit} className="space-y-4">
        <FormError message={error} />
        {step === "request" ? (
          <Field label="Email or phone number">
            <input className={inputClass} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required autoFocus />
          </Field>
        ) : (
          <>
            <Field label="Code" hint={`Sent to ${username}`}>
              <OtpInput value={otp} onChange={setOtp} />
            </Field>
            <Field label="New password" hint="At least 8 characters, with letters and a number.">
              <PasswordInput value={password} onChange={setPassword} autoComplete="new-password" />
            </Field>
            <Field label="Confirm new password">
              <PasswordInput value={confirm} onChange={setConfirm} autoComplete="new-password" />
            </Field>
          </>
        )}
        <Button type="submit" className="w-full" disabled={busy || (step === "reset" && otp.length !== 6)}>
          {busy ? "Please wait…" : step === "request" ? "Send code" : "Change password"}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-neutral-600 dark:text-neutral-400">
        <Link href="/auth/login" className="font-semibold text-brand-700 hover:underline dark:text-brand-400">
          Back to sign in
        </Link>
      </p>
      <MockHint>
        Demo backend: the code is <span className="font-mono font-semibold">123456</span>.
      </MockHint>
    </AuthShell>
  );
};

export default function ForgotPasswordPage() {
  return (
    <Suspense>
      <ForgotPasswordFlow />
    </Suspense>
  );
}
