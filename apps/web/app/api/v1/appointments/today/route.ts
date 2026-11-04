import { NextRequest } from "next/server";
import { apiCtx, respond } from "../../../../../lib/api";
import { loadCalendarDay } from "../../../../../lib/services/appointments";

/** Today's appointments in the business time zone. `?scope=mine` (default) is your own column, `?scope=all` the whole calendar. */
export async function GET(req: NextRequest) {
  return respond(async () => {
    const ctx = await apiCtx(req);
    const scope = req.nextUrl.searchParams.get("scope") === "all" ? "all" : "mine";
    const day = await loadCalendarDay(ctx, ctx.today);
    return {
      day: day.day,
      timezone: ctx.workspace.timezone,
      scope,
      canEditAll: day.canEditAll,
      staff: day.members.map((m) => ({ membershipId: m.membershipId, name: m.name, color: m.color, title: m.title })),
      appointments: scope === "all" ? day.items : day.items.filter((a) => a.membershipId === ctx.membershipId),
    };
  });
}
