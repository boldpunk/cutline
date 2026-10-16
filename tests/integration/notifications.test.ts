import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { bookingContacts, bookings, notificationOutbox, salonSettings } from "@/lib/db/schema";
import { cancelBooking, createBooking, rescheduleBooking } from "@/lib/server/bookings";
import { housekeeping, processOutboxOnce, smtpProvider, type EmailProvider } from "@/lib/server/notifications";
import { DAY1, NOW, at, buildWorld, clientInput, resetDatabase, type World } from "./harness";

let w: World;
beforeEach(async () => {
  await resetDatabase();
  w = await buildWorld();
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = "1"; // nothing listens here → real connection failure
});
afterEach(() => {
  process.env.SMTP_HOST = "";
});

const outbox = () => getDb().select().from(notificationOutbox);

describe("A11 notification failures never affect bookings", () => {
  it("booking is saved; failed delivery is recorded and retried, then marked failed", async () => {
    const b = await createBooking(clientInput(w, { email: "client@example.com" }));
    const [row] = await getDb().select().from(bookings).where(eq(bookings.id, b.bookingId));
    expect(row!.status).toBe("confirmed");
    const rows = await outbox();
    expect(rows.map((r) => r.eventType).sort()).toEqual(["booking_confirmed", "reminder"]);

    // Real SMTP transport against a closed port.
    const now = new Date(NOW);
    expect(await processOutboxOnce(smtpProvider(), now)).toBe(1);
    const [confirmed] = (await outbox()).filter((r) => r.eventType === "booking_confirmed");
    expect(confirmed!.status).toBe("queued");
    expect(confirmed!.attempts).toBe(1);
    expect(confirmed!.lastError).toMatch(/ECONNREFUSED|connect/i);
    expect(confirmed!.lastError).not.toContain("client@example.com");

    // Keep failing until max attempts.
    const failing: EmailProvider = { send: async () => { throw new Error("535 auth failed user=secret pass=hunter2"); } };
    for (let i = 0; i < 6; i++) await processOutboxOnce(failing, new Date(NOW + (i + 1) * 5 * 3600_000));
    const [final] = (await outbox()).filter((r) => r.eventType === "booking_confirmed");
    expect(final!.status).toBe("failed");
    expect(final!.attempts).toBe(5);
    expect(final!.lastError).not.toContain("hunter2");
    // The booking is untouched.
    const [still] = await getDb().select().from(bookings).where(eq(bookings.id, b.bookingId));
    expect(still!.status).toBe("confirmed");
  });

  it("successful delivery is sent once; reschedule replaces the reminder; cancel cancels it", async () => {
    const sent: string[] = [];
    const ok: EmailProvider = { send: async (m) => void sent.push(m.subject) };
    const b = await createBooking(clientInput(w, { email: "client@example.com" }));
    await processOutboxOnce(ok, new Date(NOW));
    await processOutboxOnce(ok, new Date(NOW)); // second run: nothing left to send now
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain("Запись подтверждена");

    await rescheduleBooking({ bookingId: b.bookingId, newStartAt: at(DAY1, "15:00"), actor: { type: "client" }, now: NOW });
    let rows = await outbox();
    expect(rows.filter((r) => r.eventType === "reminder" && r.status === "queued")).toHaveLength(1);
    expect(rows.filter((r) => r.eventType === "reminder" && r.status === "cancelled")).toHaveLength(1);

    await cancelBooking({ bookingId: b.bookingId, actor: { type: "client" }, now: NOW });
    rows = await outbox();
    expect(rows.filter((r) => r.eventType === "reminder" && r.status === "queued")).toHaveLength(0);
    // Deliver everything that's due "tomorrow": rescheduled + cancelled notices.
    await processOutboxOnce(ok, new Date(Date.parse(at(DAY1, "09:00"))));
    expect(sent.filter((s) => s.includes("перенесена"))).toHaveLength(1);
    expect(sent.filter((s) => s.includes("отменена"))).toHaveLength(1);
    expect(sent.filter((s) => s.includes("Напоминание"))).toHaveLength(0);
  });

  it("without SMTP nothing is enqueued", async () => {
    process.env.SMTP_HOST = "";
    const b = await createBooking(clientInput(w, { email: "client@example.com" }));
    expect(await outbox()).toHaveLength(0);
    expect(b.code).toBeTruthy();
  });
});

describe("retention", () => {
  it("removes contact data of visits older than the retention period", async () => {
    const b = await createBooking(clientInput(w));
    await getDb().update(salonSettings).set({ retentionDays: 30 });
    const r1 = await housekeeping(new Date(NOW + 10 * 86_400_000));
    expect(r1.contactsDeleted).toBe(0);
    const r2 = await housekeeping(new Date(NOW + 40 * 86_400_000));
    expect(r2.contactsDeleted).toBe(1);
    expect(await getDb().select().from(bookingContacts).where(eq(bookingContacts.bookingId, b.bookingId))).toHaveLength(0);
    expect(await getDb().select().from(bookings).where(eq(bookings.id, b.bookingId))).toHaveLength(1);
  });
});
