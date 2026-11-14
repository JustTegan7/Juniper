import type { Metadata } from "next";
import { and, count, eq, isNull } from "drizzle-orm";
import { timeOff } from "@evergreen/db";
import { isManager, isRetail } from "@evergreen/core";
import { getCtx } from "../../lib/services/ctx";
import { db } from "../../lib/db";
import { loadMembers } from "../../lib/services/workspace";
import { unreadTotal } from "../../lib/services/messages";
import { Shell } from "../../components/app/Shell";
import { ToastProvider } from "../../components/app/Toast";
import type { NavItem } from "../../components/app/Nav";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getCtx();
  const manager = isManager(ctx.role);
  const [members, pending, unread] = await Promise.all([
    loadMembers(ctx.workspace.id),
    manager
      ? db().select({ n: count() }).from(timeOff).where(and(eq(timeOff.workspaceId, ctx.workspace.id), eq(timeOff.status, "pending"), isNull(timeOff.deletedAt)))
      : Promise.resolve([{ n: 0 }]),
    unreadTotal(ctx),
  ]);
  const color = members.find((m) => m.id === ctx.userId)?.color ?? "#4F5D95";
  const v = ctx.workspace.vocab;
  const shopNav: NavItem[] = ctx.workspace.settings.shop.enabled
    ? [{ href: "/register", label: "Register", icon: "register" }, ...(manager ? [{ href: "/products", label: "Products", icon: "products" } as NavItem] : [])]
    : [];
  const retail = isRetail(ctx.workspace.template);
  const nav: NavItem[] = [
    ...(retail ? shopNav : [{ href: "/today", label: "Today", icon: "home" } as NavItem, { href: "/calendar", label: "Calendar", icon: "calendar" } as NavItem]),
    { href: "/messages", label: "Messages", icon: "chat", badge: unread || undefined },
    { href: "/clients", label: v.clientPlural, icon: "clients" },
    { href: "/clock", label: "Time clock", icon: "clock" },
    { href: "/time-off", label: "Time off", icon: "timeoff", badge: Number(pending[0]?.n ?? 0) || undefined },
    { href: "/timesheets", label: "Timesheets", icon: "timesheets" },
    ...(retail ? [] : shopNav),
    ...(manager
      ? ([
          ...(retail ? [] : [{ href: "/services", label: v.servicePlural, icon: "services" } as NavItem]),
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
