import { apiCtx, jsonBody, respond } from "../../../../../lib/api";
import { removeDevice } from "../../../../../lib/services/devices";

/** Stop pushes to this phone (call before signing out). Body: { token }. Safe to call twice. */
export async function POST(req: Request) {
  return respond(async () => removeDevice(await apiCtx(req), await jsonBody(req)));
}
