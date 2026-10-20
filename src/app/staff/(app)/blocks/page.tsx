import type { Metadata } from "next";
import { BlockForm, DeleteBlockButton } from "@/components/staff/BlockForm";
import { getDb } from "@/lib/db/client";
import { todayIn } from "@/lib/domain/time";
import { formatDateTimeCompact } from "@/lib/format";
import { getSalon } from "@/lib/server/settings";
import { requireStaff } from "@/lib/server/staff-auth";
import { listBarbersBasic, listBlocks } from "@/lib/server/staff-data";

export const metadata: Metadata = { title: "Блокировки" };
const KIND: Record<string, string> = { break: "Перерыв", vacation: "Отпуск", other: "Другое" };

export default async function BlocksPage() {
  const user = await requireStaff();
  const settings = await getSalon(getDb(), user.salonId);
  const tz = settings.timezone;
  const canEdit = user.role === "admin" || settings.barbersCanBlock;
  const barbers = (await listBarbersBasic(user.salonId, { activeOnly: true })).filter((b) => user.role === "admin" || b.id === user.barberId);
  const blocks = await listBlocks(user, new Date());
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Перерывы и отпуска</h1>
      {canEdit ? (
        <BlockForm barbers={barbers} today={todayIn(tz)} tz={tz} />
      ) : (
        <p className="text-muted-text">Администратор отключил самостоятельные блокировки для мастеров.</p>
      )}
      <section aria-labelledby="bl-list">
        <h2 id="bl-list" className="font-semibold">
          Действующие и будущие
        </h2>
        {blocks.length === 0 ? (
          <p className="mt-2 text-sm text-muted-text">Нет блокировок.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line rounded-xl border border-line bg-card text-sm">
            {blocks.map(({ b, barberName }) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span>
                  <strong>{KIND[b.kind]}</strong> · {barberName} · {formatDateTimeCompact(b.startAt, tz)} – {formatDateTimeCompact(b.endAt, tz)}
                  {b.note && <span className="text-muted-text"> · {b.note}</span>}
                </span>
                {canEdit && <DeleteBlockButton id={b.id} />}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
