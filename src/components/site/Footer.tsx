import Link from "next/link";
import type { SocialLink } from "@/lib/db/schema";

export function Footer({
  salonName,
  address,
  phone,
  socials,
  mode,
}: {
  salonName: string;
  address: string | null;
  phone: string | null;
  socials: SocialLink[];
  mode: "demo" | "live";
}) {
  return (
    <footer className="on-dark bg-ink text-paper">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-3">
        <div>
          <p className="display text-3xl">{salonName}</p>
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
          {socials.length > 0 && (
            <ul className="flex flex-wrap gap-3 pt-2">
              {socials.map((s) => (
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
            <Link className="link" href="/privacy">
              Обработка персональных данных
            </Link>
          </li>
          <li>
            <Link className="link text-muted-dark" href="/staff" rel="nofollow">
              Вход для сотрудников
            </Link>
          </li>
        </ul>
      </div>
    </footer>
  );
}
