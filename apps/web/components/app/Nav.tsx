"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconBox, IconChat, IconCalendar, IconCart, IconClock, IconGear, IconHome, IconMore, IconScissors, IconSheet, IconSun2, IconTeam, IconUsers } from "./Icons";

const ICONS = {
  home: IconHome,
  calendar: IconCalendar,
  clients: IconUsers,
  clock: IconClock,
  timeoff: IconSun2,
  timesheets: IconSheet,
  services: IconScissors,
  register: IconCart,
  orders: IconSheet,
  products: IconBox,
  team: IconTeam,
  settings: IconGear,
  chat: IconChat,
  more: IconMore,
} as const;

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; badge?: number };

function isOn(path: string, href: string) {
  return path === href || path.startsWith(href + "/");
}

export function SideNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav aria-label="App" className="space-y-1">
      {items.map(({ href, label, icon, badge }) => {
        const on = isOn(path, href);
        const Icon = ICONS[icon];
        return (
          <Link
            key={href}
            href={href}
            aria-current={on ? "page" : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold ${on ? "bg-surface-2 text-fg" : "text-muted hover:bg-surface-2 hover:text-fg"}`}
          >
            <Icon />
            <span className="flex-1">{label}</span>
            {badge ? <span className="pill bg-primary text-primary-fg">{badge}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

/** Phone tabs: the first four screens plus More for the rest. */
export function BottomTabs({ items }: { items: NavItem[] }) {
  const path = usePathname();
  const tabs: NavItem[] = items.length > 5 ? [...items.slice(0, 4), { href: "/more", label: "More", icon: "more", badge: items.slice(4).reduce((n, i) => n + (i.badge ?? 0), 0) || undefined }] : items;
  return (
    <nav aria-label="App" className="fixed inset-x-0 bottom-0 z-40 flex items-center border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
      {tabs.map(({ href, label, icon, badge }) => {
        const on = isOn(path, href) || (href === "/more" && items.slice(4).some((i) => isOn(path, i.href)));
        const Icon = ICONS[icon];
        return (
          <Link key={href} href={href} aria-current={on ? "page" : undefined} className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${on ? "text-fg" : "text-muted"}`}>
            <Icon />
            {label}
            {badge ? <span className="absolute right-[calc(50%-18px)] top-1 h-2 w-2 rounded-full bg-overdue" aria-label={`${badge} waiting`} /> : null}
          </Link>
        );
      })}
    </nav>
  );
}
