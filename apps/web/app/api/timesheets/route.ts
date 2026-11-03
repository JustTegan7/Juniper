import { NextResponse, type NextRequest } from "next/server";
import { isManager, isYmd } from "@evergreen/core";
import { getCtx } from "../../../lib/services/ctx";
import { timesheetCsv } from "../../../lib/services/timeclock";

/** Payroll CSV download. Owners and managers only. */
export async function GET(req: NextRequest) {
  const ctx = await getCtx();
  if (!isManager(ctx.role)) return new NextResponse("Not allowed", { status: 403 });
  const start = req.nextUrl.searchParams.get("start") ?? "";
  const end = req.nextUrl.searchParams.get("end") ?? "";
  const mode = req.nextUrl.searchParams.get("mode") === "detail" ? "detail" : "summary";
  if (!isYmd(start) || !isYmd(end) || end < start) return new NextResponse("Bad dates", { status: 400 });
  const csv = await timesheetCsv(ctx, start, end, mode);
  const name = `${ctx.workspace.slug}-timesheets-${start}-to-${end}-${mode}.csv`;
  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
  });
}
