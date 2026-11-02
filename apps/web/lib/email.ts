import "server-only";

/**
 * Sends one email through Resend's HTTP API. Needs RESEND_API_KEY and EMAIL_FROM
 * (for example "Your App <no-reply@example.com>") in Vercel. Returns false when
 * email is not set up yet, so callers can fall back gracefully.
 */
export async function sendEmail(msg: { to: string; subject: string; text: string; html?: string }): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) {
    console.warn("Email is not set up (RESEND_API_KEY / EMAIL_FROM). Skipped:", msg.subject);
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html }),
  });
  if (!res.ok) {
    console.error("Email send failed", res.status, await res.text().catch(() => ""));
    return false;
  }
  return true;
}

export function emailEnabled() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}
