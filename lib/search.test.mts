// Guards the price/cycle filters, which rely on a correlated subquery.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import "dotenv/config";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL!.replace(/\/(\w+)(\?|$)/, "/$1_test$2");
const { db, pool } = await import("@/db");
const S = await import("@/db/schema");
const { searchProperties, parseSearch } = await import("./search");
const { refreshPropertyStats } = await import("./inventory");
after(() => pool.end());

test("price and cycle filters match on units of the same property", async () => {
  const tag = `zz${Date.now()}`;
  const [o] = await db.insert(S.users).values({ phone: `+25670${String(Date.now()).slice(-7)}` }).returning();
  const [p] = await db.insert(S.properties).values({ ownerId: o.id, name: `${tag} Place`, type: "flexi_stay", district: "K", suburb: tag, address: "x", status: "LIVE" }).returning();
  await db.insert(S.units).values([
    { propertyId: p.id, label: "A", priceUgx: 40_000, cycle: "PER_DAY", depositUgx: 40_000 },
    { propertyId: p.id, label: "B", priceUgx: 900_000, cycle: "PER_MONTH", depositUgx: 100_000 },
  ]);
  await refreshPropertyStats(db, p.id);
  const ids = async (q: Record<string, string>) => (await searchProperties(parseSearch({ suburb: tag, ...q }))).rows.map((r) => r.id);
  assert.deepEqual(await ids({ max: "50000" }), [p.id]);
  assert.deepEqual(await ids({ max: "50000", cycle: "PER_MONTH" }), []);
  assert.deepEqual(await ids({ min: "500000", cycle: "PER_MONTH" }), [p.id]);
  assert.deepEqual(await ids({ min: "1000000" }), []);
});
