import { apiCtx, clockPayload, respond } from "../../../../lib/api";
import { clockStatus } from "../../../../lib/services/timeclock";

/** Your open shift and breaks, if any. */
export async function GET(req: Request) {
  return respond(async () => clockPayload(await clockStatus(await apiCtx(req))));
}
