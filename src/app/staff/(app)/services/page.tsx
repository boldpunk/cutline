import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { ServiceEditor } from "@/components/staff/ServiceEditor";
import { getDb } from "@/lib/db/client";
import { barberServices, services } from "@/lib/db/schema";
import { formatDuration, formatUzs } from "@/lib/domain/money";
import { getSettings } from "@/lib/server/settings";
import { requireAdmin } from "@/lib/server/staff-auth";
import { listBarbersBasic } from "@/lib/server/staff-data";

export const metadata: Metadata = { title: "Услуги" };

export default async function ServicesAdminPage() {
  await requireAdmin();
  const db = getDb();
  const [settings, list, links, barbers] = await Promise.all([
    getSettings(db),
    db.select().from(services).orderBy(asc(services.sortOrder), asc(services.name)),
    db.select().from(barberServices),
    listBarbersBasic(),
  ]);
  const empty = { id: null, name: "", description: "", category: "", durationMin: 60, priceUzs: 0, bufferBeforeMin: 0, bufferAfterMin: 0, sortOrder: list.length + 1, active: true };
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Услуги и цены</h1>
      <p className="text-sm text-muted-text">
        Одна запись — одна услуга. Комбинации («стрижка + борода») оформляйте отдельной услугой со своей ценой и длительностью. Изменение цены не
        меняет уже созданные записи.
      </p>
      <details className="rounded-xl border border-line bg-card p-4">
        <summary className="cursor-pointer font-semibold">+ Новая услуга</summary>
        <div className="mt-4">
          <ServiceEditor initial={empty} offers={[]} tz={settings.timezone} />
        </div>
      </details>
      <ul className="space-y-3">
        {list.map((s) => (
          <li key={s.id}>
            <details className="rounded-xl border border-line bg-card p-4">
              <summary className="cursor-pointer">
                <span className="font-semibold">{s.name}</span>{" "}
                <span className="text-sm text-muted-text">
                  · {formatUzs(s.priceUzs)} · {formatDuration(s.durationMin)}
                  {s.active ? "" : " · скрыта"}
                  {s.isDemo ? " · демо" : ""}
                </span>
              </summary>
              <div className="mt-4">
                <ServiceEditor
                  tz={settings.timezone}
                  initial={{
                    id: s.id,
                    name: s.name,
                    description: s.description ?? "",
                    category: s.category ?? "",
                    durationMin: s.durationMin,
                    priceUzs: s.priceUzs,
                    bufferBeforeMin: s.bufferBeforeMin,
                    bufferAfterMin: s.bufferAfterMin,
                    sortOrder: s.sortOrder,
                    active: s.active,
                  }}
                  offers={barbers.map((b) => {
                    const l = links.find((x) => x.barberId === b.id && x.serviceId === s.id);
                    return {
                      barberId: b.id,
                      barberName: b.name + (b.active ? "" : " (неактивен)"),
                      enabled: !!l,
                      priceUzs: l?.priceUzs != null ? String(l.priceUzs) : "",
                      durationMin: l?.durationMin != null ? String(l.durationMin) : "",
                    };
                  })}
                />
              </div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
