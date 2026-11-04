import "server-only";

/** Thin wrapper over the Expo push service. Mocked in tests. */
const SEND_URL = "https://exp.host/--/api/v2/push/send";
const RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";

export interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  sound: "default";
  channelId: string;
  priority: "high";
}

export interface ExpoTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

export type ExpoReceipt = ExpoTicket;

function headers() {
  const h: Record<string, string> = { "content-type": "application/json", accept: "application/json" };
  // Optional: only needed when "Enhanced push security" is turned on for the Expo project.
  if (process.env.EXPO_ACCESS_TOKEN) h.authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
  return h;
}

/** Sends up to 100 messages. Returns one ticket per message, in order. */
export async function sendExpoMessages(messages: ExpoMessage[]): Promise<ExpoTicket[]> {
  const res = await fetch(SEND_URL, { method: "POST", headers: headers(), body: JSON.stringify(messages), signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`Expo push answered ${res.status}`);
  const json = (await res.json()) as { data?: ExpoTicket[] };
  return json.data ?? [];
}

/** Receipts for ticket ids (up to 300), keyed by ticket id. Receipts are ready about 15 minutes after sending. */
export async function getExpoReceipts(ids: string[]): Promise<Record<string, ExpoReceipt>> {
  const res = await fetch(RECEIPTS_URL, { method: "POST", headers: headers(), body: JSON.stringify({ ids }), signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Expo receipts answered ${res.status}`);
  const json = (await res.json()) as { data?: Record<string, ExpoReceipt> };
  return json.data ?? {};
}
