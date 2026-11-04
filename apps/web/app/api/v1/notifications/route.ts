import { apiCtx, jsonBody, respond } from "../../../../lib/api";
import { getNotificationSettings, setNotificationSettings } from "../../../../lib/services/devices";

/** This person's push choices for the active business: { bookings, timeOff }. Default on. */
export async function GET(req: Request) {
  return respond(async () => getNotificationSettings(await apiCtx(req)));
}

/** Change one or both choices. Body: { bookings?: boolean, timeOff?: boolean }. Returns the new choices. */
export async function POST(req: Request) {
  return respond(async () => setNotificationSettings(await apiCtx(req), await jsonBody(req)));
}
