"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "../../lib/auth-client";

export function LoginForm({ next, startForgot = false, justReset = false }: { next: string; startForgot?: boolean; justReset?: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up" | "forgot">(startForgot ? "forgot" : "in");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email")).trim().toLowerCase();
    if (mode === "forgot") {
      // Same answer whether or not the email has a login, so nobody can probe for accounts.
      await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
      setPending(false);
      setSent(true);
      return;
    }
    const password = String(f.get("password"));
    const res =
      mode === "in"
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ email, password, name: String(f.get("name")).trim() });
    setPending(false);
    if (res.error) {
      setError(res.error.message ?? "That did not work. Check your email and password.");
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <div className="card w-full max-w-sm p-6">
      <h1 className="text-2xl font-bold">{mode === "in" ? "Welcome back" : mode === "up" ? "Create your login" : "Forgot your password?"}</h1>
      <p className="mt-1 text-sm text-muted">
        {mode === "in" ? "Log in to your account." : mode === "up" ? "For invited team members. Use the email you were invited with." : "We will email you a link to set a new one."}
      </p>
      {justReset && mode === "in" && <p className="mt-3 rounded-lg bg-surface-2 p-3 text-sm font-semibold">Password saved. Log in with your new password.</p>}
      {mode === "forgot" && sent ? (
        <div className="mt-6 space-y-3 text-sm">
          <p className="rounded-lg bg-surface-2 p-3">If that email has a login, a reset link is on its way. It works for one hour.</p>
          <p className="text-muted">Nothing after a few minutes? Check spam, or ask an owner to set a temporary password for you from the Team page.</p>
        </div>
      ) : (
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        {mode === "up" && (
          <div>
            <label className="label" htmlFor="name">Your name</label>
            <input className="input" id="name" name="name" required autoComplete="name" />
          </div>
        )}
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input className="input" id="email" name="email" type="email" required autoComplete="email" />
        </div>
        {mode !== "forgot" && (
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input
            className="input"
            id="password"
            name="password"
            type="password"
            required
            minLength={mode === "up" ? 10 : undefined}
            autoComplete={mode === "in" ? "current-password" : "new-password"}
          />
          {mode === "up" && <p className="mt-1 text-xs text-muted">At least 10 characters.</p>}
        </div>
        )}
        {error && <p className="text-sm text-overdue" role="alert">{error}</p>}
        <button className="btn btn-primary w-full" disabled={pending}>
          {pending ? "One sec..." : mode === "in" ? "Log in" : mode === "up" ? "Create login" : "Send reset link"}
        </button>
      </form>
      )}
      {mode === "in" && (
        <button type="button" className="mt-4 w-full text-center text-sm text-muted underline" onClick={() => { setMode("forgot"); setSent(false); setError(null); }}>
          Forgot password?
        </button>
      )}
      <button type="button" className="mt-2 w-full text-center text-sm text-muted underline" onClick={() => { setMode(mode === "in" ? "up" : "in"); setSent(false); setError(null); }}>
        {mode === "in" ? "First time here? Create your login" : "Already have a login? Log in"}
      </button>
    </div>
  );
}
