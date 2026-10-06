// Applies db/migrations. Uses MIGRATION_DATABASE_URL when set (Supabase session pooler, port 5432),
// because DDL and the migrator's own locking are safest on a session connection, not the
// transaction pooler (port 6543) the app uses.
import "dotenv/config";
import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { pgConfig } from "../db/connection";

const url = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;

(async () => {
  const client = new Client(pgConfig(url));
  await client.connect();
  try {
    await migrate(drizzle(client), { migrationsFolder: "./db/migrations" });
    console.log(`✓ migrations applied to ${new URL(url!).hostname}`);
  } finally {
    await client.end();
  }
})().catch((e) => {
  const code = e?.cause?.code ?? e?.code;
  if (code === "ECONNREFUSED") console.error("✗ Can't reach the database. Check DATABASE_URL / MIGRATION_DATABASE_URL in .env.");
  else if (code === "ENOTFOUND") console.error("✗ Database host not found. On Supabase, use the pooler host (…pooler.supabase.com), not db.<ref>.supabase.co, unless you have the IPv4 add-on.");
  else if (code === "28P01") console.error("✗ Wrong database password. Reset it in Supabase → Project Settings → Database.");
  console.error(e);
  process.exit(1);
});
