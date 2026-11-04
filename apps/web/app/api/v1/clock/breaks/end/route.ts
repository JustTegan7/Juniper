import { apiCtx, clockPayload, respond } from "../../../../../../lib/api";
import { endBreak, clockStatus } from "../../../../../../lib/services/timeclock";

/** End the open break. Returns the message and the new clock status. */
export async function POST(req: Request) {
  return respond(async () => {
    const ctx = await apiCtx(req);
    const { message } = await endBreak(ctx);
    return { message, clock: clockPayload(await clockStatus(ctx)) };
  });
}
