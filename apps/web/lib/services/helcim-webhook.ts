import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { helcimConnections, webhookEvents } from "@evergreen/db";
import { db } from "../db";
import { decryptSecret } from "../helcim/crypto";
import { getCardTransaction, type CardTransaction, type HelcimAuth } from "../helcim/client";
import { verifyHelcimSignature, type WebhookHeaders } from "../helcim/signature";
import { resolveCardTransaction, resolveTerminalCancel } from "./helcim-payments";

export interface WebhookInput {
  connectionKey: string;
  rawBody: string;
  headers: WebhookHeaders;
  now: Date;
  partnerToken?: string;
  /** Injected so tests never call Helcim. */
  fetchTransaction?: (auth: HelcimAuth, id: string) => Promise<CardTransaction>;
}

export interface WebhookOutput {
  status: number;
  body: { ok: boolean; result?: string; error?: string };
}

const fail = (status: number, error: string): WebhookOutput => ({ status, body: { ok: false, error } });

/**
 * Helcim webhook entry point. Order matters: signature first, then dedupe, then the real work.
 * Any 5xx makes Helcim retry, which is what we want when our own side failed. 2xx means "done, do not resend".
 */
export async function handleHelcimWebhook(input: WebhookInput): Promise<WebhookOutput> {
  const d = db();
  const [conn] = await d
    .select()
    .from(helcimConnections)
    .where(and(eq(helcimConnections.connectionKey, input.connectionKey), isNull(helcimConnections.deletedAt)))
    .limit(1);
  if (!conn) return fail(404, "unknown connection");
  if (!conn.verifierTokenEnc) return fail(400, "verifier token not set");

  let verifier: string;
  let apiToken: string;
  try {
    verifier = decryptSecret(conn.verifierTokenEnc);
    apiToken = decryptSecret(conn.apiTokenEnc);
  } catch {
    return fail(500, "stored tokens could not be read");
  }

  const sig = verifyHelcimSignature({ headers: input.headers, body: input.rawBody, verifierToken: verifier, now: input.now });
  if (!sig.ok) return fail(401, `signature ${sig.reason}`);

  let payload: Record<string, unknown>;
  try {
    const parsed = JSON.parse(input.rawBody);
    if (!parsed || typeof parsed !== "object") throw new Error("not an object");
    payload = parsed as Record<string, unknown>;
  } catch {
    return fail(400, "body is not JSON");
  }
  const type = typeof payload.type === "string" ? payload.type : "unknown";
  const helcimId = payload.id !== undefined ? String(payload.id) : null;
  const webhookId = input.headers.id!;

  // Dedupe. A row that exists but was never processed means an earlier run died, so run it again.
  const inserted = await d
    .insert(webhookEvents)
    .values({ workspaceId: conn.workspaceId, webhookId, type, helcimId })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id });
  if (!inserted.length) {
    const [existing] = await d.select().from(webhookEvents).where(eq(webhookEvents.webhookId, webhookId)).limit(1);
    if (existing?.processedAt) return { status: 200, body: { ok: true, result: "duplicate" } };
  }

  let result: string;
  try {
    if (type === "cardTransaction") {
      if (!helcimId) return fail(400, "missing transaction id");
      const auth: HelcimAuth = { apiToken, partnerToken: input.partnerToken };
      const txn = await (input.fetchTransaction ?? ((a, id) => getCardTransaction(a, id)))(auth, helcimId);
      result = await resolveCardTransaction(conn.workspaceId, txn, input.now);
    } else if (type === "terminalCancel") {
      result = await resolveTerminalCancel(
        conn.workspaceId,
        {
          invoiceNumber: typeof payload.invoiceNumber === "string" ? payload.invoiceNumber : null,
          deviceCode: typeof payload.deviceCode === "string" ? payload.deviceCode : null,
          transactionAmount: typeof payload.transactionAmount === "number" ? payload.transactionAmount : null,
        },
        input.now,
      );
    } else {
      result = "ignored_type";
    }
  } catch (e) {
    console.error("helcim webhook failed", type, helcimId, e instanceof Error ? e.message : e);
    return fail(500, "processing failed, will retry");
  }

  await d.update(webhookEvents).set({ processedAt: input.now, result }).where(eq(webhookEvents.webhookId, webhookId));
  return { status: 200, body: { ok: true, result } };
}
