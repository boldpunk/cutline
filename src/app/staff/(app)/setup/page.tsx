import type { Metadata } from "next";
import Link from "next/link";
import { CopyLink, PublishControls } from "@/components/staff/PublishControls";
import { env } from "@/lib/server/env";
import { setupStatus } from "@/lib/server/onboarding";
import { requireAdmin } from "@/lib/server/staff-auth";

export const metadata: Metadata = { title: "Страница" };

export default async function SetupPage() {
  const user = await requireAdmin();
  const { salon, steps, ready } = await setupStatus(user.salonId);
  const url = `${env.appUrl}/${salon.slug}`;
  const done = steps.filter((s) => s.done).length;

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wider text-muted-text">{salon.published ? "Опубликовано" : "Черновик"}</p>
        <h1 className="display mt-1 text-3xl">{salon.name}</h1>
        <p className="mt-2 text-muted-text">
          {salon.published
            ? "Страница открыта для клиентов. Изменения в услугах, мастерах и графике видны сразу."
            : "Заполните страницу — клиенты увидят её только после публикации."}{" "}
          <a href={`/${salon.slug}`} target="_blank" rel="noopener" className="link font-medium text-ink">
            {salon.published ? "Открыть страницу ↗" : "Предпросмотр ↗"}
          </a>
        </p>
      </div>

      {salon.published ? (
        <section className="rounded-2xl border-2 border-ink bg-card p-5" aria-labelledby="share-h">
          <h2 id="share-h" className="text-lg font-semibold">
            Ссылка для клиентов
          </h2>
          <p className="mt-1 text-sm text-muted-text">Поставьте её в шапку профиля Instagram и в мессенджеры.</p>
          <div className="mt-3">
            <CopyLink url={url} />
          </div>
        </section>
      ) : (
        <section aria-labelledby="steps-h">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="steps-h" className="text-lg font-semibold">
              До публикации
            </h2>
            <span className="text-sm text-muted-text tabular-nums">
              {done} из {steps.length}
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-line" aria-hidden>
            <div className="pole h-full" style={{ width: `${(done / steps.length) * 100}%` }} />
          </div>
          <ol className="mt-4 divide-y divide-line rounded-2xl border border-line bg-card">
            {steps.map((s) => (
              <li key={s.key} className="flex items-start gap-4 p-4">
                <span
                  aria-hidden
                  className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                    s.done ? "bg-success text-white" : "border-2 border-line text-muted"
                  }`}
                >
                  {s.done ? "✓" : ""}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">
                    {s.title}
                    <span className="sr-only">{s.done ? " — готово" : " — не заполнено"}</span>
                  </span>
                  <span className="text-sm text-muted-text">{s.hint}</span>
                </span>
                {!s.done && (
                  <Link href={s.href} className="btn btn-ghost btn-sm shrink-0">
                    Заполнить
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      <PublishControls published={salon.published} ready={ready} />

      <section className="rounded-2xl border border-line bg-card p-5 text-sm" aria-labelledby="more-h">
        <h2 id="more-h" className="font-semibold">
          Сделать страницу своей
        </h2>
        <ul className="mt-2 space-y-1">
          <li>
            <Link className="link" href="/staff/settings">
              Стиль, адрес страницы, Instagram, правила записи
            </Link>
          </li>
          <li>
            <Link className="link" href="/staff/barbers">
              Фото мастеров
            </Link>{" "}
            — только те, что вы вправе публиковать
          </li>
          <li>
            <Link className="link" href="/staff/gallery">
              Работы
            </Link>{" "}
            — портфолио: фейды, бороды, детские стрижки
          </li>
          <li>
            <Link className="link" href="/staff/users">
              Доступ для мастеров
            </Link>
          </li>
        </ul>
      </section>
    </div>
  );
}
