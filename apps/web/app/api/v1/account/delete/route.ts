import { apiCtx, jsonBody, respond } from "../../../../../lib/api";
import { deleteAccount } from "../../../../../lib/services/account";

/** Delete the signed-in person's login. Body: { confirm: "<your email>" }. See lib/services/account.ts for what stays. */
export async function POST(req: Request) {
  return respond(async () => deleteAccount(await apiCtx(req), await jsonBody(req)));
}
