import type { Metadata } from "next";
import Link from "next/link";

export const dynamic = "force-dynamic";
// Private pages: no indexing, no referrer (also set as HTTP headers), no third-party resources.
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default function PrivateLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-salon-theme="pole" className="min-h-dvh bg-paper text-ink">
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 max-w-3xl items-center px-4">
          <Link href="/" className="display text-lg">
            CUTLINE
          </Link>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-3xl px-4 py-10">
        {children}
      </main>
    </div>
  );
}
