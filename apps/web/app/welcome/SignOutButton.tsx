"use client";

import { useRouter } from "next/navigation";
import { authClient } from "../../lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  return <button type="button" className="btn btn-ghost" onClick={async () => { await authClient.signOut(); router.replace("/login"); router.refresh(); }}>Sign out</button>;
}
