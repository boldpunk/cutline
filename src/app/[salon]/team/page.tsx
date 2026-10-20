import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { Monogram } from "@/components/site/Monogram";
import { getCatalog, loadSalonPage } from "@/lib/server/public-data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Мастера",
  description: "Мастера барбершопа и услуги, которые они выполняют.",
};

export default async function TeamPage({ params }: { params: Promise<{ salon: string }> }) {
  const page = await loadSalonPage((await params).salon);
  if (!page) notFound();
  const settings = page.salon;
  const base = `/${settings.slug}`;
  const { barbers, services } = await getCatalog(settings.id);
  const serviceName = new Map(services.map((s) => [s.id, s.name]));
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 md:py-16">
      <h1 className="display text-4xl md:text-5xl">Мастера</h1>
      {barbers.some((b) => b.isDemo) && (
        <p className="mt-4 text-sm font-medium">Демонстрационная команда: имена и описания вымышлены, фотографий нет.</p>
      )}
      {barbers.length === 0 && <p className="mt-10 text-muted-text">Профили мастеров ещё не опубликованы.</p>}
      <ul className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {barbers.map((b) => (
          <li key={b.id} className="flex flex-col overflow-hidden rounded-2xl border border-line bg-card">
            {b.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={b.photoUrl} alt={`Мастер ${b.name}`} className="aspect-[4/5] w-full object-cover" />
            ) : (
              <Monogram name={b.name} className="aspect-[4/3] w-full [container-type:inline-size]" />
            )}
            <div className="flex flex-1 flex-col p-5">
              <h2 className="display text-2xl">{b.name}</h2>
              {b.specialization && <p className="mt-1 font-medium">{b.specialization}</p>}
              {b.bio && <p className="mt-3 text-muted-text">{b.bio}</p>}
              {b.serviceIds.length > 0 && (
                <>
                  <h3 className="mt-5 text-sm font-semibold uppercase tracking-wider text-muted-text">Услуги</h3>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {b.serviceIds.map((id) => (
                      <li key={id} className="rounded-full border border-line bg-paper px-3 py-1 text-sm">
                        {serviceName.get(id)}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <div className="mt-auto pt-6">
                <Link href={`${base}/book?barber=${b.id}`} className="btn btn-dark btn-sm w-full">
                  Записаться к мастеру {b.name}
                </Link>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
