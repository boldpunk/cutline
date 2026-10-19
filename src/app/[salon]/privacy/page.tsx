import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { env } from "@/lib/server/env";
import { loadSalonPage } from "@/lib/server/public-data";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Обработка персональных данных",
};

export default async function PrivacyPage({ params }: { params: Promise<{ salon: string }> }) {
  const page = await loadSalonPage((await params).salon);
  if (!page) notFound();
  const settings = page.salon;
  const base = `/${settings.slug}`;
  const s = settings;
  const missing = !s.privacyController || !s.privacyContact;
  return (
    <article className="mx-auto max-w-3xl px-4 py-12 md:py-16">
      <h1 className="display text-3xl md:text-[2.75rem]">Обработка персональных данных</h1>
      <p className="mt-3 text-sm text-muted-text">Версия текста согласия: {s.consentVersion}</p>

      {s.mode === "demo" && (
        <div className="card mt-6 border-ink p-4 text-sm">
          <strong>Демонстрационный режим.</strong> Салона не существует. Введённые при записи имя и телефон сохраняются в
          тестовой базе данных демо-стенда только для показа работы сервиса. Не вводите реальные данные.
        </div>
      )}
      {missing && s.mode === "live" && (
        <div className="card mt-6 border-danger p-4 text-sm text-danger">
          Владелец салона ещё не указал оператора и контакт по вопросам персональных данных.
        </div>
      )}

      <div className="mt-8 space-y-6 leading-relaxed">
        <section>
          <h2 className="text-xl font-semibold">Какие данные мы получаем</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>имя — чтобы мастер знал, кого ждать;</li>
            <li>номер телефона — чтобы связаться по поводу записи и чтобы вы могли подтвердить доступ к своей записи последними цифрами номера;</li>
            {env.emailEnabled && <li>e-mail, если вы его укажете, — только для писем о вашей записи;</li>}
            <li>комментарий к записи, если вы его оставите;</li>
            <li>факт и время согласия с этим текстом, номер его версии.</li>
          </ul>
        </section>
        <section>
          <h2 className="text-xl font-semibold">Кто видит данные</h2>
          <p className="mt-2">
            Контакты видят администратор салона и мастер, к которому вы записаны. На публичных страницах сайта имена и
            телефоны клиентов не показываются. Мы не передаём данные для рекламы и не используем сторонние аналитические
            сервисы на страницах записи.
          </p>
        </section>
        <section>
          <h2 className="text-xl font-semibold">Срок хранения</h2>
          <p className="mt-2">
            {s.retentionDays
              ? `Данные записи хранятся ${s.retentionDays} дн. после даты визита, затем удаляются или обезличиваются.`
              : "Срок хранения ещё не указан владельцем салона."}
          </p>
        </section>
        <section>
          <h2 className="text-xl font-semibold">Оператор и контакт</h2>
          <p className="mt-2">{s.privacyController ?? "Не указан."}</p>
          <p className="mt-1">По вопросам обработки и удаления данных: {s.privacyContact ?? "контакт не указан."}</p>
        </section>
        <p className="text-sm text-muted-text">
          Этот текст — шаблон, заполняемый владельцем салона. Он не является юридической консультацией; перед
          использованием проверьте его на соответствие применимому законодательству.
        </p>
      </div>
    </article>
  );
}
