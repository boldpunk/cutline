import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { env } from "@/lib/server/env";
import { getStaff } from "@/lib/server/staff-auth";
import { StartForm } from "./StartForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Открыть страницу барбершопа", description: "Создайте страницу онлайн-записи для своего барбершопа." };

export default async function StartPage() {
  if (await getStaff()) redirect("/staff/setup");
  const host = new URL(env.appUrl).host;
  return (
    <div data-salon-theme="pole" className="min-h-dvh bg-paper text-ink">
      <div className="pole h-2" aria-hidden />
      <div className="mx-auto grid max-w-5xl gap-10 px-4 py-10 md:grid-cols-[1fr_1.1fr] md:py-16">
        <div className="min-w-0">
          <Link href="/" className="display text-xl">
            CUTLINE
          </Link>
          <h1 className="display mt-10 text-[clamp(1.75rem,8vw,3rem)]">Своя страница записи за вечер</h1>
          <ol className="mt-8 space-y-5">
            {[
              ["Создайте страницу", "Название и адрес — например, " + host + "/morki."],
              ["Заполните", "Услуги и цены, мастера, часы работы. Всё — в своём кабинете."],
              ["Опубликуйте", "Поставьте ссылку в шапку Instagram — клиенты записываются сами."],
            ].map(([t, d], i) => (
              <li key={t} className="flex gap-4">
                <span className="display flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-sm text-paper">{i + 1}</span>
                <span>
                  <span className="block font-semibold">{t}</span>
                  <span className="text-muted-text">{d}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-10 text-sm text-muted-text">
            Уже есть страница?{" "}
            <Link href="/staff" className="link">
              Войти в кабинет
            </Link>
          </p>
        </div>
        <div className="min-w-0 rounded-3xl border border-line bg-card p-5 shadow-sm sm:p-8">
          <StartForm host={host} />
        </div>
      </div>
    </div>
  );
}
