// Worker process for VPS deployments: `npm run jobs:run` alongside `npm start`.
import "dotenv/config";
import { runJobs } from "../lib/jobs";

const INTERVAL_MS = 15_000;
let stopping = false;
process.on("SIGTERM", () => (stopping = true));
process.on("SIGINT", () => (stopping = true));

(async () => {
  console.log("FindEkifo worker started");
  while (!stopping) {
    try {
      const r = await runJobs();
      if (r.outbox.sent || r.outbox.failed || r.holds.overdue || r.holds.lapsed || r.holds.released) console.log(new Date().toISOString(), JSON.stringify(r));
    } catch (e) {
      console.error(e);
    }
    await new Promise((res) => setTimeout(res, INTERVAL_MS));
  }
  process.exit(0);
})();
