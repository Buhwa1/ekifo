import { unstable_cache, revalidateTag } from "next/cache";
import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { propertyTypes } from "@/db/schema";
import { DomainError } from "./errors";
import { audit } from "./audit";
import { ALL_CYCLES, type Cycle, type Group } from "./rules";

export type PropertyType = Omit<typeof propertyTypes.$inferSelect, "cycles"> & { cycles: Cycle[] };

/** All types (active and inactive), cached across requests; invalidated when an admin edits one. */
export const allTypes = unstable_cache(
  async (): Promise<PropertyType[]> =>
    (await db.select().from(propertyTypes).orderBy(asc(propertyTypes.sort), asc(propertyTypes.name))) as unknown as PropertyType[],
  ["property-types"],
  { revalidate: 3600, tags: ["types"] },
);

export async function activeTypes() {
  return (await allTypes()).filter((t) => t.active);
}

export async function typeMap() {
  return new Map((await allTypes()).map((t) => [t.slug, t]));
}

export async function typesByGroup() {
  const out: Record<Group, PropertyType[]> = { STAY: [], BUSINESS: [], LEISURE: [] };
  for (const t of await activeTypes()) out[t.group].push(t);
  return out;
}

/** Icons the admin can pick from (rendered by components/type-icon.tsx). */
export const TYPE_ICONS = ["bed", "home", "key", "hotel", "store", "building", "goal", "waves", "sunset", "trees", "utensils", "beer", "music", "dumbbell", "briefcase", "tent"] as const;

export const typeInput = z.object({
  name: z.string().trim().min(2).max(40),
  plural: z.string().trim().min(2).max(48),
  group: z.enum(["STAY", "BUSINESS", "LEISURE"]),
  bookingMode: z.enum(["LEASE", "SLOT"]),
  cycles: z.array(z.enum(ALL_CYCLES as [Cycle, ...Cycle[]])).min(1, "Pick at least one way to charge"),
  canHaveChildren: z.coerce.boolean().default(false),
  canBeChild: z.coerce.boolean().default(false),
  unitNoun: z.string().trim().min(2).max(20),
  icon: z.enum(TYPE_ICONS),
  description: z.string().trim().max(200).default(""),
  sort: z.coerce.number().int().min(0).max(999).default(100),
}).superRefine((t, ctx) => {
  const slot = t.cycles.some((c) => c === "PER_HOUR" || c === "PER_EVENT_SLOT");
  const lease = t.cycles.some((c) => c !== "PER_HOUR" && c !== "PER_EVENT_SLOT");
  if (t.bookingMode === "SLOT" && lease) ctx.addIssue({ code: "custom", path: ["cycles"], message: "Time-slot types can only charge per hour or per event slot." });
  if (t.bookingMode === "LEASE" && slot) ctx.addIssue({ code: "custom", path: ["cycles"], message: "Long-stay types can't charge per hour or per event slot." });
});

const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 32);

export async function createType(admin: { id: string }, input: z.infer<typeof typeInput>) {
  const slug = slugify(input.name);
  if (!slug) throw new DomainError("Give the type a name with letters in it.");
  const [exists] = await db.select({ slug: propertyTypes.slug }).from(propertyTypes).where(eq(propertyTypes.slug, slug));
  if (exists) throw new DomainError(`A type called “${input.name}” already exists.`);
  await db.insert(propertyTypes).values({ ...input, slug });
  await audit(db, admin.id, "type.create", "property_type", slug, input);
  revalidateTag("types");
  return slug;
}

export async function updateType(admin: { id: string }, slug: string, input: z.infer<typeof typeInput>) {
  const [row] = await db.select().from(propertyTypes).where(eq(propertyTypes.slug, slug));
  if (!row) throw new DomainError("Type not found.");
  if (row.bookingMode !== input.bookingMode) {
    // Changing LEASE↔SLOT would strand existing units priced the other way.
    const [{ n }] = (await db.execute(sql`select count(*)::int as n from properties where type = ${slug}`)).rows as Array<{ n: number }>;
    if (n > 0) throw new DomainError("This type already has listings, so its booking style can't change. Create a new type instead.");
  }
  await db.update(propertyTypes).set(input).where(eq(propertyTypes.slug, slug));
  await audit(db, admin.id, "type.update", "property_type", slug, input);
  revalidateTag("types");
}

export async function setTypeActive(admin: { id: string }, slug: string, active: boolean) {
  await db.update(propertyTypes).set({ active }).where(eq(propertyTypes.slug, slug));
  await audit(db, admin.id, active ? "type.enable" : "type.disable", "property_type", slug);
  revalidateTag("types");
}
