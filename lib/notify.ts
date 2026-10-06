import { and, eq, lte, sql, inArray } from "drizzle-orm";
import { db, type Tx } from "@/db";
import { outbox } from "@/db/schema";
import { config } from "./config";

/**
 * Queue an SMS inside the caller's transaction. If the transaction rolls back, the message is
 * never sent; if it commits, the message is guaranteed to be attempted (with retries).
 */
export async function enqueueSms(tx: Tx, to: string, body: string) {
  await tx.insert(outbox).values({ channel: "sms", to, body });
}

async function sendSms(to: string, body: string): Promise<void> {
  const cfg = config();
  if (cfg.SMS_PROVIDER === "console") {
    console.log(`\n📱 SMS → ${to}\n   ${body}\n`);
    return;
  }
  const res = await fetch("https://api.ng.termii.com/api/sms/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: cfg.TERMII_API_KEY,
      to: to.replace("+", ""),
      from: cfg.TERMII_SENDER_ID,
      sms: body,
      type: "plain",
      channel: "generic",
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Termii ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

/** Send immediately, bypassing the outbox. Only for OTPs, where a delay makes the code useless. */
export async function sendSmsNow(to: string, body: string) {
  await sendSms(to, body);
}

const MAX_ATTEMPTS = 6;

/**
 * Deliver due outbox messages. Safe to run from several workers at once:
 * rows are claimed with FOR UPDATE SKIP LOCKED.
 */
export async function drainOutbox(batch = 25): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  await db.transaction(async (tx) => {
    const due = await tx
      .select()
      .from(outbox)
      .where(and(eq(outbox.status, "PENDING"), lte(outbox.sendAfter, new Date())))
      .orderBy(outbox.createdAt)
      .limit(batch)
      .for("update", { skipLocked: true });
    if (!due.length) return;

    const results = await Promise.allSettled(due.map((m) => sendSms(m.to, m.body)));
    const ok: string[] = [];
    for (let i = 0; i < due.length; i++) {
      const m = due[i];
      const r = results[i];
      if (r.status === "fulfilled") {
        ok.push(m.id);
        sent++;
      } else {
        failed++;
        const attempts = m.attempts + 1;
        const backoffSec = Math.min(3600, 15 * 2 ** attempts); // 30s, 60s, 2m … capped at 1h
        await tx
          .update(outbox)
          .set({
            attempts,
            lastError: String(r.reason).slice(0, 500),
            status: attempts >= MAX_ATTEMPTS ? "FAILED" : "PENDING",
            sendAfter: sql`now() + make_interval(secs => ${backoffSec})`,
          })
          .where(eq(outbox.id, m.id));
      }
    }
    if (ok.length) await tx.update(outbox).set({ status: "SENT" }).where(inArray(outbox.id, ok));
  });
  return { sent, failed };
}
