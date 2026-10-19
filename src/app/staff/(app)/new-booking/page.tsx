import type { Metadata } from "next";
import { NewBookingForm } from "@/components/staff/NewBookingForm";
import { todayIn } from "@/lib/domain/time";
import { getDb } from "@/lib/db/client";
import { getCatalog } from "@/lib/server/public-data";
import { getSalon } from "@/lib/server/settings";
import { requireAdmin } from "@/lib/server/staff-auth";

export const metadata: Metadata = { title: "Новая запись" };

export default async function NewBookingPage() {
  const user = await requireAdmin();
  const [settings, catalog] = await Promise.all([getSalon(getDb(), user.salonId), getCatalog(user.salonId)]);
  return (
    <div>
      <h1 className="text-2xl font-semibold">Новая запись (телефон / визит)</h1>
      <p className="mt-1 text-sm text-muted-text">
        Та же проверка занятости, что и для онлайн-записи: пересечь чужую запись нельзя.
      </p>
      <NewBookingForm catalog={catalog} timezone={settings.timezone} today={todayIn(settings.timezone)} />
    </div>
  );
}
