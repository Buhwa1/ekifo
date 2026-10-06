import { and, eq, ilike, or, sql, desc, asc, inArray, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { properties } from "@/db/schema";

export const PAGE_SIZE = 18;

// Drizzle prints columns unqualified in single-table queries, which silently breaks correlated
// subqueries ("property_id" = "id" binds to the inner table). Always reference the outer row explicitly.
const OUTER_ID = sql.raw(`"properties"."id"`);

export const searchParamsSchema = z.object({
  q: z.string().trim().max(60).optional(),
  category: z.enum(["HOSTEL", "ARCADE", "RESIDENTIAL", "FLEXI_STAY"]).optional(),
  suburb: z.string().trim().max(40).optional(),
  min: z.coerce.number().int().min(0).optional(),
  max: z.coerce.number().int().min(0).optional(),
  cycle: z.enum(["PER_DAY", "PER_MONTH", "PER_SEMESTER"]).optional(),
  yaka: z.enum(["PRIVATE", "SHARED", "INCLUSIVE"]).optional(),
  water: z.enum(["NWSC", "GRAVITY_TANK", "BOTH"]).optional(),
  security: z.string().max(40).optional(),
  vacant: z.enum(["1"]).optional(),
  sort: z.enum(["featured", "price_asc", "price_desc", "newest", "rating"]).default("featured"),
  page: z.coerce.number().int().min(1).max(200).default(1),
});
export type SearchParams = z.infer<typeof searchParamsSchema>;

export function parseSearch(raw: Record<string, string | string[] | undefined>): SearchParams {
  const flat = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]).filter(([, v]) => v !== "" && v != null));
  const parsed = searchParamsSchema.safeParse(flat);
  return parsed.success ? parsed.data : searchParamsSchema.parse({});
}

export async function searchProperties(p: SearchParams) {
  const where: SQL[] = [eq(properties.status, "LIVE")];
  if (p.category) where.push(eq(properties.category, p.category));
  if (p.suburb) where.push(ilike(properties.suburb, p.suburb));
  if (p.yaka) where.push(eq(properties.yaka, p.yaka));
  if (p.water) where.push(inArray(properties.water, p.water === "BOTH" ? ["BOTH"] : [p.water, "BOTH"]));
  if (p.security) where.push(sql`${p.security} = any(${properties.security})`);
  if (p.vacant) where.push(sql`${properties.vacantCount} > 0`);
  if (p.q) {
    const like = `%${p.q.replace(/[%_]/g, "")}%`;
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
    featured: [featuredFirst, desc(sql`${properties.vacantCount} > 0`), desc(properties.publishedAt)],
    price_asc: [asc(properties.minPriceUgx)],
    price_desc: [desc(properties.minPriceUgx)],
    newest: [desc(properties.publishedAt)],
    rating: [desc(properties.ratingAvg), desc(properties.ratingCount)],
  }[p.sort];


  const rows = await db
    .select({
      id: properties.id,
      name: properties.name,
      category: properties.category,
      suburb: properties.suburb,
      district: properties.district,
      minPriceUgx: properties.minPriceUgx,
      vacantCount: properties.vacantCount,
      ratingAvg: properties.ratingAvg,
      ratingCount: properties.ratingCount,
      yaka: properties.yaka,
      water: properties.water,
      featured: sql<boolean>`${properties.featuredUntil} > now()`,
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

export async function popularSuburbs(limit = 12): Promise<string[]> {
  const rows = await db
    .select({ suburb: properties.suburb, n: sql<number>`count(*)` })
    .from(properties)
    .where(eq(properties.status, "LIVE"))
    .groupBy(properties.suburb)
    .orderBy(desc(sql`count(*)`))
    .limit(limit);
  return rows.map((r) => r.suburb);
}
