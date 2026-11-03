import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "../../lib/services/ctx";
import { isPlatformAdmin } from "../../lib/platform";
import { Logo } from "../../components/Logo";
import { SignOutButton } from "./SignOutButton";

export const metadata: Metadata = { title: "Welcome", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Signed in, but not on any team yet. */
export default async function WelcomePage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const admin = isPlatformAdmin(session.user.email);
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <Logo size={36} />
      <div className="card mt-8 w-full max-w-md p-6 text-center">
        <h1 className="text-2xl font-bold">You&apos;re signed in</h1>
        {admin ? (
          <p className="mt-2 text-muted">You are not on a business team yet. Create one, or add yourself to one, from the admin page.</p>
        ) : (
          <p className="mt-2 text-muted">{session.user.email} is not on a business team yet. Ask the owner or manager for an invite link, then open it while signed in.</p>
        )}
        <div className="mt-6 flex justify-center gap-2">
          {admin && <Link href="/admin" className="btn btn-primary">Open admin</Link>}
          <SignOutButton />
        </div>
      </div>
    </div>
  );
}
