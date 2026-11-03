import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { user } from "@evergreen/db";
import { Logo } from "../../components/Logo";
import { db } from "../../lib/db";
import { getSession } from "../../lib/services/ctx";
import { findInvite } from "../../lib/services/team";
import { AcceptButton, JoinForm } from "./JoinForms";

export const metadata: Metadata = { title: "Join your team", robots: { index: false } };
export const dynamic = "force-dynamic";

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <Logo size={36} />
      <div className="card mt-8 w-full max-w-sm p-6">{children}</div>
    </div>
  );
}

export default async function JoinPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const [found, session] = await Promise.all([findInvite(token), getSession()]);
  if (!found) {
    return (
      <Wrap>
        <h1 className="text-2xl font-bold">This invite is not valid</h1>
        <p className="mt-2 text-sm text-muted">It may have expired or already been used. Ask your manager to send a new one.</p>
        <Link href="/login" className="btn btn-soft mt-4 w-full">Log in</Link>
      </Wrap>
    );
  }
  const email = found.invite.email;
  const loginNext = `/login?next=${encodeURIComponent(`/join?token=${token}`)}`;
  if (session) {
    const same = session.user.email.toLowerCase() === email;
    return (
      <Wrap>
        <h1 className="text-2xl font-bold">Join {found.wsName}</h1>
        {same ? (
          <AcceptButton token={token} />
        ) : (
          <p className="mt-2 text-sm">This invite is for <span className="font-semibold">{email}</span>, but you are signed in as {session.user.email}. Sign out and log in with {email}.</p>
        )}
      </Wrap>
    );
  }
  const [existing] = await db().select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
  return (
    <Wrap>
      <h1 className="text-2xl font-bold">Join {found.wsName}</h1>
      {existing ? (
        <>
          <p className="mt-2 text-sm text-muted">You already have a login for {email}. Log in to accept.</p>
          <Link href={loginNext} className="btn btn-primary mt-4 w-full">Log in</Link>
        </>
      ) : (
        <JoinForm token={token} email={email} />
      )}
    </Wrap>
  );
}
