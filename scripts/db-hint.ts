// Turns the common "can't reach Postgres" failures into a message that says what to do.
export function explainDbError(e: unknown): string | null {
  const err = e as { code?: string; cause?: { code?: string; message?: string; errors?: { code?: string }[] } };
  const code = err?.cause?.code ?? err?.cause?.errors?.[0]?.code ?? err?.code;
  const url = safeUrl(process.env.DATABASE_URL);
  switch (code) {
    case "ECONNREFUSED":
      return [
        `✗ Can't connect to Postgres at ${url}. Nothing is listening there.`,
        "  Start a database, then run this again:",
        "    • Docker:   docker compose up -d",
        "    • Homebrew: brew install postgresql@16 && brew services start postgresql@16",
        "                createuser -s ekifo && psql postgres -c \"alter user ekifo password 'ekifo'\" && createdb -O ekifo findekifo",
        "    • Postgres.app: start it, then create user ekifo / database findekifo, or edit DATABASE_URL in .env",
      ].join("\n");
    case "28P01":
    case "28000":
      return `✗ Postgres rejected the username/password in DATABASE_URL (${url}). Create that role or fix .env.`;
    case "3D000":
      return `✗ The database in DATABASE_URL doesn't exist yet (${url}). Run: createdb -O ekifo findekifo`;
    case "ENOTFOUND":
      return `✗ The host in DATABASE_URL can't be resolved (${url}).`;
    default:
      return null;
  }
}

function safeUrl(raw?: string) {
  if (!raw) return "(DATABASE_URL is not set — copy .env.example to .env)";
  try {
    const u = new URL(raw);
    u.password = u.password ? "****" : "";
    return u.toString();
  } catch {
    return raw;
  }
}
