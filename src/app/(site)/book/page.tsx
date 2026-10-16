import type { Metadata } from "next";
import { Suspense } from "react";
import { BookingWizard } from "@/components/booking/BookingWizard";
import { todayIn } from "@/lib/domain/time";
import { getCatalog, getPublicSettings, publicConfig } from "@/lib/server/public-data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Онлайн-запись",
  description: "Выберите услугу, мастера и свободное время.",
  alternates: { canonical: "/book" },
};

export default async function BookPage() {
  const [settings, catalog] = await Promise.all([getPublicSettings(), getCatalog()]);
  return (
    <Suspense fallback={<p className="mx-auto max-w-6xl px-4 py-12">Загрузка…</p>}>
      <BookingWizard catalog={catalog} config={publicConfig(settings)} today={todayIn(settings.timezone)} />
    </Suspense>
  );
}
