import Link from "next/link";
import { SearchButton } from "@/components/search/SearchButton";

export function Header({ salonName, base }: { salonName: string; base: string }) {
  const nav = [
    { href: `${base}/services`, label: "Услуги и цены" },
    { href: `${base}/team`, label: "Мастера" },
    { href: `${base}#contacts`, label: "Контакты" },
  ];
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/95 backdrop-blur supports-[backdrop-filter]:bg-paper/85">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
        <Link href={base} className="display min-w-0 truncate text-xl" aria-label={`${salonName} — на главную`}>
          {salonName}
        </Link>
        <nav aria-label="Основная навигация" className="ml-auto hidden md:block">
          <ul className="flex items-center gap-6 text-[15px] font-medium">
            {nav.map((n) => (
              <li key={n.href}>
                <Link href={n.href} className="underline-offset-4 hover:underline">
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto shrink-0 md:ml-0">
          <SearchButton href={`${base}/search`} />
        </div>
        <details className="relative shrink-0 md:hidden">
          <summary className="btn btn-ghost btn-sm list-none [&::-webkit-details-marker]:hidden">Меню</summary>
          <ul className="card absolute right-0 top-12 z-40 w-56 p-2 shadow-lg">
            {nav.map((n) => (
              <li key={n.href}>
                <Link href={n.href} className="block rounded-lg px-3 py-2.5 font-medium hover:bg-paper">
                  {n.label}
                </Link>
              </li>
            ))}
          </ul>
        </details>
        <Link href={`${base}/book`} className="btn btn-primary btn-sm hidden shrink-0 sm:inline-flex">
          Записаться
        </Link>
      </div>
    </header>
  );
}
