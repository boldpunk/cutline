// Read models for the staff area. Every function takes the current user and
// enforces visibility on the server: barbers only ever get their own bookings.
import { and, asc, count, desc, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  auditLog,
  barbers,
  bookingContacts,
  bookingEvents,
  bookings,
  notificationOutbox,
  scheduleExceptions,
  timeBlocks,
  users,
  weeklyAvailability,
  type BookingStatus,
} from "@/lib/db/schema";
import { normalizePhone } from "@/lib/domain/phone";
import { addDays, minutesToHHMM, zonedToUtc } from "@/lib/domain/time";
import type { Interval } from "@/lib/domain/intervals";
import { loadSchedule, windowsFor } from "./availability";
import { parseCode } from "./crypto";
import type { StaffUser } from "./sessions";
import type { Settings } from "./settings";

export function canSeeBooking(user: StaffUser, barberId: string): boolean {
  return user.role === "admin" || user.barberId === barberId;
}

export async function listBarbersBasic(opts: { activeOnly?: boolean } = {}) {
  return getDb()
    .select({ id: barbers.id, name: barbers.name, active: barbers.active, sortOrder: barbers.sortOrder })
    .from(barbers)
    .where(opts.activeOnly ? eq(barbers.active, true) : undefined)
    .orderBy(asc(barbers.sortOrder), asc(barbers.name), asc(barbers.id));
}

export type BookingFilters = {
  from?: string; // local date
  to?: string; // local date, inclusive
  barberId?: string;
  status?: BookingStatus;
  q?: string; // phone or booking code
  page: number;
  pageSize: number;
};

export async function listBookings(user: StaffUser, settings: Settings, f: BookingFilters) {
  const db = getDb();
  const tz = settings.timezone;
  const conds = [];
  if (user.role !== "admin") conds.push(eq(bookings.barberId, user.barberId!));
  else if (f.barberId) conds.push(eq(bookings.barberId, f.barberId));
  if (f.from) conds.push(gte(bookings.startAt, new Date(zonedToUtc(f.from, 0, tz))));
  if (f.to) conds.push(lt(bookings.startAt, new Date(zonedToUtc(addDays(f.to, 1), 0, tz))));
  if (f.status) conds.push(eq(bookings.status, f.status));
  if (f.q) {
    const code = parseCode(f.q);
    const phone = normalizePhone(f.q);
    const qConds = [];
    if (code) qConds.push(eq(bookings.code, code));
    if (phone) qConds.push(eq(bookingContacts.phoneE164, phone));
    // Unparseable search matches nothing rather than everything.
    conds.push(qConds.length ? or(...qConds)! : sql`false`);
  }
  const where = conds.length ? and(...conds) : undefined;
  const [{ total }] = (await db
    .select({ total: count() })
    .from(bookings)
    .leftJoin(bookingContacts, eq(bookingContacts.bookingId, bookings.id))
    .where(where)) as [{ total: number }];
  const rows = await db
    .select({
      id: bookings.id,
      code: bookings.code,
      startAt: bookings.startAt,
      endAt: bookings.endAt,
      status: bookings.status,
      serviceName: bookings.serviceName,
      priceUzs: bookings.priceUzs,
      barberId: bookings.barberId,
      barberName: barbers.name,
      clientName: bookingContacts.clientName,
      phone: bookingContacts.phoneE164,
      source: bookings.source,
    })
    .from(bookings)
    .innerJoin(barbers, eq(barbers.id, bookings.barberId))
    .leftJoin(bookingContacts, eq(bookingContacts.bookingId, bookings.id))
    .where(where)
    .orderBy(f.from || f.to ? asc(bookings.startAt) : desc(bookings.startAt))
    .limit(f.pageSize)
    .offset((f.page - 1) * f.pageSize);
  return { total, rows };
}

export async function bookingDetail(user: StaffUser, id: string) {
  const db = getDb();
  const [row] = await db
    .select({ b: bookings, barberName: barbers.name, contact: bookingContacts })
    .from(bookings)
    .innerJoin(barbers, eq(barbers.id, bookings.barberId))
    .leftJoin(bookingContacts, eq(bookingContacts.bookingId, bookings.id))
    .where(eq(bookings.id, id));
  if (!row || !canSeeBooking(user, row.b.barberId)) return null;
  const events = await db
    .select({ e: bookingEvents, actorName: users.name })
    .from(bookingEvents)
    .leftJoin(users, eq(users.id, bookingEvents.actorUserId))
    .where(eq(bookingEvents.bookingId, id))
    .orderBy(asc(bookingEvents.createdAt), asc(bookingEvents.id));
  const outbox = await db
    .select()
    .from(notificationOutbox)
    .where(eq(notificationOutbox.bookingId, id))
    .orderBy(asc(notificationOutbox.createdAt));
  return { ...row, events, outbox };
}

export type CalendarItem =
  | {
      kind: "booking";
      id: string;
      barberId: string;
      start: number;
      end: number;
      occupiedEnd: number;
      status: BookingStatus;
      serviceName: string;
      clientName: string | null;
      code: string;
    }
  | { kind: "block"; id: string; barberId: string; start: number; end: number; blockKind: string; note: string | null };

/** Bookings (not cancelled), blocks and working windows for barbers over local dates [from, to]. */
export async function calendarData(user: StaffUser, settings: Settings, barberIds: string[], from: string, to: string) {
  const visible = user.role === "admin" ? barberIds : barberIds.filter((id) => id === user.barberId);
  const db = getDb();
  const tz = settings.timezone;
  const rangeStart = new Date(zonedToUtc(from, 0, tz));
  const rangeEnd = new Date(zonedToUtc(addDays(to, 1), 0, tz));
  if (visible.length === 0) return { items: [] as CalendarItem[], windows: new Map<string, Interval[]>() };
  const [bk, blocks, schedule] = await Promise.all([
    db
      .select({
        id: bookings.id,
        barberId: bookings.barberId,
        startAt: bookings.startAt,
        endAt: bookings.endAt,
        occupiedUntil: bookings.occupiedUntil,
        status: bookings.status,
        serviceName: bookings.serviceName,
        code: bookings.code,
        clientName: bookingContacts.clientName,
      })
      .from(bookings)
      .leftJoin(bookingContacts, eq(bookingContacts.bookingId, bookings.id))
      .where(
        and(
          inArray(bookings.barberId, visible),
          inArray(bookings.status, ["confirmed", "completed", "no_show"]),
          lt(bookings.startAt, rangeEnd),
          gte(bookings.endAt, rangeStart),
        ),
      )
      .orderBy(asc(bookings.startAt)),
    db
      .select()
      .from(timeBlocks)
      .where(and(inArray(timeBlocks.barberId, visible), lt(timeBlocks.startAt, rangeEnd), gte(timeBlocks.endAt, rangeStart))),
    loadSchedule(db, tz, visible, from, to),
  ]);
  const items: CalendarItem[] = [
    ...bk.map((b) => ({
      kind: "booking" as const,
      id: b.id,
      barberId: b.barberId,
      start: b.startAt.getTime(),
      end: b.endAt.getTime(),
      occupiedEnd: b.occupiedUntil.getTime(),
      status: b.status,
      serviceName: b.serviceName,
      clientName: b.clientName,
      code: b.code,
    })),
    ...blocks.map((b) => ({
      kind: "block" as const,
      id: b.id,
      barberId: b.barberId,
      start: b.startAt.getTime(),
      end: b.endAt.getTime(),
      blockKind: b.kind,
      note: b.note,
    })),
  ];
  const windows = new Map<string, Interval[]>();
  for (const id of visible) {
    for (let d = from; d <= to; d = addDays(d, 1)) windows.set(`${id}|${d}`, windowsFor(schedule, id, d));
  }
  return { items, windows };
}

export async function listBlocks(user: StaffUser, fromInstant: Date) {
  const db = getDb();
  return db
    .select({ b: timeBlocks, barberName: barbers.name })
    .from(timeBlocks)
    .innerJoin(barbers, eq(barbers.id, timeBlocks.barberId))
    .where(and(gte(timeBlocks.endAt, fromInstant), user.role === "admin" ? undefined : eq(timeBlocks.barberId, user.barberId!)))
    .orderBy(asc(timeBlocks.startAt))
    .limit(200);
}

export async function listExceptions(fromDate: string) {
  return getDb()
    .select({ e: scheduleExceptions, barberName: barbers.name })
    .from(scheduleExceptions)
    .leftJoin(barbers, eq(barbers.id, scheduleExceptions.barberId))
    .where(gte(scheduleExceptions.date, fromDate))
    .orderBy(asc(scheduleExceptions.date), asc(scheduleExceptions.startMin))
    .limit(300);
}

export async function auditEntries(page: number, pageSize: number) {
  const db = getDb();
  // Merge staff audit log with booking history into one journal.
  const rows = await db.execute<{
    at: Date;
    source: string;
    action: string;
    entity: string | null;
    actor: string | null;
    data: Record<string, unknown>;
  }>(sql`
    select * from (
      select a.created_at as at, 'audit' as source, a.action, a.entity_type || coalesce(':' || a.entity_id, '') as entity,
             u.name as actor, a.data
        from ${auditLog} a left join ${users} u on u.id = a.actor_user_id
      union all
      select e.created_at as at, 'booking' as source, 'booking.' || e.type as action, 'booking:' || b.code as entity,
             coalesce(u.name, case e.actor_type when 'client' then 'клиент' when 'system' then 'система' end) as actor, e.data
        from ${bookingEvents} e join ${bookings} b on b.id = e.booking_id left join ${users} u on u.id = e.actor_user_id
    ) j order by at desc limit ${pageSize + 1} offset ${(page - 1) * pageSize}`);
  const list = [...rows];
  return { rows: list.slice(0, pageSize), hasMore: list.length > pageSize };
}

export async function outboxEntries(page: number, pageSize: number) {
  const db = getDb();
  const rows = await db
    .select({ o: notificationOutbox, code: bookings.code })
    .from(notificationOutbox)
    .innerJoin(bookings, eq(bookings.id, notificationOutbox.bookingId))
    .orderBy(desc(notificationOutbox.createdAt))
    .limit(pageSize + 1)
    .offset((page - 1) * pageSize);
  const counts = await db
    .select({ status: notificationOutbox.status, n: count() })
    .from(notificationOutbox)
    .groupBy(notificationOutbox.status);
  return { rows: rows.slice(0, pageSize), hasMore: rows.length > pageSize, counts };
}

/** Weekly hours of a barber (or the salon) as editable "HH:MM" ranges. */
export async function weeklyHoursFor(barberId: string | null): Promise<Record<number, { start: string; end: string }[]>> {
  const rows = await getDb()
    .select()
    .from(weeklyAvailability)
    .where(barberId ? eq(weeklyAvailability.barberId, barberId) : isNull(weeklyAvailability.barberId))
    .orderBy(asc(weeklyAvailability.weekday), asc(weeklyAvailability.startMin));
  const out: Record<number, { start: string; end: string }[]> = {};
  for (const r of rows) (out[r.weekday] ??= []).push({ start: minutesToHHMM(r.startMin), end: minutesToHHMM(r.endMin) });
  return out;
}
