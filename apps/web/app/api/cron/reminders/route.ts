import { NextResponse, type NextRequest } from "next/server";
import { sendDueReminders } from "../../../../lib/services/reminders";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Daily reminder emails. Vercel Cron calls this with the CRON_SECRET (see vercel.json). */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new NextResponse("Not allowed", { status: 401 });
  const result = await sendDueReminders();
  return NextResponse.json(result);
}
