import { randomBytes } from "node:crypto";
import { and, count, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { businesses, properties, tenancies, users, units } from "@/db/schema";
import { DomainError } from "./errors";
import { enqueueSms } from "./notify";
import { audit } from "./audit";
import { normalizeUgPhone } from "./rules";

export const BUSINESS_CATEGORIES = [
  "Fashion & clothing", "Shoes & bags", "Beauty & salon", "Phones & electronics", "Food & drinks",
  "Supermarket & groceries", "Pharmacy & health", "Home & furniture", "Books & stationery",
  "Banking & money", "Services & repairs", "Other",
] as const;

// ─── Social links: accept whatever people paste, store one clean form ───────
const handle = (raw: string, host: RegExp) => {
  const v = raw.trim();
  if (!v) return null;
  const fromUrl = v.match(new RegExp(`^(?:https?://)?(?:www\\.|m\\.)?${host.source}/(?:@)?([A-Za-z0-9._-]+)`, "i"));
  const h = (fromUrl ? fromUrl[1] : v.replace(/^@/, "")).replace(/\/+$/, "");
  return /^[A-Za-z0-9._-]{1,60}$/.test(h) ? h : null;
};
export const normalizeInstagram = (v: string) => handle(v, /instagram\.com/);
export const normalizeTiktok = (v: string) => handle(v, /tiktok\.com/);
export const normalizeFacebook = (v: string) => handle(v, /(?:facebook|fb)\.com/);
export function normalizeWebsite(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    return u.hostname.includes(".") ? u.toString() : null;
  } catch {
    return null;
  }
}
export const socialUrl = {
  instagram: (h: string) => `https://instagram.com/${h}`,
  tiktok: (h: string) => `https://www.tiktok.com/@${h}`,
  facebook: (h: string) => `https://facebook.com/${h}`,
  whatsapp: (p: string) => `https://wa.me/${p.replace("+", "")}`,
};

const optionalText = z.string().trim().max(200).optional().default("");

export const businessInput = z.object({
  propertyId: z.string().uuid("Pick the mall or arcade"),
  unitLabel: z.string().trim().min(1, "Which room or shop number?").max(30),
  name: z.string().trim().min(2, "Business name is too short").max(60),
  category: z.enum(BUSINESS_CATEGORIES),
  description: z.string().trim().max(400).optional().default(""),
  phone: optionalText,
  whatsapp: optionalText,
  instagram: optionalText,
  facebook: optionalText,
  tiktok: optionalText,
  website: optionalText,
  hours: z.string().trim().max(60).optional().default(""),
  photos: z.array(z.string().url()).min(1, "Add at least one photo of your shop front").max(2, "Two photos at most"),
});
export type BusinessInput = z.infer<typeof businessInput>;

function clean(input: BusinessInput) {
  const phone = input.phone ? normalizeUgPhone(input.phone) : null;
  if (input.phone && !phone) throw new DomainError("Enter a valid Ugandan phone number.");
  const whatsapp = input.whatsapp ? normalizeUgPhone(input.whatsapp) : null;
  if (input.whatsapp && !whatsapp) throw new DomainError("Enter a valid WhatsApp number.");
  const instagram = input.instagram ? normalizeInstagram(input.instagram) : null;
  if (input.instagram && !instagram) throw new DomainError("That Instagram handle doesn't look right. Try @yourshop.");
  const tiktok = input.tiktok ? normalizeTiktok(input.tiktok) : null;
  if (input.tiktok && !tiktok) throw new DomainError("That TikTok handle doesn't look right.");
  const facebook = input.facebook ? normalizeFacebook(input.facebook) : null;
  if (input.facebook && !facebook) throw new DomainError("Paste your Facebook page link or name.");
  const website = input.website ? normalizeWebsite(input.website) : null;
  if (input.website && !website) throw new DomainError("That website address doesn't look right.");
  if (!phone && !whatsapp && !instagram && !tiktok && !facebook && !website)
    throw new DomainError("Add at least one way for customers to reach you.");
  return {
    unitLabel: input.unitLabel, name: input.name, category: input.category, description: input.description,
    phone, whatsapp, instagram, tiktok, facebook, website, hours: input.hours || null, photos: input.photos,
  };
}

const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);

/**
 * A tenant adds their shop to the directory. It's published straight away when we can vouch for
 * them (they rent there through FindEkifo, own the building, or are admin); otherwise the mall's
 * landlord approves it.
 */
export async function createBusiness(actor: { id: string; role: string }, input: BusinessInput) {
  const data = clean(input);
  return db.transaction(async (tx) => {
    const [mall] = await tx
      .select({ p: properties, ownerPhone: users.phone, parentType: properties.type })
      .from(properties).innerJoin(users, eq(users.id, properties.ownerId))
      .where(eq(properties.id, input.propertyId));
    if (!mall || mall.p.status !== "LIVE") throw new DomainError("That building isn't on FindEkifo yet.");

    const [{ n }] = await tx.select({ n: count() }).from(businesses).where(eq(businesses.ownerId, actor.id));
    if (n >= 5 && actor.role !== "ADMIN") throw new DomainError("You can list up to 5 businesses. Contact us if you need more.");

    const [unit] = await tx.select({ id: units.id }).from(units)
      .where(and(eq(units.propertyId, mall.p.id), sql`lower(${units.label}) = lower(${data.unitLabel})`)).limit(1);
    const tenantHere = (await tx.select({ id: tenancies.id }).from(tenancies).innerJoin(units, eq(units.id, tenancies.unitId))
      .where(and(eq(tenancies.tenantId, actor.id), eq(units.propertyId, mall.p.id), isNull(tenancies.endedAt))).limit(1)).length > 0;
    const trusted = actor.role === "ADMIN" || mall.p.ownerId === actor.id || tenantHere;

    const slug = `${slugify(data.name) || "shop"}-${randomBytes(3).toString("hex")}`;
    const [b] = await tx.insert(businesses).values({
      ...data, slug, propertyId: mall.p.id, unitId: unit?.id ?? null, ownerId: actor.id,
      status: trusted ? "PUBLISHED" : "PENDING",
    }).returning({ id: businesses.id, slug: businesses.slug, status: businesses.status });
    if (!trusted)
      await enqueueSms(tx, mall.ownerPhone, `FindEkifo: ${data.name} (${data.unitLabel}) wants to appear in the ${mall.p.name} directory. Approve it in your dashboard under Directory.`);
    await audit(tx, actor.id, "business.create", "business", b.id, { propertyId: mall.p.id, status: b.status });
    return b;
  });
}

export async function updateBusiness(actor: { id: string; role: string }, id: string, input: BusinessInput) {
  const data = clean(input);
  const [b] = await db.select().from(businesses).where(eq(businesses.id, id));
  if (!b || (b.ownerId !== actor.id && actor.role !== "ADMIN")) throw new DomainError("Business not found.");
  if (input.propertyId !== b.propertyId) throw new DomainError("To move to another building, add the business again there.");
  await db.update(businesses).set(data).where(eq(businesses.id, id));
  await audit(db, actor.id, "business.update", "business", id);
  return b.slug;
}

/** Mall landlord or admin approves / hides a directory entry. */
export async function setBusinessStatus(actor: { id: string; role: string }, id: string, status: "PUBLISHED" | "HIDDEN") {
  await db.transaction(async (tx) => {
    const [row] = await tx.select({ b: businesses, ownerId: properties.ownerId, ownerPhone: users.phone })
      .from(businesses).innerJoin(properties, eq(properties.id, businesses.propertyId)).innerJoin(users, eq(users.id, businesses.ownerId))
      .where(eq(businesses.id, id)).for("update", { of: businesses });
    if (!row || (row.ownerId !== actor.id && actor.role !== "ADMIN")) throw new DomainError("Business not found.");
    if (row.b.status === status) return;
    await tx.update(businesses).set({ status }).where(eq(businesses.id, id));
    if (status === "PUBLISHED" && row.b.status === "PENDING")
      await enqueueSms(tx, row.ownerPhone, `FindEkifo: ${row.b.name} is now live in the business directory.`);
    await audit(tx, actor.id, `business.${status.toLowerCase()}`, "business", id);
  });
}

// ─── Reads ───────────────────────────────────────────────────────────────────
export async function directory(opts: { q?: string; category?: string; propertyId?: string; limit?: number }) {
  const where: SQL[] = [eq(businesses.status, "PUBLISHED"), eq(properties.status, "LIVE")];
  if (opts.category) where.push(eq(businesses.category, opts.category));
  if (opts.propertyId) where.push(eq(businesses.propertyId, opts.propertyId));
  if (opts.q) {
    const like = `%${opts.q.replace(/[%_\\]/g, "")}%`;
    where.push(or(ilike(businesses.name, like), ilike(businesses.category, like), ilike(businesses.description, like), ilike(properties.name, like), ilike(businesses.unitLabel, like))!);
  }
  return db
    .select({ b: businesses, mallName: properties.name, mallId: properties.id, suburb: properties.suburb })
    .from(businesses).innerJoin(properties, eq(properties.id, businesses.propertyId))
    .where(and(...where))
    .orderBy(properties.name, businesses.unitLabel)
    .limit(opts.limit ?? 120);
}

/** Malls/arcades that have at least one published business — for the directory filter. */
export async function directoryMalls() {
  return db
    .select({ id: properties.id, name: properties.name, suburb: properties.suburb, n: sql<number>`count(*)::int` })
    .from(businesses).innerJoin(properties, eq(properties.id, businesses.propertyId))
    .where(and(eq(businesses.status, "PUBLISHED"), eq(properties.status, "LIVE")))
    .groupBy(properties.id, properties.name, properties.suburb)
    .orderBy(desc(sql`count(*)`));
}

/** Buildings a tenant can add a business to (malls/arcades and any type that can hold shops). */
export async function hostBuildings() {
  return db.select({ id: properties.id, name: properties.name, suburb: properties.suburb })
    .from(properties)
    .where(and(eq(properties.status, "LIVE"), inArray(properties.type, sql`(select slug from property_types where "group" = 'BUSINESS' or can_have_children)`)))
    .orderBy(properties.name);
}
