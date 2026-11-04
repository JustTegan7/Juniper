import { apiCtx, jsonBody, respond } from "../../../../../../lib/api";
import { setStatus } from "../../../../../../lib/services/appointments";

/** Change an appointment's status (confirmed, checked_in, completed, cancelled, no_show, booked). Body: { status, notifyClient? }. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const ctx = await apiCtx(req);
    const { id } = await params;
    return setStatus(ctx, { ...(await jsonBody(req)), id });
  });
}
