import Link from "next/link";
import { SearchButton } from "@/components/search/SearchButton";

const NAV = [
  { href: "/services", label: "Услуги и цены" },
  { href: "/team", label: "Мастера" },
  { href: "/#contacts", label: "Контакты" },
];

export function Header({ salonName }: { salonName: string }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/95 backdrop-blur supports-[backdrop-filter]:bg-paper/85">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
        <Link href="/" className="display text-2xl tracking-tight" aria-label={`${salonName} — на главную`}>
          {salonName}
        </Link>
        <nav aria-label="Основная навигация" className="ml-auto hidden md:block">
          <ul className="flex items-center gap-6 text-[15px] font-medium">
            {NAV.map((n) => (
              <li key={n.href}>
                <Link href={n.href} className="hover:underline underline-offset-4">
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto md:ml-0">
          <SearchButton />
        </div>
        <details className="relative md:hidden">
          <summary className="btn btn-ghost btn-sm list-none [&::-webkit-details-marker]:hidden">Меню</summary>
          <ul className="card absolute right-0 top-12 w-56 p-2 shadow-lg">
            {NAV.map((n) => (
              <li key={n.href}>
                <Link href={n.href} className="block rounded-lg px-3 py-2.5 font-medium hover:bg-paper">
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </details>
        <Link href="/book" className="btn btn-primary btn-sm hidden sm:inline-flex">
          Записаться
        </Link>
      </div>
    </header>
  );
}
