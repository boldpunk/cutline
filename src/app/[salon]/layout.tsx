import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SearchDialog } from "@/components/search/SearchDialog";
import { DemoBanner } from "@/components/site/DemoBanner";
import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";
import { StickyBookBar } from "@/components/site/StickyBookBar";
import { loadSalonPage } from "@/lib/server/public-data";

export const dynamic = "force-dynamic";

type Props = { children: React.ReactNode; params: Promise<{ salon: string }> };

export async function generateMetadata({ params }: Omit<Props, "children">): Promise<Metadata> {
  const page = await loadSalonPage((await params).salon);
  if (!page) return {};
  const { salon } = page;
  return {
    title: { default: `${salon.name} — онлайн-запись`, template: `%s · ${salon.name}` },
    description: salon.tagline ?? `Онлайн-запись в ${salon.name}: услуги, мастера, свободное время.`,
    // Drafts and demos are never indexed.
    robots: page.preview || salon.mode === "demo" ? { index: false, follow: false } : undefined,
  };
}

export default async function SalonLayout({ children, params }: Props) {
  const page = await loadSalonPage((await params).salon);
  if (!page) notFound();
  const { salon, preview } = page;
  const base = `/${salon.slug}`;
  return (
    <div data-salon-theme={salon.theme} className="min-h-dvh bg-paper text-ink">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 btn btn-dark">
        К содержимому
      </a>
      {preview && (
        <div className="bg-ink px-4 py-2 text-center text-sm text-paper">
          Черновик: страницу видите только вы.{" "}
          <Link href="/staff/setup" className="link text-highlight">
            Что осталось до публикации
          </Link>
        </div>
      )}
      <DemoBanner mode={salon.mode} />
      <Header salonName={salon.name} base={base} />
      <main id="main">{children}</main>
      <Footer salonName={salon.name} address={salon.address} phone={salon.phone} socials={salon.socials} instagramUrl={salon.instagramUrl} mode={salon.mode} base={base} />
      <StickyBookBar base={base} />
      <SearchDialog slug={salon.slug} />
    </div>
  );
}
