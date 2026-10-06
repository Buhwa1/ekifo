import { and, eq, inArray, count } from "drizzle-orm";
import { db } from "@/db";
import { visits, units, properties, users } from "@/db/schema";
import { DomainError, isUniqueViolation } from "./errors";
import { enqueueSms } from "./notify";
import { audit } from "./audit";

type VisitStatus = (typeof visits.$inferSelect)["status"];

const KAMPALA_OFFSET_H = 3;
const fmtSlot = (d: Date) =>
  d.toLocaleString("en-UG", { timeZone: "Africa/Kampala", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** Viewings are allowed 08:00–18:00 Kampala time, from 1 hour to 30 days ahead. */
export function validateSlot(slot: Date, now = new Date()): string | null {
  if (Number.isNaN(slot.getTime())) return "Pick a valid date and time.";
  if (slot.getTime() < now.getTime() + 3_600_000) return "Pick a time at least an hour from now.";
  if (slot.getTime() > now.getTime() + 30 * 86_400_000) return "Visits can be booked up to 30 days ahead.";
  const hour = (slot.getUTCHours() + KAMPALA_OFFSET_H) % 24;
  if (hour < 8 || hour >= 18) return "Visits run between 8:00am and 6:00pm.";
  return null;
}

export async function requestVisit(seeker: { id: string; phone: string }, input: { unitId: string; slot: Date; note?: string }) {
  const err = validateSlot(input.slot);
  if (err) throw new DomainError(err);
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .select({ unit: units, property: properties, owner: users })
        .from(units)
        .innerJoin(properties, eq(properties.id, units.propertyId))
        .innerJoin(users, eq(users.id, properties.ownerId))
        .where(eq(units.id, input.unitId));
      if (!row || row.property.status !== "LIVE") throw new DomainError("This listing isn't taking visits right now.");
      if (row.property.ownerId === seeker.id) throw new DomainError("That's your own listing.");
      if (row.unit.status === "OCCUPIED" || row.unit.status === "UNLISTED") throw new DomainError("This space isn't available.");

      const [{ n }] = await tx
        .select({ n: count() })
        .from(visits)
        .where(and(eq(visits.seekerId, seeker.id), inArray(visits.status, ["REQUESTED", "CONFIRMED", "RESCHEDULED"])));
      if (n >= 8) throw new DomainError("You have 8 open visit requests. Wait for replies or cancel some first.");

      const [v] = await tx
        .insert(visits)
        .values({ unitId: row.unit.id, seekerId: seeker.id, slotStart: input.slot, note: input.note?.slice(0, 500) || null })
        .returning({ id: visits.id });
      await enqueueSms(tx, row.owner.phone,
        `FindEkifo: visit request for ${row.unit.label} at ${row.property.name} on ${fmtSlot(input.slot)} from ${seeker.phone}. Accept or reschedule in your Lead Inbox.`);
      await audit(tx, seeker.id, "visit.request", "visit", v.id);
      return v.id;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new DomainError("You've already requested that exact slot.");
    throw e;
  }
}

// Allowed transitions, by who may make them.
const OWNER_MOVES: Partial<Record<VisitStatus, VisitStatus[]>> = {
  REQUESTED: ["CONFIRMED", "DECLINED", "RESCHEDULED"],
  RESCHEDULED: ["DECLINED"],
  CONFIRMED: ["COMPLETED", "NO_SHOW", "RESCHEDULED", "DECLINED"],
};
const SEEKER_MOVES: Partial<Record<VisitStatus, VisitStatus[]>> = {
  REQUESTED: ["CANCELLED"],
  RESCHEDULED: ["CONFIRMED", "CANCELLED"], // seeker accepts the new time
  CONFIRMED: ["CANCELLED"],
};

export async function updateVisit(
  actor: { id: string; role: string },
  visitId: string,
  next: VisitStatus,
  proposedSlot?: Date,
) {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ visit: visits, unit: units, property: properties })
      .from(visits)
      .innerJoin(units, eq(units.id, visits.unitId))
      .innerJoin(properties, eq(properties.id, units.propertyId))
      .where(eq(visits.id, visitId))
      .for("update", { of: visits });
    if (!row) throw new DomainError("Visit not found.");
    const { visit, unit, property } = row;
    const isOwner = property.ownerId === actor.id || actor.role === "ADMIN";
    const isSeeker = visit.seekerId === actor.id;
    const allowed = [...(isOwner ? OWNER_MOVES[visit.status] ?? [] : []), ...(isSeeker ? SEEKER_MOVES[visit.status] ?? [] : [])];
    if (!allowed.includes(next)) throw new DomainError("That change isn't possible for this visit any more.");

    const patch: Partial<typeof visits.$inferInsert> = { status: next };
    if (next === "RESCHEDULED") {
      if (!proposedSlot) throw new DomainError("Pick the new time.");
      const err = validateSlot(proposedSlot);
      if (err) throw new DomainError(err);
      patch.proposedSlot = proposedSlot;
    }
    if (next === "CONFIRMED" && visit.status === "RESCHEDULED" && visit.proposedSlot) {
      patch.slotStart = visit.proposedSlot;
      patch.proposedSlot = null;
    }
    await tx.update(visits).set(patch).where(eq(visits.id, visit.id));

    const [seeker] = await tx.select().from(users).where(eq(users.id, visit.seekerId));
    const [owner] = await tx.select().from(users).where(eq(users.id, property.ownerId));
    const where = `${unit.label} at ${property.name}`;
    const slot = fmtSlot(patch.slotStart ?? visit.slotStart);
    const msg: Partial<Record<VisitStatus, [string, string]>> = {
      CONFIRMED: isOwner
        ? [seeker.phone, `FindEkifo: your visit to ${where} is confirmed for ${slot}. ${property.address}.`]
        : [owner.phone, `FindEkifo: ${seeker.phone} accepted the new visit time for ${where}: ${slot}.`],
      DECLINED: [seeker.phone, `FindEkifo: the landlord can't host your visit to ${where}. Try another time or space.`],
      RESCHEDULED: [seeker.phone, `FindEkifo: the landlord proposed ${fmtSlot(proposedSlot!)} for your visit to ${where}. Accept it in the app.`],
      CANCELLED: [owner.phone, `FindEkifo: ${seeker.phone} cancelled their visit to ${where} on ${slot}.`],
    };
    const m = msg[next];
    if (m) await enqueueSms(tx, m[0], m[1]);
    await audit(tx, actor.id, `visit.${next.toLowerCase()}`, "visit", visit.id);
  });
}
