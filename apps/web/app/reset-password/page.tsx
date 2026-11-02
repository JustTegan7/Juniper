import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "../../components/Logo";
import { ResetForm } from "./ResetForm";

export const metadata: Metadata = { title: "Reset password", robots: { index: false } };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token, error } = await searchParams;
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <Link href="/" aria-label="Home" className="mb-8"><Logo size={36} /></Link>
      {token && !error ? (
        <ResetForm token={token} />
      ) : (
        <div className="card w-full max-w-sm p-6 text-center">
          <h1 className="text-2xl font-bold">That link has expired</h1>
          <p className="mt-2 text-sm text-muted">Reset links work once, for one hour. Ask for a new one from the login page.</p>
          <Link href="/login?forgot=1" className="btn btn-primary mt-6 w-full">Send a new link</Link>
        </div>
      )}
    </div>
  );
}
