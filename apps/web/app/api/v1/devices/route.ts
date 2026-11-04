import { apiCtx, jsonBody, respond } from "../../../../lib/api";
import { registerDevice } from "../../../../lib/services/devices";

/** Register or refresh this phone's Expo push token for the active business. Body: { token, platform: "ios" | "android" }. */
export async function POST(req: Request) {
  return respond(async () => registerDevice(await apiCtx(req), await jsonBody(req)));
}
