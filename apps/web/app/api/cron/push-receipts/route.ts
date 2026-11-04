import { NextResponse, type NextRequest } from "next/server";
import { processPushReceipts } from "../../../../lib/services/push";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Removes push tokens Expo says are no longer registered. Vercel Cron calls this with the CRON_SECRET (see vercel.json). */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new NextResponse("Not allowed", { status: 401 });
  return NextResponse.json(await processPushReceipts());
}
