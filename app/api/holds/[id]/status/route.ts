import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { holds } from "@/db/schema";
import { currentUser } from "@/lib/auth";
import { reconcileHold } from "@/lib/booking";

export const dynamic = "force-dynamic";

/** Polled by the "approve on your phone" screen. Each poll also asks the provider, so we don't depend on webhooks. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const [h] = await db.select().from(holds).where(eq(holds.id, id));
  if (!h || (h.seekerId !== user.id && user.role !== "ADMIN")) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (h.status === "PENDING_PAYMENT") {
    await reconcileHold(h.id, { force: h.paymentDeadline < new Date() });
    const [fresh] = await db.select({ status: holds.status }).from(holds).where(eq(holds.id, id));
    return NextResponse.json({ status: fresh.status }, { headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ status: h.status }, { headers: { "Cache-Control": "no-store" } });
}
