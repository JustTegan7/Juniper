import { apiCtx, jsonBody, respond } from "../../../../../../lib/api";
import { reviewTimeOff } from "../../../../../../lib/services/timeoff";

/** Owners and managers approve or deny a request. Body: { decision: "approved" | "denied", note? }. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const ctx = await apiCtx(req);
    const { id } = await params;
    return reviewTimeOff(ctx, { ...(await jsonBody(req)), id });
  });
}
