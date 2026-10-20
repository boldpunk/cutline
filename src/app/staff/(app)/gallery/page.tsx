import type { Metadata } from "next";
import { GalleryManager } from "@/components/staff/GalleryManager";
import { getDb } from "@/lib/db/client";
import { getGallery } from "@/lib/server/public-data";
import { getSalon } from "@/lib/server/settings";
import { requireAdmin } from "@/lib/server/staff-auth";

export const metadata: Metadata = { title: "Работы" };

export default async function GalleryPage() {
  const user = await requireAdmin();
  const [s, items] = await Promise.all([getSalon(getDb(), user.salonId), getGallery(user.salonId)]);
  return (
    <div className="max-w-5xl space-y-4">
      <h1 className="text-2xl font-semibold">Работы</h1>
      <p className="text-sm text-muted-text">
        Портфолио салона: клиенты выбирают барбершоп глазами. Загружайте только свои работы и только с согласия клиента.
      </p>
      <GalleryManager items={items} tz={s.timezone} max={24} />
    </div>
  );
}
