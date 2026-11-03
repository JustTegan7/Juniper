"use client";

import { useState, useTransition } from "react";
import { acceptSignedInAction, joinWithSignupAction } from "./actions";

export function JoinForm({ token, email }: { token: string; email: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="mt-4 space-y-4"
      action={(f) =>
        start(async () => {
          const r = await joinWithSignupAction({ token, name: f.get("name"), password: f.get("password") });
          if (r && !r.ok) setError(r.error);
        })
      }
    >
      <p className="text-sm text-muted">Create your login for <span className="font-semibold text-fg">{email}</span>.</p>
      <label className="block"><span className="label">Your name</span><input name="name" className="input" required autoComplete="name" /></label>
      <label className="block">
        <span className="label">Password</span>
        <input name="password" type="password" className="input" required minLength={10} autoComplete="new-password" />
        <span className="mt-1 block text-xs text-muted">At least 10 characters.</span>
      </label>
      {error && <p className="text-sm text-overdue" role="alert">{error}</p>}
      <button className="btn btn-primary w-full" disabled={pending}>{pending ? "One sec..." : "Create login and join"}</button>
    </form>
  );
}

export function AcceptButton({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="mt-4">
      <button
        type="button"
        className="btn btn-primary w-full"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await acceptSignedInAction(token);
            if (r && !r.ok) setError(r.error);
          })
        }
      >
        {pending ? "Joining..." : "Join the team"}
      </button>
      {error && <p className="mt-2 text-sm text-overdue" role="alert">{error}</p>}
    </div>
  );
}
