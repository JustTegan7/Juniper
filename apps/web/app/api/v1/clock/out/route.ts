import { apiCtx, clockPayload, respond } from "../../../../../lib/api";
import { clockOut, clockStatus } from "../../../../../lib/services/timeclock";

/** Clock out (also ends an open break). Returns the message and the new clock status. */
export async function POST(req: Request) {
  return respond(async () => {
    const ctx = await apiCtx(req);
    const { message } = await clockOut(ctx);
    return { message, clock: clockPayload(await clockStatus(ctx)) };
  });
}
