import type { Metadata } from "next";
import { eq, sql } from "drizzle-orm";
import { HeroPhotoForm, SettingsForm } from "@/components/staff/SettingsForm";
import { getDb } from "@/lib/db/client";
import { bookings } from "@/lib/db/schema";
import { getSalon } from "@/lib/server/settings";
import { env } from "@/lib/server/env";
import { requireAdmin } from "@/lib/server/staff-auth";

export const metadata: Metadata = { title: "Настройки" };

export default async function SettingsPage() {
  const user = await requireAdmin();
  const db = getDb();
  const s = await getSalon(db, user.salonId);
  const [{ n }] = (await db
    .select({ n: sql<number>`count(*)::int` })
    .from(bookings)
    .where(eq(bookings.salonId, user.salonId))) as [{ n: number }];
  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="text-2xl font-semibold">Настройки салона</h1>
      <p className="text-sm text-muted-text">
        Указывайте только достоверные данные — пустые поля на странице просто не показываются. Правила записи по умолчанию можно менять под
        свой салон.
      </p>
      <SettingsForm
        tz={s.timezone}
        host={new URL(env.appUrl).host}
        tzLocked={n > 0}
        initial={{
          name: s.name,
          slug: s.slug,
          theme: s.theme,
          instagramUrl: s.instagramUrl ?? "",
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
