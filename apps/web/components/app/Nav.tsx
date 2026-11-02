"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconHome, IconTeam } from "./Icons";

// App navigation. Each app replaces these items with its own screens.
const ITEMS = [
  { href: "/home", label: "Home", Icon: IconHome },
  { href: "/team", label: "Team", Icon: IconTeam },
];

export function SideNav() {
  const path = usePathname();
  return (
    <nav aria-label="App" className="space-y-1">
      {ITEMS.map(({ href, label, Icon }) => {
        const on = path === href || path.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            aria-current={on ? "page" : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold ${on ? "bg-surface-2 text-fg" : "text-muted hover:bg-surface-2 hover:text-fg"}`}
          >
            <Icon />
            <span className="flex-1">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomTabs() {
  const path = usePathname();
  return (
    <nav aria-label="App" className="fixed inset-x-0 bottom-0 z-40 flex items-center border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
      {ITEMS.map(({ href, label, Icon }) => {
        const on = path === href || path.startsWith(href + "/");
        return (
          <Link key={href} href={href} aria-current={on ? "page" : undefined} className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${on ? "text-fg" : "text-muted"}`}>
            <Icon />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
