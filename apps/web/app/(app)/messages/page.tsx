import type { Metadata } from "next";
import { getCtx, requireModule } from "../../../lib/services/ctx";
import { loadMembers } from "../../../lib/services/workspace";
import { Messages } from "./Messages";

export const metadata: Metadata = { title: "Messages" };

export default async function MessagesPage() {
  const ctx = await getCtx();
  requireModule(ctx, "messages");
  const members = await loadMembers(ctx.workspace.id);
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Messages</h1>
      <Messages meId={ctx.membershipId} canModerate={ctx.role === "owner" || ctx.role === "manager"} team={members.filter((m) => m.membershipId !== ctx.membershipId).map((m) => ({ membershipId: m.membershipId, name: m.name }))} />
    </div>
  );
}
