import { runJobs } from "./lib/jobs";

const enabled = process.env.NODE_ENV === "development" || process.env.JOBS_IN_PROCESS === "1";
const g = globalThis as unknown as { __ekifoJobs?: NodeJS.Timeout };

const isConnError = (e: unknown) => {
  const c = (e as { cause?: { code?: string; errors?: { code?: string }[] } })?.cause;
  return ["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "57P03"].includes(c?.code ?? c?.errors?.[0]?.code ?? "");
};

if (enabled && !g.__ekifoJobs) {
  let running = false;
  let dbDown = false;
  g.__ekifoJobs = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await runJobs();
      if (dbDown) console.log("[jobs] database reachable again");
      dbDown = false;
    } catch (e) {
      // Log a missing database once, not every 5 seconds.
      if (isConnError(e)) {
        if (!dbDown) console.error("[jobs] can't reach Postgres (DATABASE_URL). Start it with `docker compose up -d` — see README.");
        dbDown = true;
      } else console.error("[jobs]", e);
    } finally {
      running = false;
    }
  }, 5_000);
}
