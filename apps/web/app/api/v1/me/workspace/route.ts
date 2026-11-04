import { z } from "zod";
import { apiCtx, jsonBody, mePayload, respond } from "../../../../../lib/api";

/**
 * Switch business. Checks the membership and returns `me` for the new business. The phone keeps the
 * id and sends it as the x-juniper-workspace header from then on (the API is stateless, no cookie).
 */
export async function POST(req: Request) {
  return respond(async () => {
    const { workspaceId } = z.object({ workspaceId: z.uuid() }).parse(await jsonBody(req));
    return mePayload(await apiCtx(req, workspaceId));
  });
}
