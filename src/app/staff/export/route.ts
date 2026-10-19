import { getDb } from "@/lib/db/client";
import { BOOKING_STATUSES, type BookingStatus } from "@/lib/db/schema";
import { isValidDateString } from "@/lib/domain/time";
import { formatCode } from "@/lib/server/crypto";
import { formatDateTimeCompact, STATUS_LABELS } from "@/lib/format";
import { audit } from "@/lib/server/audit";
import { getSalon } from "@/lib/server/settings";
import { getStaff } from "@/lib/server/staff-auth";
import { listBookings } from "@/lib/server/staff-data";

export const dynamic = "force-dynamic";

function csvCell(v: string | number | null | undefined): string {
  let s = v === null || v === undefined ? "" : String(v);
  // Neutralise spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** Admin-only CSV export. Not linked publicly; requires a staff session. */
export async function GET(req: Request) {
  const user = await getStaff();
  if (!user || user.role !== "admin") return new Response("Not found", { status: 404 });
  const sp = new URL(req.url).searchParams;
  const settings = await getSalon(getDb(), user.salonId);
  const status = sp.get("status");
  const filters = {
    from: isValidDateString(sp.get("from") ?? "") ? sp.get("from")! : undefined,
    to: isValidDateString(sp.get("to") ?? "") ? sp.get("to")! : undefined,
    barberId: /^[0-9a-f-]{36}$/.test(sp.get("barber") ?? "") ? sp.get("barber")! : undefined,
    status: BOOKING_STATUSES.includes(status as BookingStatus) ? (status as BookingStatus) : undefined,
    q: sp.get("q")?.slice(0, 40) || undefined,
    page: 1,
    pageSize: 10_000,
  };
  const { rows } = await listBookings(user, settings, filters);
  const header = ["Код", "Начало", "Конец", "Статус", "Услуга", "Мастер", "Цена, сум", "Клиент", "Телефон", "Источник"];
  const lines = [header.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(
      [
        formatCode(r.code),
        formatDateTimeCompact(r.startAt, settings.timezone),
        formatDateTimeCompact(r.endAt, settings.timezone),
        STATUS_LABELS[r.status],
        r.serviceName,
        r.barberName,
        r.priceUzs,
        r.clientName,
        r.phone,
        r.source === "online" ? "онлайн" : "администратор",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  await audit(getDb(), user.salonId, user.id, "bookings.export_csv", "bookings", null, { rows: rows.length, filters: { ...filters, q: filters.q ? "…" : undefined } });
  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="bookings.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
