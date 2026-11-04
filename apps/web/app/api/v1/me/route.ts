import { apiCtx, mePayload, respond } from "../../../../lib/api";

/** The signed-in person, their role and the active business, plus every business they belong to. */
export async function GET(req: Request) {
  return respond(async () => mePayload(await apiCtx(req)));
}
