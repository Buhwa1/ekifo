/** An error whose message is safe and useful to show the user. Anything else is logged and genericised. */
export class DomainError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
  }
}

/** Postgres unique violation, looking through Drizzle's error wrapper. */
export function isUniqueViolation(e: unknown, constraint?: string): boolean {
  const err = e as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } };
  const pg = err?.cause?.code ? err.cause : err;
  return pg?.code === "23505" && (!constraint || pg.constraint === constraint);
}

export type ActionResult<T = unknown> = { ok: true; data?: T; message?: string } | { ok: false; error: string };

/** Wrap a server action body: DomainErrors become friendly results, everything else is logged. */
export async function run<T>(fn: () => Promise<T>, okMessage?: string): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data, message: okMessage };
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e.message };
    if ((e as Error)?.constructor?.name === "AuthError") return { ok: false, error: (e as Error).message };
    // Next.js uses thrown errors for redirect()/notFound(); let them through.
    if ((e as { digest?: string })?.digest?.startsWith?.("NEXT_")) throw e;
    console.error(e);
    return { ok: false, error: "Something went wrong on our side. Please try again." };
  }
}
