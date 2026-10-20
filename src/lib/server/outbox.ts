// Notification outbox. Rows are written inside the booking transaction, so a
// notification exists iff the booking change committed; delivery happens later
// in the worker and can never undo or block a booking.
import { and, eq, inArray } from "drizzle-orm";
import type { Executor } from "@/lib/db/client";
import { notificationOutbox, type NotificationEvent } from "@/lib/db/schema";
import { MS } from "@/lib/domain/time";
import { env } from "./env";

type BookingRef = { id: string; startAt: Date; rescheduleCount: number };

export async function enqueueForBooking(
  ex: Executor,
  booking: BookingRef,
  clientEmail: string | null,
  event: Exclude<NotificationEvent, "reminder">,
  now: number,
): Promise<void> {
  // Only e-mail exists as a channel in v1, and only if the client gave an address
  // and the owner configured SMTP.
  if (!clientEmail || !env.emailEnabled) return;

  // Any pending reminder refers to the old time (or a cancelled visit).
  await ex
    .update(notificationOutbox)
    .set({ status: "cancelled", updatedAt: new Date(now) })
    .where(
      and(
        eq(notificationOutbox.bookingId, booking.id),
        eq(notificationOutbox.eventType, "reminder"),
        eq(notificationOutbox.status, "queued"),
      ),
    );

  const rows: (typeof notificationOutbox.$inferInsert)[] = [
    {
      bookingId: booking.id,
      eventType: event,
      channel: "email",
      dedupeKey: `${booking.id}:${event}:${booking.rescheduleCount}`,
      nextAttemptAt: new Date(now),
    },
  ];
  const hours = env.reminderHoursBefore;
  const remindAt = booking.startAt.getTime() - hours * MS.HOUR;
  if (event !== "cancelled" && hours > 0 && remindAt > now) {
    rows.push({
      bookingId: booking.id,
      eventType: "reminder",
      channel: "email",
      dedupeKey: `${booking.id}:reminder:${booking.rescheduleCount}`,
      nextAttemptAt: new Date(remindAt),
    });
  }
  await ex.insert(notificationOutbox).values(rows).onConflictDoNothing({ target: notificationOutbox.dedupeKey });
}

export async function cancelQueuedForBookings(ex: Executor, bookingIds: string[]): Promise<void> {
  if (bookingIds.length === 0) return;
  await ex
    .update(notificationOutbox)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(inArray(notificationOutbox.bookingId, bookingIds), eq(notificationOutbox.status, "queued")));
}
