import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { payouts, users, flags } from "@/db/schema";
import { config } from "./config";
import { DomainError } from "./errors";
import { availableForPayout, post } from "./ledger";
import { paymentProvider } from "./payments";
import { enqueueSms } from "./notify";
import { audit } from "./audit";
import { formatUGX, normalizeUgPhone } from "./rules";

export async function requestPayout(
  landlord: { id: string; landlordStatus: string },
  input: { amountUgx: number; method: "MTN" | "AIRTEL" | "BANK"; destination: string },
) {
  const cfg = config();
  if (landlord.landlordStatus !== "VERIFIED") throw new DomainError("Only verified landlords can withdraw.");
  if (!Number.isInteger(input.amountUgx) || input.amountUgx < cfg.MIN_PAYOUT_UGX)
    throw new DomainError(`Minimum withdrawal is ${formatUGX(cfg.MIN_PAYOUT_UGX)}.`);
  let destination = input.destination.trim();
  if (input.method !== "BANK") {
    const p = normalizeUgPhone(destination);
    if (!p) throw new DomainError("Enter a valid Mobile Money number.");
    destination = p;
  } else if (destination.length < 6) throw new DomainError("Enter the bank name and account number.");

  return db.transaction(async (tx) => {
    // Serialise payout requests per landlord so two taps can't both pass the balance check.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`payout:${landlord.id}`}))`);
    const { available } = await availableForPayout(tx, landlord.id);
    if (input.amountUgx > available) throw new DomainError(`You can withdraw up to ${formatUGX(available)}.`);
    const [p] = await tx.insert(payouts).values({ landlordId: landlord.id, amountUgx: input.amountUgx, method: input.method, destination }).returning({ id: payouts.id });
    await audit(tx, landlord.id, "payout.request", "payout", p.id, { amountUgx: input.amountUgx });
    return p.id;
  });
}

export async function reviewPayout(admin: { id: string }, payoutId: string, approve: boolean, note?: string) {
  await db.transaction(async (tx) => {
    const [p] = await tx.select().from(payouts).where(eq(payouts.id, payoutId)).for("update");
    if (!p || p.status !== "REQUESTED") throw new DomainError("Payout already reviewed.");
    await tx.update(payouts).set({ status: approve ? "APPROVED" : "REJECTED", reviewedById: admin.id, note: note ?? null }).where(eq(payouts.id, p.id));
    if (!approve) {
      const [u] = await tx.select().from(users).where(eq(users.id, p.landlordId));
      await enqueueSms(tx, u.phone, `FindEkifo: your withdrawal of ${formatUGX(p.amountUgx)} was declined${note ? `: ${note}` : ""}. The money is still in your balance.`);
    }
    await audit(tx, admin.id, `payout.${approve ? "approve" : "reject"}`, "payout", p.id, { note });
  });
}

/**
 * Send an APPROVED payout. Mobile Money goes through the provider using the payout id as the
 * transfer reference — providers reject duplicate references, which makes retries safe.
 * Bank payouts are sent manually and confirmed here with the bank reference.
 */
export async function executePayout(admin: { id: string }, payoutId: string, manualReference?: string) {
  const [p] = await db.select().from(payouts).where(eq(payouts.id, payoutId));
  if (!p || p.status !== "APPROVED") throw new DomainError("Only approved payouts can be sent.");
  const [landlord] = await db.select().from(users).where(eq(users.id, p.landlordId));

  let reference = manualReference?.trim();
  if (p.method === "BANK") {
    if (!reference) throw new DomainError("Enter the bank transfer reference.");
  } else {
    const res = await paymentProvider()
      .disburse({ reference: `PO-${p.id}`, amountUgx: p.amountUgx, msisdn: p.destination, network: p.method, beneficiaryName: landlord.name ?? "FindEkifo landlord", narration: "FindEkifo payout" })
      .catch((e) => ({ ok: false as const, message: String(e), providerRef: undefined }));
    if (!res.ok) {
      await db.update(payouts).set({ status: "FAILED", note: res.message?.slice(0, 300) }).where(eq(payouts.id, p.id));
      await db.insert(flags).values({ kind: "USER_REPORT", reason: `Payout ${p.id} to ${p.destination} failed: ${res.message}` });
      throw new DomainError(`Transfer failed: ${res.message}`);
    }
    reference = res.providerRef;
  }

  await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(payouts).where(eq(payouts.id, p.id)).for("update");
    if (locked.status !== "APPROVED") return; // a concurrent click already finished it
    await tx.update(payouts).set({ status: "PAID", note: reference ? `Ref ${reference}` : null }).where(eq(payouts.id, p.id));
    await post(tx, [
      { account: "LANDLORD_PAYABLE", ownerId: p.landlordId, amount: -p.amountUgx },
      { account: "PAYOUT_CLEARING", amount: p.amountUgx },
    ], { memo: `Payout to ${p.destination}`, payoutId: p.id });
    await enqueueSms(tx, landlord.phone, `FindEkifo: ${formatUGX(p.amountUgx)} has been sent to ${p.destination}.`);
    await audit(tx, admin.id, "payout.paid", "payout", p.id, { reference });
  });
}
