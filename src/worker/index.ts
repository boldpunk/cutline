// Background worker: delivers the notification outbox and runs housekeeping.
// Run: npm run worker  (docker compose starts it as the "worker" service).
import { closeDb } from "@/lib/db/client";
import { env } from "@/lib/server/env";
import { housekeeping, processOutboxOnce, smtpProvider } from "@/lib/server/notifications";

const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 5000);
const HOUSEKEEPING_MS = 10 * 60_000;

let stopping = false;
process.on("SIGTERM", () => (stopping = true));
process.on("SIGINT", () => (stopping = true));

async function main() {
  const provider = smtpProvider();
  console.log(`[worker] started; e-mail ${provider ? `via ${env.smtp!.host}` : "NOT configured (outbox rows stay queued)"}`);
  let lastHousekeeping = 0;
  while (!stopping) {
    try {
      const n = await processOutboxOnce(provider);
      if (n) console.log(`[worker] processed ${n} notification(s)`);
      if (Date.now() - lastHousekeeping > HOUSEKEEPING_MS) {
        const r = await housekeeping();
        if (r.contactsDeleted) console.log(`[worker] retention: removed contacts of ${r.contactsDeleted} booking(s)`);
        lastHousekeeping = Date.now();
      }
    } catch (err) {
      console.error("[worker] cycle failed:", err instanceof Error ? err.message : err);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  await closeDb();
  console.log("[worker] stopped");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
