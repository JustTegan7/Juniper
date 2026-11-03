import type { Metadata } from "next";
import { addDays, formatDay, isYmd } from "@evergreen/core";
import { getCtx } from "../../../lib/services/ctx";
import { loadCalendarDay } from "../../../lib/services/appointments";
import { loadCatalog, performers } from "../../../lib/services/catalog";
import { CalendarView } from "./CalendarView";

export const metadata: Metadata = { title: "Calendar" };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ day?: string; book?: string }> }) {
  const ctx = await getCtx();
  const sp = await searchParams;
  const day = sp.day && isYmd(sp.day) ? sp.day : ctx.today;
  const [cal, catalog] = await Promise.all([loadCalendarDay(ctx, day), loadCatalog(ctx.workspace.id)]);
  const bookableIds = cal.members.map((m) => m.membershipId);
  return (
    <CalendarView
      day={day}
      today={ctx.today}
      prev={addDays(day, -1)}
      next={addDays(day, 1)}
      title={formatDay(day, { weekday: "long", year: true })}
      tz={ctx.workspace.timezone}
      canEditAll={cal.canEditAll}
      myMembershipId={ctx.membershipId}
      clientLabel={ctx.workspace.vocab.client}
      staffLabel={ctx.workspace.vocab.staff}
      openBook={sp.book === "1"}
      columns={cal.members.map((m) => ({ id: m.membershipId, name: m.name, color: m.color, title: m.title }))}
      windows={cal.plan.staffWindows}
      businessWindows={cal.plan.businessWindows}
      timeOff={cal.plan.timeOff}
      items={cal.items}
      services={catalog.services.map((s) => ({
        id: s.id,
        name: s.name,
        minutes: s.activeBefore + s.processing + s.activeAfter,
        staffIds: performers(catalog, s.id, bookableIds),
      }))}
    />
  );
}
