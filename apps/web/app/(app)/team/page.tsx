import type { Metadata } from "next";
import { getCtx } from "../../../lib/services/ctx";
import { loadMembers } from "../../../lib/services/workspace";
import { emailEnabled } from "../../../lib/email";
import { TempPassword } from "../../../components/app/TempPassword";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  const ctx = await getCtx();
  if (ctx.role === "member") {
    return (
      <div>
        <h1 className="text-3xl font-bold">Team</h1>
        <p className="card mt-6 p-10 text-center text-muted">Only owners and managers can see this page.</p>
      </div>
    );
  }
  const members = await loadMembers(ctx.workspace.id);

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-bold">Team</h1>

      <section className="card p-5" aria-labelledby="h-members">
        <h2 id="h-members" className="font-bold">Members</h2>
        <p className="mt-1 text-sm text-muted">
          {emailEnabled()
            ? "Locked out? Use Forgot password on the login page."
            : "Password reset emails are not set up yet. If someone is locked out, an owner can set a temporary password here."}
        </p>
        <ul className="mt-4 divide-y divide-line">
          {members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 py-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: m.color }}>{m.name.slice(0, 1)}</span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{m.name}{m.id === ctx.userId ? " (you)" : ""}</p>
                <p className="truncate text-sm text-muted">{m.email} · <span className="capitalize">{m.role}</span></p>
              </div>
              {ctx.role === "owner" && m.id !== ctx.userId && <TempPassword userId={m.id} name={m.name} />}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
