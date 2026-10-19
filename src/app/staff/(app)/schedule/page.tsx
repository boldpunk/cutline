import type { Metadata } from "next";
import { ExceptionForm, RemoveExceptionButton } from "@/components/staff/ExceptionForm";
import { WeeklyHoursEditor } from "@/components/staff/WeeklyHoursEditor";
import { getDb } from "@/lib/db/client";
import { minutesToHHMM, todayIn } from "@/lib/domain/time";
import { formatLocalDate } from "@/lib/format";
import { getSalon } from "@/lib/server/settings";
import { requireAdmin } from "@/lib/server/staff-auth";
import { listBarbersBasic, listExceptions, weeklyHoursFor } from "@/lib/server/staff-data";

export const metadata: Metadata = { title: "График" };

export default async function SchedulePage() {
  const user = await requireAdmin();
  const settings = await getSalon(getDb(), user.salonId);
  const tz = settings.timezone;
  const today = todayIn(tz);
  const [salonHours, barbers, exceptions] = await Promise.all([weeklyHoursFor(user.salonId, null), listBarbersBasic(user.salonId, { activeOnly: true }), listExceptions(user.salonId, today)]);

  // Group exception rows by (scope, date).
  const groups = new Map<string, { barberId: string | null; barberName: string | null; date: string; kind: string; ranges: string[]; note: string | null }>();
  for (const { e, barberName } of exceptions) {
    const key = `${e.barberId ?? "salon"}|${e.date}`;
    const g = groups.get(key) ?? { barberId: e.barberId, barberName, date: e.date, kind: e.kind, ranges: [], note: e.note };
    if (e.kind === "hours") g.ranges.push(`${minutesToHHMM(e.startMin!)}–${minutesToHHMM(e.endMin!)}`);
    groups.set(key, g);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">График салона</h1>
        <p className="mt-1 text-sm text-muted-text">
          Часы салона ограничивают часы мастеров: мастер принимает только в пересечении своих часов и часов салона. Индивидуальные часы мастеров — на
          странице «Мастера». Изменение, которое затрагивает подтверждённые записи, не сохраняется, пока они не перенесены или не отменены.
        </p>
      </div>
      <WeeklyHoursEditor barberId={null} initial={salonHours} tz={tz} title="Часы работы салона" />
      <ExceptionForm barbers={barbers} today={today} tz={tz} />
      <section aria-labelledby="ex-list">
        <h2 id="ex-list" className="font-semibold">
          Предстоящие исключения
        </h2>
        {groups.size === 0 ? (
          <p className="mt-2 text-sm text-muted-text">Нет.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line rounded-xl border border-line bg-card text-sm">
            {[...groups.values()].map((g) => (
              <li key={`${g.barberId}|${g.date}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span>
                  <strong>{formatLocalDate(g.date, { weekday: "short", day: "numeric", month: "long" })}</strong> · {g.barberName ?? "весь салон"} ·{" "}
                  {g.kind === "closed" ? "закрыто" : g.ranges.join(", ")}
                  {g.note && <span className="text-muted-text"> · {g.note}</span>}
                </span>
                <RemoveExceptionButton barberId={g.barberId} date={g.date} tz={tz} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
