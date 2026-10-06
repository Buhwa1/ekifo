import type { PoolConfig } from "pg";

/**
 * Turns a DATABASE_URL into a pg config that works for both local Postgres and Supabase.
 *
 * Supabase needs TLS. node-postgres lets `sslmode` in the URL override any `ssl` object we
 * pass, and its sslmode=require now means "verify the cert", which fails against Supabase's
 * chain unless you supply their CA. So we strip sslmode from the URL and set TLS ourselves:
 *   - DATABASE_CA_CERT set (Supabase dashboard → Database → SSL → download) → fully verified TLS
 *   - otherwise → encrypted, without certificate verification
 */
export function pgConfig(url: string | undefined, extra: PoolConfig = {}): PoolConfig {
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env and add your Supabase connection string.");
  const u = new URL(url);
  const sslmode = u.searchParams.get("sslmode");
  u.searchParams.delete("sslmode");
  u.searchParams.delete("pgbouncer"); // Prisma-style flag some guides add; pg doesn't understand it

  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(u.hostname);
  const wantSsl = sslmode ? sslmode !== "disable" : !isLocal;
  const ca = process.env.DATABASE_CA_CERT?.replace(/\\n/g, "\n");

  return {
    connectionString: u.toString(),
    ssl: wantSsl ? (ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false }) : undefined,
    connectionTimeoutMillis: 10_000,
    ...extra,
  };
}

/** True when the URL points at Supabase's transaction pooler (port 6543). */
export const isTransactionPooler = (url?: string) => Boolean(url && new URL(url).port === "6543");
