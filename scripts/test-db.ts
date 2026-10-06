// Prepares the test database used by `npm test`. Tests INSERT data, so never point this at production.
//
//   TEST_DATABASE_URL set   → migrate that database as-is (e.g. a separate Supabase project or a
//                              local Postgres). Nothing is created.
//   not set, local Postgres → create "<db>_test" next to DATABASE_URL and migrate it.
import "dotenv/config";
import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { pgConfig } from "../db/connection";

const explicit = process.env.TEST_DATABASE_URL || undefined;
const base = process.env.DATABASE_URL!;
const url = explicit ?? base.replace(/\/(\w+)(\?|$)/, "/$1_test$2");

(async () => {
  if (!explicit) {
    const host = new URL(base).hostname;
    if (!["localhost", "127.0.0.1", "::1"].includes(host)) {
      console.error("✗ Set TEST_DATABASE_URL to a throwaway database (e.g. a second Supabase project). Refusing to run tests against", host);
      process.exit(1);
    }
    const adminUrl = new URL(url);
    adminUrl.pathname = "/postgres";
    const admin = new Client(pgConfig(adminUrl.toString()));
    await admin.connect();
    const dbName = new URL(url).pathname.slice(1);
    const { rowCount } = await admin.query("select 1 from pg_database where datname = $1", [dbName]);
    if (!rowCount) await admin.query(`create database "${dbName}"`);
    await admin.end();
  }

  const client = new Client(pgConfig(url));
  await client.connect();
  await migrate(drizzle(client), { migrationsFolder: "./db/migrations" });
  await client.end();
  console.log(`✓ test database ready (${new URL(url).hostname}${new URL(url).pathname})`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
