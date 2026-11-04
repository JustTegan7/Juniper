import { NextRequest } from "next/server";
import { apiCtx, jsonBody, respond } from "../../../../lib/api";
import { listTimeOff, requestTimeOff } from "../../../../lib/services/timeoff";

/** Time off you can see: managers see everyone's, team members their own. `?scope=open` (default) or `?scope=past`. */
export async function GET(req: NextRequest) {
  return respond(async () => {
    const ctx = await apiCtx(req);
    const scope = req.nextUrl.searchParams.get("scope") === "past" ? "past" : "open";
    return { scope, requests: await listTimeOff(ctx, { scope }) };
  });
}

/** Request time off. Body: { startDay, endDay, allDay?, startTime?, endTime?, reason?, membershipId? }. */
export async function POST(req: Request) {
  return respond(async () => requestTimeOff(await apiCtx(req), await jsonBody(req)), 201);
}
