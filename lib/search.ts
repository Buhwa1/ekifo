import { unstable_cache } from "next/cache";
import { and, eq, ilike, or, sql, desc, asc, inArray, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { properties } from "@/db/schema";

export const PAGE_SIZE = 18;

// Drizzle prints columns unqualified in single-table queries, which silently breaks correlated
// subqueries ("property_id" = "id" binds to the inner table). Always reference the outer row explicitly.
const OUTER_ID = sql.raw(`"properties"."id"`);
const OUTER_TYPE = sql.raw(`"properties"."type"`);

export const searchParamsSchema = z.object({
  q: z.string().trim().max(60).optional(),
  group: z.enum(["STAY", "BUSINESS", "LEISURE"]).optional(),
  type: z.string().regex(/^[a-z0-9_]{2,32}$/).optional(),
  suburb: z.string().trim().max(40).optional(),
  min: z.coerce.number().int().min(0).optional(),
  max: z.coerce.number().int().min(0).optional(),
  cycle: z.enum(["PER_DAY", "PER_MONTH", "PER_SEMESTER", "PER_HOUR", "PER_EVENT_SLOT"]).optional(),
  yaka: z.enum(["PRIVATE", "SHARED", "INCLUSIVE"]).optional(),
  water: z.enum(["NWSC", "GRAVITY_TANK", "BOTH"]).optional(),
  security: z.string().max(40).optional(),
  vacant: z.enum(["1"]).optional(),
  sort: z.enum(["featured", "price_asc", "price_desc", "newest", "rating"]).default("featured"),
  page: z.coerce.number().int().min(1).max(200).default(1),
});
export type SearchParams = z.infer<typeof searchParamsSchema>;

/** Filter keys that narrow results (everything except sort/page). Used for "active filter" chips. */
export const FILTER_KEYS = ["q", "group", "type", "suburb", "min", "max", "cycle", "yaka", "water", "security", "vacant"] as const;

export function parseSearch(raw: Record<string, string | string[] | undefined>): SearchParams {
  const flat = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]).filter(([, v]) => v !== "" && v != null));
  const parsed = searchParamsSchema.safeParse(flat);
  if (parsed.success) {
    // A swapped range (min > max) is almost always a typo — fix it rather than show nothing.
    const d = parsed.data;
    if (d.min != null && d.max != null && d.min > d.max) [d.min, d.max] = [d.max, d.min];
    return d;
  }
  // Keep whatever fields were valid instead of throwing the whole search away.
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(flat)) {
    const field = (searchParamsSchema.shape as Record<string, z.ZodTypeAny>)[k];
    if (field?.safeParse(v).success) safe[k] = v;
  }
  return searchParamsSchema.parse(safe);
}

export async function searchProperties(p: SearchParams) {
  const where: SQL[] = [eq(properties.status, "LIVE")];
  if (p.type) where.push(eq(properties.type, p.type));
  else if (p.group) where.push(sql`${properties.type} in (select slug from property_types where "group" = ${p.group})`);
  if (p.suburb) where.push(ilike(properties.suburb, p.suburb));
  if (p.yaka) where.push(eq(properties.yaka, p.yaka));
  if (p.water) where.push(inArray(properties.water, p.water === "BOTH" ? ["BOTH"] : [p.water, "BOTH"]));
  if (p.security) where.push(sql`${p.security} = any(${properties.security})`);
  if (p.vacant) where.push(sql`${properties.vacantCount} > 0`);
  if (p.q) {
    const like = `%${p.q.replace(/[%_\\]/g, "")}%`;
    where.push(or(ilike(properties.name, like), ilike(properties.suburb, like), ilike(properties.district, like), ilike(properties.address, like))!);
  }
  // Price and cycle filter on units, so "under 300k per month" means a unit actually matches.
  if (p.min != null || p.max != null || p.cycle) {
    const unitConds: SQL[] = [sql`u.property_id = ${OUTER_ID}`, sql`u.status <> 'UNLISTED'`];
    if (p.min != null) unitConds.push(sql`u.price_ugx >= ${p.min}`);
    if (p.max != null) unitConds.push(sql`u.price_ugx <= ${p.max}`);
    if (p.cycle) unitConds.push(sql`u.cycle = ${p.cycle}`);
    where.push(sql`exists (select 1 from units u where ${sql.join(unitConds, sql` and `)})`);
  }

  const featuredFirst = sql`case when ${properties.featuredUntil} > now() then 0 else 1 end`;
  const order = {
    featured: [featuredFirst, desc(sql`${properties.vacantCount} > 0`), desc(properties.publishedAt), asc(properties.id)],
    price_asc: [asc(sql`${properties.minPriceUgx} nulls last`), asc(properties.id)],
    price_desc: [desc(sql`${properties.minPriceUgx} nulls last`), asc(properties.id)],
    newest: [desc(properties.publishedAt), asc(properties.id)],
    rating: [desc(properties.ratingAvg), desc(properties.ratingCount), asc(properties.id)],
  }[p.sort];

  const rows = await db
    .select({
      id: properties.id,
      name: properties.name,
      type: properties.type,
      typeName: sql<string>`(select t.name from property_types t where t.slug = ${OUTER_TYPE})`,
      group: sql<"STAY" | "BUSINESS" | "LEISURE">`(select t."group" from property_types t where t.slug = ${OUTER_TYPE})`,
      parentName: sql<string | null>`(select pp.name from properties pp where pp.id = "properties"."parent_id")`,
      suburb: properties.suburb,
      district: properties.district,
      minPriceUgx: properties.minPriceUgx,
      vacantCount: properties.vacantCount,
      ratingAvg: properties.ratingAvg,
      ratingCount: properties.ratingCount,
      yaka: properties.yaka,
      water: properties.water,
      amenities: properties.amenities,
      featured: sql<boolean>`coalesce(${properties.featuredUntil} > now(), false)`,
      cover: sql<string | null>`(select m.url from media m where m.property_id = ${OUTER_ID} and m.kind = 'PHOTO' order by m.position limit 1)`,
      cycle: sql<string | null>`(select cycle from units u where u.property_id = ${OUTER_ID} and u.status <> 'UNLISTED' order by u.price_ugx asc limit 1)`,
      total: sql<number>`count(*) over()`.mapWith(Number),
    })
    .from(properties)
    .where(and(...where))
    .orderBy(...order)
    .limit(PAGE_SIZE)
    .offset((p.page - 1) * PAGE_SIZE);

  return { rows, total: rows[0]?.total ?? 0 };
}

export interface BoardRow {
  suburb: string;
  district: string;
  vacant: number;
  places: number;
  fromUgx: number | null;
  fromCycle: string | null;
  categories: string[];
}

/**
 * The homepage vacancy board: free units per area, cheapest unit, what kinds of space.
 * Cached for 60 s across all visitors — it's the busiest query on the site and a minute of
 * staleness is invisible to a seeker.
 */
export const vacancyBoard = unstable_cache(
  async (group?: string): Promise<BoardRow[]> => {
    const inGroup = (alias: string) => group ? sql`and ${sql.raw(alias)}.type in (select slug from property_types where "group" = ${group})` : sql``;
    const res = await db.execute(sql`
      select p.suburb,
             min(p.district) as district,
             coalesce(sum(p.vacant_count), 0)::int as vacant,
             count(*)::int as places,
             (select u.price_ugx from units u join properties p2 on p2.id = u.property_id
               where p2.suburb = p.suburb and p2.status = 'LIVE' and u.status = 'VACANT'
               ${inGroup("p2")}
               order by u.price_ugx limit 1) as from_ugx,
             (select u.cycle from units u join properties p2 on p2.id = u.property_id
               where p2.suburb = p.suburb and p2.status = 'LIVE' and u.status = 'VACANT'
               ${inGroup("p2")}
               order by u.price_ugx limit 1) as from_cycle,
             array_agg(distinct p.type) as categories
        from properties p
       where p.status = 'LIVE' ${inGroup("p")}
       group by p.suburb
       order by vacant desc, places desc, p.suburb
       limit 8`);
    return (res.rows as Array<Record<string, unknown>>).map((r) => ({
      suburb: String(r.suburb),
      district: String(r.district),
      vacant: Number(r.vacant),
      places: Number(r.places),
      fromUgx: r.from_ugx == null ? null : Number(r.from_ugx),
      fromCycle: (r.from_cycle as string) ?? null,
      categories: (r.categories as string[]) ?? [],
    }));
  },
  ["vacancy-board"],
  { revalidate: 60, tags: ["inventory"] },
);

export const popularSuburbs = unstable_cache(
  async (limit = 16): Promise<string[]> => {
    const rows = await db
      .select({ suburb: properties.suburb })
      .from(properties)
      .where(eq(properties.status, "LIVE"))
      .groupBy(properties.suburb)
      .orderBy(desc(sql`count(*)`), asc(properties.suburb))
      .limit(limit);
    return rows.map((r) => r.suburb);
  },
  ["popular-suburbs"],
  { revalidate: 300, tags: ["inventory"] },
);

export const totals = unstable_cache(
  async () => {
    const res = await db.execute(sql`select coalesce(sum(vacant_count),0)::int as vacant, count(*)::int as places, count(distinct suburb)::int as areas from properties where status = 'LIVE'`);
    const r = res.rows[0] as { vacant: number; places: number; areas: number };
    return { vacant: Number(r.vacant), places: Number(r.places), areas: Number(r.areas) };
  },
  ["inventory-totals"],
  { revalidate: 60, tags: ["inventory"] },
);

/** Spaces listed inside a venue (e.g. a hotel's pool and rooftop), shaped like search results. */
export async function childSpaces(parentId: string) {
  return db
    .select({
      id: properties.id, name: properties.name, type: properties.type,
      typeName: sql<string>`(select t.name from property_types t where t.slug = ${OUTER_TYPE})`,
      group: sql<"STAY" | "BUSINESS" | "LEISURE">`(select t."group" from property_types t where t.slug = ${OUTER_TYPE})`,
      parentName: sql<string | null>`null`,
      suburb: properties.suburb, district: properties.district, minPriceUgx: properties.minPriceUgx, vacantCount: properties.vacantCount,
      ratingAvg: properties.ratingAvg, ratingCount: properties.ratingCount, yaka: properties.yaka, water: properties.water, amenities: properties.amenities,
      featured: sql<boolean>`false`,
      cover: sql<string | null>`(select m.url from media m where m.property_id = ${OUTER_ID} and m.kind = 'PHOTO' order by m.position limit 1)`,
      cycle: sql<string | null>`(select cycle from units u where u.property_id = ${OUTER_ID} and u.status <> 'UNLISTED' order by u.price_ugx asc limit 1)`,
    })
    .from(properties)
    .where(and(eq(properties.parentId, parentId), eq(properties.status, "LIVE")))
    .orderBy(asc(properties.name));
}
