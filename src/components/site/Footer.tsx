import Link from "next/link";
import type { SocialLink } from "@/lib/db/schema";

export function Footer({
  salonName,
  address,
  phone,
  socials,
  instagramUrl,
  mode,
  base,
}: {
  salonName: string;
  address: string | null;
  phone: string | null;
  socials: SocialLink[];
  instagramUrl: string | null;
  mode: "demo" | "live";
  base: string;
}) {
  const links = [...(instagramUrl ? [{ label: "Instagram", url: instagramUrl }] : []), ...socials];
  return (
    <footer className="on-dark bg-ink text-paper">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-3">
        <div>
          <p className="display text-2xl">{salonName}</p>
          {mode === "demo" && <p className="mt-2 text-sm text-muted-dark">Демонстрационный проект. Салона не существует.</p>}
        </div>
        <div className="space-y-1 text-sm">
          {address && <p>{address}</p>}
          {phone && (
            <p>
              <a className="link" href={`tel:${phone.replace(/[^\d+]/g, "")}`}>
                {phone}
              </a>
            </p>
          )}
          {links.length > 0 && (
            <ul className="flex flex-wrap gap-3 pt-2">
              {links.map((s) => (
                <li key={s.url}>
                  <a className="link" href={s.url} rel="noopener noreferrer" target="_blank">
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
        <ul className="space-y-1 text-sm sm:text-right">
          <li>
            <Link className="link" href={`${base}/privacy`}>
              Обработка персональных данных
            </Link>
          </li>
          <li>
            <Link className="link text-muted-dark" href="/staff" rel="nofollow">
              Вход для сотрудников
            </Link>
          </li>
          <li className="pt-3 text-xs text-muted-dark">
            Страница работает на{" "}
            <Link href="/" className="link">
              CUTLINE
            </Link>
          </li>
        </ul>
      </div>
    </footer>
  );
}
