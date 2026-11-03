import type { Metadata } from "next";
import { formatDay, formatMinutes, ROLE_LABELS } from "@evergreen/core";
import { redirect } from "next/navigation";
import { isManager } from "@evergreen/core";
import { getCtx } from "../../../lib/services/ctx";
import { loadOverrides, loadStaffHours } from "../../../lib/services/hours";
import { loadMembers, loadPendingInvites } from "../../../lib/services/workspace";
import { emailEnabled } from "../../../lib/email";
import { TempPassword } from "../../../components/app/TempPassword";
import { InviteForm, MemberEditor, OverrideForm, RemoveOverride, RevokeInvite, StaffHours } from "./TeamForms";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ person?: string }> }) {
  const ctx = await getCtx();
  // Owners and managers only. Team members go back to their day.
  if (!isManager(ctx.role)) redirect("/today");
  const { person } = await searchParams;
  const [members, invites, hours, overrides] = await Promise.all([
    loadMembers(ctx.workspace.id),
    loadPendingInvites(ctx.workspace.id),
    loadStaffHours(ctx.workspace.id),
    loadOverrides(ctx.workspace.id, ctx.today, "9999-12-31"),
  ]);
  const selected = members.find((m) => m.membershipId === person);
  const v = ctx.workspace.vocab;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-3xl font-bold">Team</h1>
        <InviteForm canInviteOwner={ctx.role === "owner"} />
      </div>

      <section className="card p-5" aria-labelledby="h-members">
        <h2 id="h-members" className="font-bold">People</h2>
        <p className="mt-1 text-sm text-muted">
          {emailEnabled() ? "Locked out? Use Forgot password on the login page." : "Password reset emails are not set up yet. An owner can set a temporary password here."}
        </p>
        <ul className="mt-4 divide-y divide-line">
          {members.map((m) => (
            <li key={m.membershipId} className="flex flex-wrap items-center gap-3 py-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: m.color }}>{m.name.slice(0, 1)}</span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{m.name}{m.id === ctx.userId ? " (you)" : ""}</p>
                <p className="truncate text-sm text-muted">
                  {[m.title && m.title !== ROLE_LABELS[m.role] ? m.title : null, ROLE_LABELS[m.role], m.bookable ? (m.bookableOnline ? "Bookable online" : "Takes appointments") : "No appointments"].filter(Boolean).join(" · ")}
                </p>
                <p className="text-xs text-muted">
                  {(hours[m.membershipId] ?? []).length
                    ? summarizeHours(hours[m.membershipId])
                    : m.bookable ? `No weekly schedule yet, so they cannot be booked online.` : ""}
                </p>
              </div>
              <a className="btn btn-soft btn-sm" href={`/team?person=${m.membershipId}`}>Schedule</a>
              <MemberEditor
                member={{ membershipId: m.membershipId, name: m.name, role: m.role, title: m.title ?? "", bio: m.bio ?? "", color: m.color, bookable: m.bookable, bookableOnline: m.bookableOnline, sortOrder: m.sortOrder }}
                isOwner={ctx.role === "owner"}
                isSelf={m.id === ctx.userId}
                staffLabel={v.staff}
              />
              {ctx.role === "owner" && m.id !== ctx.userId && <TempPassword userId={m.id} name={m.name} />}
            </li>
          ))}
        </ul>
      </section>

      {invites.length > 0 && (
        <section className="card p-5" aria-labelledby="h-invites">
          <h2 id="h-invites" className="font-bold">Invites waiting</h2>
          <ul className="mt-2 divide-y divide-line">
            {invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>{i.email} · {ROLE_LABELS[i.role]}{i.title ? ` · ${i.title}` : ""} · expires {i.expiresAt.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                <RevokeInvite id={i.id} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {selected && (
        <section className="card p-5" aria-labelledby="h-sched">
          <h2 id="h-sched" className="font-bold">{selected.name}&apos;s schedule</h2>
          <p className="mt-1 text-sm text-muted">Their usual week. Online booking only offers times inside these hours and the business hours.</p>
          <div className="mt-3"><StaffHours membershipId={selected.membershipId} initial={hours[selected.membershipId] ?? []} /></div>
          <h3 className="mt-6 font-semibold">Changes on specific days</h3>
          <ul className="mt-2 divide-y divide-line text-sm">
            {(overrides[selected.membershipId] ?? []).map((o) => (
              <li key={o.id} className="flex items-center justify-between py-2">
                <span>{formatDay(o.day, { weekday: "long" })}: {o.start == null ? "Off" : `${formatMinutes(o.start)} to ${formatMinutes(o.end!)}`}{o.note ? ` · ${o.note}` : ""}</span>
                <RemoveOverride id={o.id} />
              </li>
            ))}
          </ul>
          <OverrideForm membershipId={selected.membershipId} today={ctx.today} />
        </section>
      )}
    </div>
  );
}

function summarizeHours(h: { weekday: number; start: number; end: number }[]) {
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const days = [...new Set(h.map((x) => x.weekday))].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
  return days.map((d) => `${names[d]} ${h.filter((x) => x.weekday === d).map((x) => `${formatMinutes(x.start)}-${formatMinutes(x.end)}`).join(", ")}`).join(" · ");
}
