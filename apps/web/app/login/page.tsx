import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "../../components/Logo";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Log in", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; forgot?: string; reset?: string }> }) {
  const { next, forgot, reset } = await searchParams;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/today";
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <Link href="/" aria-label="Home" className="mb-8"><Logo size={36} /></Link>
      <LoginForm next={safeNext} startForgot={forgot === "1"} justReset={reset === "1"} />
    </div>
  );
}
