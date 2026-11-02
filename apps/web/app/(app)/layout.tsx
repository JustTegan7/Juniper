import type { Metadata } from "next";
import { getCtx } from "../../lib/services/ctx";
import { loadMembers } from "../../lib/services/workspace";
import { Shell } from "../../components/app/Shell";
import { ToastProvider } from "../../components/app/Toast";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getCtx();
  const members = await loadMembers(ctx.workspace.id);
  const color = members.find((m) => m.id === ctx.userId)?.color ?? "#4FB39C";
  return (
    <ToastProvider>
      <Shell me={{ id: ctx.userId, name: ctx.name, role: ctx.role }} color={color} workspaceName={ctx.workspace.name}>
        {children}
      </Shell>
    </ToastProvider>
  );
}
