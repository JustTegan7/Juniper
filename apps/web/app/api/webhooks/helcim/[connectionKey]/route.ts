import { handleHelcimWebhook } from "../../../../../lib/services/helcim-webhook";

// Helcim posts card transaction events here. One URL per connected Helcim account: /api/webhooks/helcim/<connectionKey>.
export async function POST(req: Request, { params }: { params: Promise<{ connectionKey: string }> }) {
  const { connectionKey } = await params;
  const rawBody = await req.text();
  const out = await handleHelcimWebhook({
    connectionKey,
    rawBody,
    headers: { id: req.headers.get("webhook-id"), timestamp: req.headers.get("webhook-timestamp"), signature: req.headers.get("webhook-signature") },
    now: new Date(),
    partnerToken: process.env.HELCIM_PARTNER_TOKEN,
  });
  return Response.json(out.body, { status: out.status });
}
