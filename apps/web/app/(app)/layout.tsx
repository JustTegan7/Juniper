import type { Metadata } from "next";
import { and, count, eq, isNull } from "drizzle-orm";
import { timeOff } from "@evergreen/db";
import { isManager } from "@evergreen/core";
import { getCtx } from "../../lib/services/ctx";
import { db } from "../../lib/db";
import { loadMembers } from "../../lib/services/workspace";
import { Shell } from "../../components/app/Shell";
import { ToastProvider } from "../../components/app/Toast";
import type { NavItem } from "../../components/app/Nav";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getCtx();
  const manager = isManager(ctx.role);
  const [members, pending] = await Promise.all([
    loadMembers(ctx.workspace.id),
    manager
      ? db().select({ n: count() }).from(timeOff).where(and(eq(timeOff.workspaceId, ctx.workspace.id), eq(timeOff.status, "pending"), isNull(timeOff.deletedAt)))
      : Promise.resolve([{ n: 0 }]),
  ]);
  const color = members.find((m) => m.id === ctx.userId)?.color ?? "#4F5D95";
  const v = ctx.workspace.vocab;
  const shopNav: NavItem[] = ctx.workspace.settings.shop.enabled
    ? [{ href: "/register", label: "Register", icon: "register" }, { href: "/orders", label: "Orders", icon: "orders" } as NavItem, ...(manager ? [{ href: "/products", label: "Products", icon: "products" } as NavItem] : [])]
    : [];
  const nav: NavItem[] = [
    { href: "/today", label: "Today", icon: "home" },
    { href: "/calendar", label: "Calendar", icon: "calendar" },
    { href: "/clients", label: v.clientPlural, icon: "clients" },
    { href: "/clock", label: "Time clock", icon: "clock" },
    { href: "/time-off", label: "Time off", icon: "timeoff", badge: Number(pending[0]?.n ?? 0) || undefined },
    { href: "/timesheets", label: "Timesheets", icon: "timesheets" },
    ...shopNav,
    ...(manager
      ? ([
          { href: "/services", label: v.servicePlural, icon: "services" },
          { href: "/team", label: "Team", icon: "team" },
          { href: "/settings", label: "Settings", icon: "settings" },
        ] satisfies NavItem[])
      : []),
  ];
  return (
    <ToastProvider>
      <Shell
        me={{ id: ctx.userId, name: ctx.name, role: ctx.role }}
        color={color}
        workspaceName={ctx.workspace.name}
        workspaceId={ctx.workspace.id}
        workspaces={ctx.workspaces}
        nav={nav}
        isPlatformAdmin={ctx.isPlatformAdmin}
      >
        {children}
      </Shell>
    </ToastProvider>
  );
}
