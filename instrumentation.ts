// Runs background jobs in-process during development (and on a single-server deploy if you set
// JOBS_IN_PROCESS=1). On serverless hosts, hit /api/cron every minute instead.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
