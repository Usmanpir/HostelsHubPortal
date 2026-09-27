import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runDailyJobs } from "@/services/jobs/daily-jobs";

/**
 * Daily scheduled job. On Vercel, configure in vercel.json and set CRON_SECRET;
 * Vercel sends `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const ok =
    !!secret &&
    header.length === expected.length &&
    timingSafeEqual(Buffer.from(header), Buffer.from(expected));
  if (!ok) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Unauthorized" } }, { status: 401 });
  try {
    return NextResponse.json({ data: await runDailyJobs() });
  } catch (error) {
    console.error("[cron:daily]", error);
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Job failed" } }, { status: 500 });
  }
}
