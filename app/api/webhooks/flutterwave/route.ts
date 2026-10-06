import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { db } from "@/db";
import { webhookEvents } from "@/db/schema";
import { config } from "@/lib/config";
import { reconcilePaymentRef } from "@/lib/booking";

/**
 * Flutterwave calls this on charge completion. We:
 *  1. authenticate it with the shared secret hash (constant-time compare),
 *  2. de-duplicate on the event id,
 *  3. ignore the payload's claims and re-verify the transaction with Flutterwave's API
 *     (a forged-but-authenticated body still can't mark something paid).
 */
export async function POST(req: Request) {
  const expected = config().FLW_WEBHOOK_HASH;
  const got = req.headers.get("verif-hash") ?? "";
  if (!expected || got.length !== expected.length || !timingSafeEqual(Buffer.from(got), Buffer.from(expected)))
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { event?: string; data?: { id?: number; tx_ref?: string } } | null;
  const txRef = body?.data?.tx_ref;
  if (!txRef) return NextResponse.json({ ok: true, ignored: true });

  const eventId = `flw:${body?.data?.id ?? txRef}:${body?.event ?? "charge"}`;
  const inserted = await db.insert(webhookEvents).values({ id: eventId, provider: "flutterwave", payload: body! }).onConflictDoNothing().returning();
  if (!inserted.length) return NextResponse.json({ ok: true, duplicate: true });

  try {
    await reconcilePaymentRef(txRef);
  } catch (e) {
    console.error("webhook settle failed", txRef, e);
    // 500 → Flutterwave retries. Drop our dedupe row so the retry is processed.
    const { eq } = await import("drizzle-orm");
    await db.delete(webhookEvents).where(eq(webhookEvents.id, eventId));
    return NextResponse.json({ error: "retry" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
