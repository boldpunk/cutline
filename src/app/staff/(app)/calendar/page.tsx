import type { Metadata } from "next";
import Link from "next/link";
import { AgendaList, CalendarGrid, type CalendarColumn } from "@/components/staff/CalendarGrid";
import { getDb } from "@/lib/db/client";
import { addDays, isValidDateString, startOfWeek, todayIn, utcToZoned } from "@/lib/domain/time";
import { formatLocalDate, tzLabel } from "@/lib/format";
import { getSettings } from "@/lib/server/settings";
import { requireStaff } from "@/lib/server/staff-auth";
import { calendarData, canSeeBooking, listBarbersBasic } from "@/lib/server/staff-data";

export const metadata: Metadata = { title: "Календарь" };

type SP = Promise<{ view?: string; date?: string; barber?: string }>;

export default async function CalendarPage({ searchParams }: { searchParams: SP }) {
  const user = await requireStaff();
  const settings = await getSettings(getDb());
  const tz = settings.timezone;
  const sp = await searchParams;
  const today = todayIn(tz);
  const date = sp.date && isValidDateString(sp.date) ? sp.date : today;
  const allBarbers = await listBarbersBasic();
  const barbers = user.role === "admin" ? allBarbers.filter((b) => b.active) : allBarbers.filter((b) => b.id === user.barberId);
  // Barbers default to their week; admins to the whole salon's day.
  const view = sp.view === "week" || sp.view === "day" ? sp.view : user.role === "admin" ? "day" : "week";
  const weekBarber = barbers.find((b) => b.id === sp.barber) ?? barbers[0];

  const from = view === "day" ? date : startOfWeek(date);
  const to = view === "day" ? date : addDays(from, 6);
  const shownBarbers = view === "day" ? barbers : weekBarber ? [weekBarber] : [];
  const { items, windows } = await calendarData(
    user,
    settings,
    shownBarbers.map((b) => b.id),
    from,
    to,
  );

  const columns: CalendarColumn[] =
    view === "day"
      ? shownBarbers.map((b) => ({ key: b.id, label: b.name, date, barberId: b.id }))
      : Array.from({ length: 7 }, (_, i) => {
          const d = addDays(from, i);
          return {
            key: d,
            label: formatLocalDate(d, { weekday: "short", day: "numeric", month: "short" }),
            sublabel: d === today ? "сегодня" : undefined,
            date: d,
            barberId: weekBarber!.id,
          };
        });

  // Visible hours: union of working windows, at least 09:00–21:00.
  let startMin = 9 * 60;
  let endMin = 21 * 60;
  for (const list of windows.values()) {
    for (const w of list) {
      const s = utcToZoned(w.start, tz).minutes;
      const e = utcToZoned(w.end, tz);
      startMin = Math.min(startMin, Math.floor(s / 60) * 60);
      endMin = Math.max(endMin, e.minutes === 0 ? 1440 : Math.ceil(e.minutes / 60) * 60);
    }
  }
  for (const it of items) {
    const s = utcToZoned(it.start, tz);
    if (s.date >= from && s.date <= to) startMin = Math.min(startMin, Math.floor(s.minutes / 60) * 60);
  }

  const step = view === "day" ? 1 : 7;
  const q = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ view, date, ...(weekBarber && view === "week" ? { barber: weekBarber.id } : {}), ...patch });
    return `/staff/calendar?${p}`;
  };
  const days = Array.from({ length: view === "day" ? 1 : 7 }, (_, i) => addDays(from, i)).map((d) => ({
    date: d,
    label: formatLocalDate(d, { weekday: "long", day: "numeric", month: "long" }),
  }));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">
          {view === "day"
            ? formatLocalDate(date, { weekday: "long", day: "numeric", month: "long" })
            : `Неделя ${formatLocalDate(from, { day: "numeric", month: "short" })} – ${formatLocalDate(to, { day: "numeric", month: "short" })}`}
        </h1>
        <span className="text-sm text-muted-text">время салона, {tzLabel(tz)}</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link className="btn btn-ghost btn-sm" href={q({ date: addDays(date, -step) })} aria-label={view === "day" ? "Предыдущий день" : "Предыдущая неделя"}>
          ←
        </Link>
        <Link className="btn btn-ghost btn-sm" href={q({ date: today })}>
          Сегодня
        </Link>
        <Link className="btn btn-ghost btn-sm" href={q({ date: addDays(date, step) })} aria-label={view === "day" ? "Следующий день" : "Следующая неделя"}>
          →
        </Link>
        <span className="mx-1 h-6 w-px bg-line" />
        <Link className={`btn btn-sm ${view === "day" ? "btn-dark" : "btn-ghost"}`} href={q({ view: "day" })} aria-current={view === "day" ? "true" : undefined}>
          День
        </Link>
        <Link className={`btn btn-sm ${view === "week" ? "btn-dark" : "btn-ghost"}`} href={q({ view: "week" })} aria-current={view === "week" ? "true" : undefined}>
          Неделя
        </Link>
        {view === "week" && barbers.length > 1 && (
          <form className="flex items-center gap-2" action="/staff/calendar">
            <input type="hidden" name="view" value="week" />
            <input type="hidden" name="date" value={date} />
            <label htmlFor="cal-barber" className="sr-only">
              Мастер
            </label>
            <select id="cal-barber" name="barber" defaultValue={weekBarber?.id} className="input min-h-9 py-1 text-sm">
              {barbers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <button className="btn btn-ghost btn-sm" type="submit">
              Показать
            </button>
          </form>
        )}
      </div>

      {shownBarbers.length === 0 ? (
        <p className="mt-6 text-muted-text">Нет активных мастеров.</p>
      ) : (
        <>
          <div className="mt-4 hidden md:block">
            <CalendarGrid
              columns={columns}
              items={items}
              windows={windows}
              tz={tz}
              startMin={startMin}
              endMin={endMin}
              showClient={(barberId) => canSeeBooking(user, barberId)}
            />
            <p className="mt-2 text-xs text-muted-text">
              Белое — рабочее время, штриховка — нерабочее. Серая полоса под записью — подготовка/уборка (buffer).
            </p>
          </div>
          <div className="mt-4 md:hidden">
            <AgendaList
              days={days}
              items={items}
              tz={tz}
              barberName={(id) => allBarbers.find((b) => b.id === id)?.name ?? ""}
              showBarber={view === "day" && shownBarbers.length > 1}
            />
          </div>
        </>
      )}
    </div>
  );
}
