import { apiCtx, clockPayload, respond } from "../../../../../lib/api";
import { clockIn, clockStatus } from "../../../../../lib/services/timeclock";

/** Clock in. Returns the message and the new clock status. */
export async function POST(req: Request) {
  return respond(async () => {
    const ctx = await apiCtx(req);
    const { message } = await clockIn(ctx);
    return { message, clock: clockPayload(await clockStatus(ctx)) };
  });
}
