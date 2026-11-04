import { apiCtx, clockPayload, jsonBody, respond } from "../../../../../../lib/api";
import { startBreak, clockStatus } from "../../../../../../lib/services/timeclock";

/** Start a break. Body: { kind: "meal" | "rest" }. Returns the message and the new clock status. */
export async function POST(req: Request) {
  return respond(async () => {
    const ctx = await apiCtx(req);
    const { message } = await startBreak(ctx, await jsonBody(req));
    return { message, clock: clockPayload(await clockStatus(ctx)) };
  });
}
