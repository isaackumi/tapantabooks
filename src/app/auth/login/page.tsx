"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FiArrowLeft, FiLogIn, FiPlay } from "react-icons/fi";
import { AuthShell, MockHint, OtpInput, PasswordInput, passwordProblem } from "@/components/auth/authShell";
import { Button, Field, FormError, inputClass } from "@/components/ui";
import { AppConstants } from "@/core/appConstants";
import { hasValidSession } from "@/core/session";
import { beginSession, changePasswordOnFirstLogin, login, verifyLoginOtp, verifyTenant, type LoginOutcome } from "@/services/coreAuth";

const DEMO = { username: "ama.mensah@kumasitraders.com.gh", password: "Demo@1234" };

type Step = "credentials" | "mfa" | "verify-tenant" | "first-login";

const STEP_COPY: Record<Step, { title: string; subtitle: string }> = {
  credentials: { title: "Sign in", subtitle: "Use the email or phone number on your Trovesuite account." },
  mfa: { title: "Enter your sign-in code", subtitle: "We sent a 6-digit code to your email." },
  "verify-tenant": {
    title: "Verify your account",
    subtitle: "Your company account has not been verified yet. Enter the 6-digit verification code you received from Trovesuite.",
  },
  "first-login": { title: "Choose a new password", subtitle: "This is your first sign-in. Replace the temporary password you were given." },
};

const LoginFlow = () => {
  const router = useRouter();
  const params = useSearchParams();
  const [step, setStep] = useState<Step>("credentials");
  const [username, setUsername] = useState(params.get("username") ?? "");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(params.get("notice"));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (hasValidSession()) router.replace("/dashboard");
  }, [router]);

  const handle = async (outcome: LoginOutcome) => {
    setOtp("");
    switch (outcome.kind) {
      case "signed-in": {
        const started = await beginSession(outcome.token);
        if (!started.ok) {
          setError(started.message);
          setStep("credentials");
          return;
        }
        router.replace("/dashboard");
        return;
      }
      case "mfa":
        setNotice(outcome.message);
        setStep("mfa");
        return;
      case "tenant-not-verified":
        setStep("verify-tenant");
        return;
      case "first-login":
        setStep("first-login");
        return;
      case "error":
        setError(outcome.message);
    }
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

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      if (step === "credentials") {
        setNotice(null);
        await handle(await login(username.trim(), password));
      } else if (step === "mfa") {
        await handle(await verifyLoginOtp(username.trim(), otp));
      } else if (step === "verify-tenant") {
        const res = await verifyTenant(username.trim(), otp);
        if (!res.ok) return setError(res.message);
        await handle(await login(username.trim(), password));
      } else {
        const problem = passwordProblem(newPassword, confirm);
        if (problem) return setError(problem);
        const res = await changePasswordOnFirstLogin(username.trim(), password, newPassword);
        if (!res.ok) return setError(res.message);
        setPassword(newPassword);
        await handle(await login(username.trim(), newPassword));
      }
    });
  };

  const signInAsDemo = () => {
    setUsername(DEMO.username);
    setPassword(DEMO.password);
    void run(async () => handle(await login(DEMO.username, DEMO.password)));
  };

  const back = () => {
    setStep("credentials");
    setError(null);
    setNotice(null);
    setOtp("");
  };

  const copy = STEP_COPY[step];

  return (
    <AuthShell title={copy.title} subtitle={copy.subtitle}>
      <form onSubmit={submit} className="space-y-4">
        {notice && step === "credentials" && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
            {notice}
          </div>
        )}
        <FormError message={error} />

        {step === "credentials" && (
          <>
            <Field label="Email or phone number">
              <input className={inputClass} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required autoFocus />
            </Field>
            <Field label="Password">
              <PasswordInput value={password} onChange={setPassword} autoComplete="current-password" />
            </Field>
            <div className="flex justify-end">
              <Link href={`/auth/forgot-password${username ? `?username=${encodeURIComponent(username)}` : ""}`} className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-400">
                Forgot password?
              </Link>
            </div>
          </>
        )}

        {(step === "mfa" || step === "verify-tenant") && (
          <Field label={step === "mfa" ? "Sign-in code" : "Verification code"} hint={`For ${username}`}>
            <OtpInput value={otp} onChange={setOtp} />
          </Field>
        )}

        {step === "first-login" && (
          <>
            <Field label="New password" hint="At least 8 characters, with letters and a number.">
              <PasswordInput value={newPassword} onChange={setNewPassword} autoComplete="new-password" />
            </Field>
            <Field label="Confirm new password">
              <PasswordInput value={confirm} onChange={setConfirm} autoComplete="new-password" />
            </Field>
          </>
        )}

        <Button type="submit" className="w-full" icon={step === "credentials" ? FiLogIn : undefined} disabled={busy || (step !== "credentials" && step !== "first-login" && otp.length !== 6)}>
          {busy ? "Please wait…" : step === "credentials" ? "Sign in" : step === "first-login" ? "Save and sign in" : "Verify"}
        </Button>

        {step !== "credentials" && (
          <button type="button" onClick={back} className="flex w-full items-center justify-center gap-2 text-sm text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white">
            <FiArrowLeft className="h-4 w-4" /> Use a different account
          </button>
        )}
      </form>

      {step === "credentials" && (
        <>
          {AppConstants.useMockApi && (
            <>
              <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-wide text-neutral-400">
                <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-700" />
                or
                <span className="h-px flex-1 bg-neutral-200 dark:bg-neutral-700" />
              </div>
              <Button variant="secondary" className="w-full" icon={FiPlay} onClick={signInAsDemo} disabled={busy}>
                Continue with the demo company
              </Button>
            </>
          )}
          <p className="mt-6 text-center text-sm text-neutral-600 dark:text-neutral-400">
            New to Trovesuite?{" "}
            <Link href="/auth/sign-up" className="font-semibold text-brand-700 hover:underline dark:text-brand-400">
              Create an account
            </Link>
          </p>
        </>
      )}

      <MockHint>
        Demo backend: every one-time code is <span className="font-mono font-semibold">123456</span>. Demo users sign in with{" "}
        <span className="font-mono">Demo@1234</span>.
      </MockHint>
    </AuthShell>
  );
};

export default function LoginPage() {
  return (
    <Suspense>
      <LoginFlow />
    </Suspense>
  );
}
