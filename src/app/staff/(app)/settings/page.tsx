import type { Metadata } from "next";
import { sql } from "drizzle-orm";
import { HeroPhotoForm, SettingsForm } from "@/components/staff/SettingsForm";
import { getDb } from "@/lib/db/client";
import { bookings } from "@/lib/db/schema";
import { getSettings } from "@/lib/server/settings";
import { requireAdmin } from "@/lib/server/staff-auth";

export const metadata: Metadata = { title: "Настройки" };

export default async function SettingsPage() {
  await requireAdmin();
  const db = getDb();
  const s = await getSettings(db);
  const [{ n }] = (await db.select({ n: sql<number>`count(*)::int` }).from(bookings)) as [{ n: number }];
  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold">Настройки салона</h1>
      <p className="text-sm text-muted-text">
        Значения по умолчанию — демонстрационные. Для реального салона укажите только подтверждённые владельцем данные; пустые поля скрываются на
        сайте.
      </p>
      <SettingsForm
        tz={s.timezone}
        tzLocked={n > 0}
        initial={{
          name: s.name,
          tagline: s.tagline ?? "",
          about: s.about ?? "",
          address: s.address ?? "",
          mapUrl: s.mapUrl ?? "",
          phone: s.phone ?? "",
          socials: s.socials,
          timezone: s.timezone,
          slotStepMin: s.slotStepMin,
          minLeadMin: s.minLeadMin,
          horizonDays: s.horizonDays,
          cancelCutoffHours: s.cancelCutoffHours,
          mode: s.mode,
          barbersCanBlock: s.barbersCanBlock,
          privacyController: s.privacyController ?? "",
          privacyContact: s.privacyContact ?? "",
          retentionDays: s.retentionDays ?? "",
          consentVersion: s.consentVersion,
        }}
      />
      <HeroPhotoForm hasPhoto={!!s.heroMediaId} tz={s.timezone} />
    </div>
  );
}
