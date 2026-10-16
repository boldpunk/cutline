import { DemoBanner } from "@/components/site/DemoBanner";
import { Footer } from "@/components/site/Footer";
import { Header } from "@/components/site/Header";
import { StickyBookBar } from "@/components/site/StickyBookBar";
import { getPublicSettings } from "@/lib/server/public-data";

export const dynamic = "force-dynamic";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const s = await getPublicSettings();
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 btn btn-dark">
        К содержимому
      </a>
      <DemoBanner mode={s.mode} />
      <Header salonName={s.name} />
      <main id="main">{children}</main>
      <Footer salonName={s.name} address={s.address} phone={s.phone} socials={s.socials} mode={s.mode} />
      <StickyBookBar />
    </>
  );
}
