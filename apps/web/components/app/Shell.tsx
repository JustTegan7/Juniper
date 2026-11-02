"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "../../lib/auth-client";
import { Logo, Mark } from "../Logo";
import { BottomTabs, SideNav } from "./Nav";
import { IconSun } from "./Icons";

const THEME_KEY = "app-theme";

function toggleTheme() {
  const root = document.documentElement;
  const isDark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  const next = isDark ? "light" : "dark";
  root.dataset.theme = next;
  try { localStorage.setItem(THEME_KEY, next); } catch {}
}

function ThemeToggle() {
  return <button type="button" onClick={toggleTheme} className="btn btn-ghost btn-sm" aria-label="Switch light or dark"><IconSun /></button>;
}

export function Shell({
  children,
  me,
  color,
  workspaceName,
}: {
  children: React.ReactNode;
  me: { id: string; name: string; role: string };
  color: string;
  workspaceName: string;
}) {
  const router = useRouter();

  async function signOut() {
    await authClient.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen md:grid md:grid-cols-[232px_1fr]">
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-line bg-surface p-4 md:flex">
        <Link href="/home" className="mb-6 px-2" aria-label="Home"><Logo /></Link>
        <SideNav />
        <div className="mt-auto space-y-2 border-t border-line pt-4">
          <p className="px-2 text-xs text-muted">{workspaceName}</p>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <button type="button" className="btn btn-ghost btn-sm" onClick={signOut}>Sign out</button>
          </div>
        </div>
      </aside>

      <div className="min-w-0 pb-24 md:pb-0">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-bg/90 px-4 backdrop-blur sm:px-6">
          <Link href="/home" className="md:hidden" aria-label="Home"><Mark size={26} /></Link>
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-muted md:hidden">{workspaceName}</p>
          <div className="hidden flex-1 md:block" />
          <div className="md:hidden"><ThemeToggle /></div>
          <details className="relative">
            <summary className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: color }} aria-label="Account">
              {me.name.slice(0, 1).toUpperCase()}
            </summary>
            <div className="card absolute right-0 mt-2 w-48 p-2 shadow-lg">
              <p className="px-2 py-1 text-sm font-semibold">{me.name}</p>
              <p className="px-2 pb-2 text-xs capitalize text-muted">{me.role}</p>
              <button type="button" className="btn btn-ghost btn-sm w-full justify-start" onClick={signOut}>Sign out</button>
            </div>
          </details>
        </header>
        <main id="main-content" className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</main>
      </div>

      <BottomTabs />
    </div>
  );
}
