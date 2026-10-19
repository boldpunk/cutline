import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { salons } from "@/lib/db/schema";
import { env } from "@/lib/server/env";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: { absolute: "CUTLINE — страница онлайн-записи для барбершопа" },
  description: "Создайте страницу записи для своего барбершопа: услуги, мастера, свободное время, запись без двойных броней.",
};

const FEATURES: [string, string][] = [
  ["Только реальное свободное время", "Расписание мастеров, перерывы и отпуска учитываются автоматически. Два клиента не попадут на одно время."],
  ["Без регистрации для клиента", "Имя и телефон — и запись готова. Перенос и отмена по личной ссылке."],
  ["Кабинет для вас и мастеров", "Календарь на день и неделю, записи по телефону, отметки визитов, журнал изменений."],
  ["Поиск, который понимает", "Клиент находит услугу даже с опечаткой или в английской раскладке."],
];

export default async function PlatformHome() {
  const live = await getDb()
    .select({ slug: salons.slug, name: salons.name, mode: salons.mode, tagline: salons.tagline })
    .from(salons)
    .where(eq(salons.published, true))
    .orderBy(asc(salons.name))
    .limit(24);
  const host = new URL(env.appUrl).host;

  return (
    <div data-salon-theme="pole" className="min-h-dvh bg-paper text-ink">
      <header className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
        <Link href="/" className="display text-xl">
          CUTLINE
        </Link>
        <nav className="ml-auto flex items-center gap-2 text-sm sm:gap-4" aria-label="Основная навигация">
          <Link href="/demo" className="hidden underline-offset-4 hover:underline sm:inline">
            Демо
          </Link>
          <Link href="/staff" className="underline-offset-4 hover:underline">
            Войти
          </Link>
          <Link href="/start" className="btn btn-primary btn-sm">
            Открыть страницу
          </Link>
        </nav>
      </header>

      <main id="main">
        <section className="on-dark relative overflow-hidden bg-ink text-paper">
          <div aria-hidden className="pole pole-turning absolute inset-y-0 right-[6%] hidden w-14 rounded-full opacity-90 md:block" />
          <div className="mx-auto max-w-6xl px-4 py-16 md:py-24">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-highlight">Для барбершопов</p>
            <h1 className="display mt-5 max-w-3xl text-[clamp(2.4rem,7vw,4.75rem)]">Страница онлайн-записи. За один вечер.</h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-paper/85">
              Услуги и цены, мастера, свободное время по настоящему расписанию. Ваш адрес вида{" "}
              <span className="whitespace-nowrap rounded-md bg-surface px-2 py-0.5 font-semibold text-highlight">{host}/имя</span> — в шапку
              Instagram, и клиенты записываются сами.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/start" className="btn btn-primary px-7 text-lg">
                Открыть свою страницу
              </Link>
              <Link href="/demo" className="btn border-2 border-paper/50 text-paper hover:bg-paper/10">
                Посмотреть демо
              </Link>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 md:py-20" aria-labelledby="how-h">
          <h2 id="how-h" className="display text-3xl md:text-4xl">
            Как это работает
          </h2>
          <ol className="mt-10 grid gap-8 md:grid-cols-3">
            {[
              ["Создайте страницу", "Название и адрес. Пароль — чтобы входить в кабинет."],
              ["Заполните её", "Услуги, мастера, часы работы, контакты. Страница не видна, пока вы не опубликуете."],
              ["Делитесь ссылкой", "Instagram, Telegram, визитки. Записи появляются в календаре сразу."],
            ].map(([t, d], i) => (
              <li key={t} className="relative pl-16">
                <span className="display absolute left-0 top-0 flex h-11 w-11 items-center justify-center rounded-full bg-accent text-on-accent">
                  {i + 1}
                </span>
                <h3 className="text-xl font-bold">{t}</h3>
                <p className="mt-2 text-muted-text">{d}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="border-y border-line bg-card" aria-labelledby="feat-h">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-[1fr_2fr] md:py-20">
            <h2 id="feat-h" className="display text-3xl md:text-4xl">
              Что получают ваши клиенты и вы
            </h2>
            <ul className="grid gap-6 sm:grid-cols-2">
              {FEATURES.map(([t, d]) => (
                <li key={t} className="border-l-4 border-accent pl-4">
                  <h3 className="font-bold">{t}</h3>
                  <p className="mt-1 text-muted-text">{d}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {live.length > 0 && (
          <section className="mx-auto max-w-6xl px-4 py-16" aria-labelledby="live-h">
            <h2 id="live-h" className="display text-3xl md:text-4xl">
              Уже на CUTLINE
            </h2>
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {live.map((s) => (
                <li key={s.slug}>
                  <Link href={`/${s.slug}`} className="group block rounded-2xl border border-line bg-card p-5 transition-colors hover:border-ink">
                    <span className="display block text-xl group-hover:underline">{s.name}</span>
                    <span className="mt-1 block text-sm text-muted-text">
                      {host}/{s.slug}
                      {s.mode === "demo" ? " · демо" : ""}
                    </span>
                    {s.tagline && <span className="mt-3 block text-sm">{s.tagline}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <footer className="on-dark bg-ink text-paper">
        <div className="pole h-2" aria-hidden />
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-8 text-sm">
          <span className="display">CUTLINE</span>
          <span className="text-muted-dark">Онлайн-запись для барбершопов</span>
          <Link href="/start" className="link ml-auto">
            Открыть страницу
          </Link>
        </div>
      </footer>
    </div>
  );
}
