"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** Mobile-only bottom bar. The layout reserves its height so it never covers content. */
export function StickyBookBar({ base }: { base: string }) {
  const path = usePathname();
  if (path.startsWith(`${base}/book`)) return null;
  return (
    <>
      <div aria-hidden className="h-20 sm:hidden" />
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:hidden">
        <Link href={`${base}/book`} className="btn btn-primary w-full">
          Записаться
        </Link>
      </div>
    </>
  );
}
