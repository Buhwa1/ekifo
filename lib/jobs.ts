import { sweepHolds } from "./booking";
import { drainOutbox } from "./notify";

/** Everything that must run periodically. Idempotent and safe to run concurrently. */
export async function runJobs() {
  const holds = await sweepHolds();
  const outbox = await drainOutbox();
  return { holds, outbox };
}
