import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { runJobs } from "@/lib/jobs";

export const dynamic = "force-dynamic";

// Call every minute: Vercel Cron, a GitHub Action, or `* * * * * curl -H "Authorization: Bearer $CRON_SECRET" …`
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${config().CRON_SECRET}`)
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const result = await runJobs();
  return NextResponse.json({ ok: true, ...result });
}
