import { and, desc, eq } from "drizzle-orm";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { db } from "@/db";
import { tenancies, rentChanges, units, properties, users } from "@/db/schema";
import { config } from "./config";
import { DomainError } from "./errors";
import { checkRentIncrease, formatUGX, CYCLE_LABEL } from "./rules";
import { enqueueSms } from "./notify";
import { audit } from "./audit";
import { refreshPropertyStats } from "./inventory";

/** Current rent = last change already in effect, else the starting rent. */
export function currentRent(t: { rentUgx: number }, changes: { newRentUgx: number; effectiveAt: Date }[], at = new Date()) {
  const applied = changes.filter((c) => c.effectiveAt <= at).sort((a, b) => b.effectiveAt.getTime() - a.effectiveAt.getTime());
  return applied[0]?.newRentUgx ?? t.rentUgx;
}

export async function proposeRentChange(landlord: { id: string }, tenancyId: string, newRentUgx: number, effectiveAt: Date) {
  const cfg = config();
  await db.transaction(async (tx) => {
    const [t] = await tx.select().from(tenancies).where(eq(tenancies.id, tenancyId)).for("update");
    if (!t || t.landlordId !== landlord.id) throw new DomainError("Tenancy not found.");
    if (t.endedAt) throw new DomainError("This tenancy has ended.");
    const history = await tx.select().from(rentChanges).where(eq(rentChanges.tenancyId, t.id));
    if (history.some((h) => h.effectiveAt > new Date()))
      throw new DomainError("A rent change is already scheduled for this tenancy.");
    const now = new Date();
    const cur = currentRent(t, history, now);
    const check = checkRentIncrease({
      currentRentUgx: cur,
      proposedRentUgx: newRentUgx,
      effectiveAt,
      now,
      history,
      capBps: cfg.RENT_INCREASE_CAP_BPS,
      noticeDays: cfg.RENT_NOTICE_DAYS,
    });
    if (!check.ok) throw new DomainError(check.reason);
    await tx.insert(rentChanges).values({ tenancyId: t.id, oldRentUgx: cur, newRentUgx, effectiveAt });
    const [tenant] = await tx.select().from(users).where(eq(users.id, t.tenantId));
    await enqueueSms(tx, tenant.phone, `FindEkifo notice: your rent changes from ${formatUGX(cur)} to ${formatUGX(newRentUgx)} ${CYCLE_LABEL[t.cycle]} from ${effectiveAt.toDateString()}.`);
    await audit(tx, landlord.id, "tenancy.rent_change", "tenancy", t.id, { from: cur, to: newRentUgx, effectiveAt });
  });
}

export async function endTenancy(actor: { id: string; role: string }, tenancyId: string) {
  await db.transaction(async (tx) => {
    const [t] = await tx.select().from(tenancies).where(eq(tenancies.id, tenancyId)).for("update");
    if (!t || (t.landlordId !== actor.id && actor.role !== "ADMIN")) throw new DomainError("Tenancy not found.");
    if (t.endedAt) return;
    await tx.update(tenancies).set({ endedAt: new Date() }).where(eq(tenancies.id, t.id));
    const [u] = await tx.update(units).set({ status: "VACANT" }).where(and(eq(units.id, t.unitId), eq(units.status, "OCCUPIED"))).returning();
    if (u) await refreshPropertyStats(tx, u.propertyId);
    await audit(tx, actor.id, "tenancy.end", "tenancy", t.id);
  });
}

/** Load a tenancy if the viewer is a party to it (or admin). */
export async function loadTenancyFor(viewer: { id: string; role: string }, tenancyId: string) {
  const [row] = await db
    .select({ t: tenancies, unit: units, property: properties })
    .from(tenancies)
    .innerJoin(units, eq(units.id, tenancies.unitId))
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .where(eq(tenancies.id, tenancyId));
  if (!row) return null;
  if (viewer.role !== "ADMIN" && row.t.tenantId !== viewer.id && row.t.landlordId !== viewer.id) return null;
  const [tenant] = await db.select().from(users).where(eq(users.id, row.t.tenantId));
  const [landlord] = await db.select().from(users).where(eq(users.id, row.t.landlordId));
  const changes = await db.select().from(rentChanges).where(eq(rentChanges.tenancyId, tenancyId)).orderBy(desc(rentChanges.effectiveAt));
  return { ...row, tenant, landlord, changes };
}

// ─── Agreement PDF ───────────────────────────────────────────────────────────
export async function renderAgreementPdf(data: NonNullable<Awaited<ReturnType<typeof loadTenancyFor>>>): Promise<Uint8Array> {
  const cfg = config();
  const { t, unit, property, tenant, landlord, changes } = data;
  const doc = await PDFDocument.create();
  doc.setTitle(`Tenancy agreement — ${property.name} ${unit.label}`);
  doc.setAuthor("FindEkifo");
  const page = doc.addPage([595, 842]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const navy = rgb(0.06, 0.09, 0.16);
  const grey = rgb(0.39, 0.45, 0.55);
  let y = 790;
  const M = 56;

  const line = (text: string, opts: { size?: number; f?: typeof font; color?: ReturnType<typeof rgb>; gap?: number } = {}) => {
    const size = opts.size ?? 10.5;
    const f = opts.f ?? font;
    // naive word wrap
    const words = text.split(" ");
    let cur = "";
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (f.widthOfTextAtSize(next, size) > 595 - M * 2) {
        page.drawText(cur, { x: M, y, size, font: f, color: opts.color ?? navy });
        y -= size + 4;
        cur = w;
      } else cur = next;
    }
    if (cur) page.drawText(cur, { x: M, y, size, font: f, color: opts.color ?? navy });
    y -= size + (opts.gap ?? 6);
  };
  const row = (k: string, v: string) => {
    page.drawText(k, { x: M, y, size: 10, font, color: grey });
    page.drawText(v, { x: M + 150, y, size: 10.5, font: bold, color: navy });
    y -= 18;
  };

  page.drawRectangle({ x: 0, y: 812, width: 595, height: 30, color: rgb(0.02, 0.59, 0.41) });
  page.drawText("FindEkifo", { x: M, y: 822, size: 12, font: bold, color: rgb(1, 1, 1) });
  line("TENANCY AGREEMENT", { size: 18, f: bold, gap: 4 });
  line(`Reference ${t.id.slice(0, 8).toUpperCase()}  ·  generated ${new Date().toDateString()}`, { size: 9, color: grey, gap: 18 });

  line("1. Parties", { f: bold, size: 12 });
  row("Landlord", `${landlord.name ?? "—"} (${landlord.phone})`);
  row("Tenant", `${tenant.name ?? "—"} (${tenant.phone})`);
  y -= 6;
  line("2. Premises", { f: bold, size: 12 });
  row("Property", property.name);
  row("Unit", unit.label);
  row("Address", `${property.address}, ${property.suburb}, ${property.district}`);
  y -= 6;
  line("3. Rent and deposit", { f: bold, size: 12 });
  const cur = currentRent(t, changes);
  row("Rent", `${formatUGX(cur)} ${CYCLE_LABEL[t.cycle]}`);
  row("Commitment deposit", `${formatUGX(t.depositUgx)} (paid via FindEkifo escrow)`);
  row("Start date", t.startDate.toDateString());
  row("Currency", "Uganda Shillings (UGX)");
  y -= 6;
  line("4. Utilities", { f: bold, size: 12 });
  row("Electricity (Yaka)", { PRIVATE: "Private meter, paid by tenant", SHARED: "Shared meter, split as agreed", INCLUSIVE: "Included in rent", NONE: "Not supplied" }[property.yaka]);
  row("Water", { NWSC: "NWSC connection", GRAVITY_TANK: "Gravity tank", BOTH: "NWSC + tank", NONE: "Not supplied" }[property.water]);
  y -= 6;
  line("5. Terms", { f: bold, size: 12 });
  for (const term of [
    `Rent on this tenancy may not be increased by more than ${cfg.RENT_INCREASE_CAP_BPS / 100}% in any 12-month period, and any increase requires at least ${cfg.RENT_NOTICE_DAYS} days' written notice to the tenant.`,
    "The deposit was received by FindEkifo and released to the landlord, less the platform commission, when the tenant confirmed move-in.",
    "Either party may raise a dispute through FindEkifo. Nothing in this summary limits either party's rights under the laws of Uganda.",
    "The landlord confirms they own or are authorised to let the premises, as verified by FindEkifo at listing.",
  ]) line(`• ${term}`, { size: 10 });

  y -= 30;
  page.drawLine({ start: { x: M, y }, end: { x: M + 190, y }, thickness: 0.8, color: grey });
  page.drawLine({ start: { x: 595 - M - 190, y }, end: { x: 595 - M, y }, thickness: 0.8, color: grey });
  y -= 14;
  page.drawText("Landlord", { x: M, y, size: 9, font, color: grey });
  page.drawText("Tenant", { x: 595 - M - 190, y, size: 9, font, color: grey });
  page.drawText("Digitally confirmed by both parties on FindEkifo. Verify at findekifo.ug with the reference above.", { x: M, y: 40, size: 8, font, color: grey });
  return doc.save();
}
