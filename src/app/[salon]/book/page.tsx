import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Suspense } from "react";
import { BookingWizard } from "@/components/booking/BookingWizard";
import { todayIn } from "@/lib/domain/time";
import { getCatalog, loadSalonPage, publicConfig } from "@/lib/server/public-data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Онлайн-запись",
  description: "Выберите услугу, мастера и свободное время.",
};

export default async function BookPage({ params }: { params: Promise<{ salon: string }> }) {
  const page = await loadSalonPage((await params).salon);
  if (!page) notFound();
  const settings = page.salon;
  const base = `/${settings.slug}`;
  const catalog = await getCatalog(settings.id);
  return (
    <Suspense fallback={<p className="mx-auto max-w-6xl px-4 py-12">Загрузка…</p>}>
      <BookingWizard catalog={catalog} config={publicConfig(settings)} today={todayIn(settings.timezone)} />
    </Suspense>
  );
}
