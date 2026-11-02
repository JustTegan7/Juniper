"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "../../lib/auth-client";

export function ResetForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const pw = String(f.get("password"));
    if (pw !== String(f.get("confirm"))) return setError("Those passwords do not match.");
    setError(null);
    setPending(true);
    const res = await authClient.resetPassword({ newPassword: pw, token });
    setPending(false);
    if (res.error) return setError(res.error.message ?? "That link did not work. Ask for a new one.");
    router.replace("/login?reset=1");
  }

  return (
    <div className="card w-full max-w-sm p-6">
      <h1 className="text-2xl font-bold">Set a new password</h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div>
          <label className="label" htmlFor="password">New password</label>
          <input className="input" id="password" name="password" type="password" required minLength={10} autoComplete="new-password" />
          <p className="mt-1 text-xs text-muted">At least 10 characters.</p>
        </div>
        <div>
          <label className="label" htmlFor="confirm">Type it again</label>
          <input className="input" id="confirm" name="confirm" type="password" required minLength={10} autoComplete="new-password" />
        </div>
        {error && <p className="text-sm text-overdue" role="alert">{error}</p>}
        <button className="btn btn-primary w-full" disabled={pending}>{pending ? "One sec..." : "Save password"}</button>
      </form>
    </div>
  );
}
