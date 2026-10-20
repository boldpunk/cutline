import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { BarberActiveToggle, BarberProfileForm, PhotoForm } from "@/components/staff/BarberForms";
import { WeeklyHoursEditor } from "@/components/staff/WeeklyHoursEditor";
import { getDb } from "@/lib/db/client";
import { barbers } from "@/lib/db/schema";
import { getSalon } from "@/lib/server/settings";
import { requireAdmin } from "@/lib/server/staff-auth";
import { weeklyHoursFor } from "@/lib/server/staff-data";
import { mediaUrl } from "@/lib/server/public-data";

export const metadata: Metadata = { title: "Мастер" };

export default async function BarberAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const db = getDb();
  const [b] = await db.select().from(barbers).where(eq(barbers.id, id));
  if (!b) notFound();
  const [settings, hours] = await Promise.all([getSalon(db, user.salonId), weeklyHoursFor(user.salonId, id)]);
  const tz = settings.timezone;
  const photo = mediaUrl(b.photoMediaId);
  return (
    <div className="max-w-4xl space-y-6">
      <Link href="/staff/barbers" className="link text-sm">
        ← Все мастера
      </Link>
      <h1 className="text-2xl font-semibold">
        {b.name} {!b.active && <span className="chip ml-2 align-middle text-muted-text">скрыт</span>}
      </h1>
      <section className="rounded-xl border border-line bg-card p-4">
        <h2 className="mb-3 font-semibold">Профиль</h2>
        <BarberProfileForm id={b.id} initial={{ name: b.name, specialization: b.specialization ?? "", bio: b.bio ?? "", sortOrder: b.sortOrder }} tz={tz} />
      </section>
      <section className="grid gap-4 rounded-xl border border-line bg-card p-4 sm:grid-cols-[10rem_1fr]">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt={`Фото: ${b.name}`} className="aspect-square w-40 rounded-lg object-cover" />
        ) : (
          <div className="flex aspect-square w-40 items-center justify-center rounded-lg border border-dashed border-muted text-sm text-muted-text">
            Фото не загружено — на сайте показываются инициалы
          </div>
        )}
        <PhotoForm barberId={b.id} hasPhoto={!!photo} tz={tz} />
      </section>
      <WeeklyHoursEditor barberId={b.id} initial={hours} tz={tz} title="Рабочие часы мастера" />
      <p className="text-sm text-muted-text">
        Услуги и индивидуальные цены мастера настраиваются в разделе <Link className="link" href="/staff/services">«Услуги»</Link>. Отпуска и
        перерывы — в разделе <Link className="link" href="/staff/blocks">«Блокировки»</Link>.
      </p>
      <section className="rounded-xl border border-line bg-card p-4">
        <h2 className="mb-2 font-semibold">Доступность для записи</h2>
        <p className="mb-3 text-sm text-muted-text">Скрыть мастера можно, только если у него нет будущих подтверждённых записей.</p>
        <BarberActiveToggle id={b.id} active={b.active} tz={tz} />
      </section>
    </div>
  );
}
