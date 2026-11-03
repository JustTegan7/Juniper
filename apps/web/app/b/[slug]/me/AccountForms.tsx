"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { authClient } from "../../../../lib/auth-client";
import { manageFromAccountAction } from "../actions";

export function AccountSignIn({ slug, businessName }: { slug: string; businessName: string }) {
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const email = String(new FormData(e.currentTarget).get("email")).trim().toLowerCase();
    // Same answer either way, so nobody can check who is a client.
    await authClient.signIn.magicLink({ email, callbackURL: `/b/${slug}/me` });
    setPending(false);
    setSent(true);
  }
  return (
    <div className="card mx-auto max-w-sm p-6">
      <h1 className="text-2xl font-bold">Your appointments</h1>
      {sent ? (
        <p className="mt-3 text-sm">If you have booked with {businessName}, a sign in link is on its way. It works for 15 minutes.</p>
      ) : (
        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <p className="text-sm text-muted">No password needed. We will email you a link.</p>
          <label className="block"><span className="label">Email you booked with</span><input name="email" type="email" className="input" required autoComplete="email" /></label>
          <button className="btn btn-primary w-full" disabled={pending}>{pending ? "Sending..." : "Email me a link"}</button>
        </form>
      )}
    </div>
  );
}

export function ManageButton({ slug, id }: { slug: string; id: string }) {
  const [pending, start] = useTransition();
  return <button type="button" className="btn btn-soft btn-sm" disabled={pending} onClick={() => start(() => manageFromAccountAction(slug, id))}>Change or cancel</button>;
}

export function SignOut({ slug }: { slug: string }) {
  const router = useRouter();
  return <button type="button" className="btn btn-ghost btn-sm" onClick={async () => { await authClient.signOut(); router.replace(`/b/${slug}/me`); router.refresh(); }}>Sign out</button>;
}
