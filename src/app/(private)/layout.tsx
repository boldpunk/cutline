import type { Metadata } from "next";
import Link from "next/link";
import { DemoBanner } from "@/components/site/DemoBanner";
import { getPublicSettings } from "@/lib/server/public-data";

export const dynamic = "force-dynamic";
// Private pages: no indexing, no referrer (also set as HTTP headers), no third-party resources.
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default async function PrivateLayout({ children }: { children: React.ReactNode }) {
  const s = await getPublicSettings();
  return (
    <>
      <DemoBanner mode={s.mode} />
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-4">
          <Link href="/" className="display text-2xl">
            {s.name}
          </Link>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-3xl px-4 py-10">
        {children}
      </main>
    </>
  );
}
