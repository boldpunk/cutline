import { sql } from "drizzle-orm";
import type { Executor } from "@/lib/db/client";

// Namespace for pg_advisory_xact_lock(int, int). Every write that changes a
// barber's occupied time (bookings, time blocks, schedule edits) takes this
// lock first, so "check availability → write" is atomic per barber.
const BARBER_LOCK_NS = 4201;

/** Locks barbers for the rest of the transaction, in a fixed order to avoid deadlocks. */
export async function lockBarbers(tx: Executor, barberIds: Iterable<string>): Promise<void> {
  for (const id of [...new Set(barberIds)].sort()) {
    await tx.execute(sql`select pg_advisory_xact_lock(${BARBER_LOCK_NS}, hashtext(${id}))`);
  }
}
