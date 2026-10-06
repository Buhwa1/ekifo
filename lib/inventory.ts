import { eq, sql } from "drizzle-orm";
import type { Tx } from "@/db";
import { properties } from "@/db/schema";

/**
 * Recompute the denormalised min price and vacancy count used by search.
 * Call inside the same transaction as any unit status/price change.
 */
export async function refreshPropertyStats(tx: Tx, propertyId: string) {
  await tx
    .update(properties)
    .set({
      minPriceUgx: sql`(select min(price_ugx) from units where property_id = ${propertyId} and status <> 'UNLISTED')`,
      vacantCount: sql`(select count(*)::int from units where property_id = ${propertyId} and status = 'VACANT')`,
    })
    .where(eq(properties.id, propertyId));
}

export async function refreshRating(tx: Tx, propertyId: string) {
  await tx
    .update(properties)
    .set({
      ratingAvg: sql`coalesce((select avg(stars)::float from reviews where property_id = ${propertyId}), 0)`,
      ratingCount: sql`(select count(*)::int from reviews where property_id = ${propertyId})`,
    })
    .where(eq(properties.id, propertyId));
}
