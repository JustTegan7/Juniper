import { apiCtx, respond } from "../../../../../../lib/api";
import { cancelTimeOff } from "../../../../../../lib/services/timeoff";

/** Cancel a request (your own, or anyone's for managers). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const ctx = await apiCtx(req);
    const { id } = await params;
    return cancelTimeOff(ctx, { id });
  });
}
