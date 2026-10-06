import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import { pgConfig } from "./connection";

export type DB = NodePgDatabase<typeof schema>;
/** A transaction handle, or the root db — services accept either so they compose inside callers' transactions. */
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0] | DB;

// Reuse one pool across hot reloads in dev and across invocations in a warm serverless instance.
// Keep it small: Supabase's pooler multiplexes for us, and each serverless instance gets its own pool.
const g = globalThis as unknown as { __ekifoPool?: Pool };
const pool =
  g.__ekifoPool ??
  new Pool(
    pgConfig(process.env.DATABASE_URL, {
      max: Number(process.env.DB_POOL_MAX ?? 5),
      idleTimeoutMillis: 20_000,
    }),
  );
if (process.env.NODE_ENV !== "production") g.__ekifoPool = pool;

// A dropped pooler connection shouldn't crash the process; the next query reconnects.
pool.on("error", (e) => console.error("[db] idle client error", e.message));

export const db: DB = drizzle(pool, { schema });
export { schema, pool };
