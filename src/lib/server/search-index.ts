// Builds the public search index from live catalog data. Contains only public
// facts (services, prices, barbers, salon info) — never client data.
import type { SearchDoc } from "@/lib/search/engine";
import { formatDuration, formatUzs } from "@/lib/domain/money";
import { getCatalog, getPublicSettings } from "./public-data";

export async function buildSearchIndex(): Promise<SearchDoc[]> {
  const [catalog, settings] = await Promise.all([getCatalog(), getPublicSettings()]);
  const barberName = new Map(catalog.barbers.map((b) => [b.id, b.name]));
  const serviceName = new Map(catalog.services.map((s) => [s.id, s.name]));

  const services: SearchDoc[] = catalog.services.map((s) => ({
    id: `service:${s.id}`,
    kind: "service",
    title: s.name,
    subtitle: [
      s.minPrice === s.maxPrice ? formatUzs(s.minPrice) : `${formatUzs(s.minPrice)} – ${formatUzs(s.maxPrice)}`,
      s.minDuration === s.maxDuration ? formatDuration(s.minDuration) : `${formatDuration(s.minDuration)} – ${formatDuration(s.maxDuration)}`,
    ].join(" · "),
    keywords: [s.description, s.category, ...s.offers.map((o) => barberName.get(o.barberId))].filter(Boolean).join(" "),
    href: `/book?service=${s.id}&step=barber`,
    weight: 3,
  }));

  const barbers: SearchDoc[] = catalog.barbers.map((b) => ({
    id: `barber:${b.id}`,
    kind: "barber",
    title: b.name,
    subtitle: b.specialization ?? "Мастер",
    keywords: ["мастер барбер", b.bio, ...b.serviceIds.map((id) => serviceName.get(id))].filter(Boolean).join(" "),
    href: `/book?barber=${b.id}`,
    weight: 2,
  }));

  const info: SearchDoc[] = [
    {
      id: "info:book",
      kind: "info",
      title: "Записаться онлайн",
      subtitle: "Услуга, мастер и свободное время",
      keywords: "запись записаться забронировать бронь время свободно окно онлайн",
      href: "/book",
    },
    {
      id: "info:contacts",
      kind: "info",
      title: "Адрес и часы работы",
      subtitle: settings.address ?? "График работы салона",
      keywords: "адрес где находится карта как добраться часы график режим работы открыто телефон контакты",
      href: "/#contacts",
    },
    {
      id: "info:prices",
      kind: "info",
      title: "Все услуги и цены",
      subtitle: "Прайс с длительностью",
      keywords: "прайс цены стоимость сколько стоит услуги",
      href: "/services",
    },
    {
      id: "info:team",
      kind: "info",
      title: "Все мастера",
      subtitle: "Кто работает в салоне",
      keywords: "мастера барберы команда парикмахер",
      href: "/team",
    },
    {
      id: "info:manage",
      kind: "info",
      title: "Перенос и отмена записи",
      subtitle: `По личной ссылке, не позднее чем за ${settings.cancelCutoffHours} ч`,
      keywords: "перенести отменить отмена перенос изменить запись ссылка опоздаю",
      href: "/#how",
    },
    {
      id: "info:privacy",
      kind: "info",
      title: "Обработка персональных данных",
      subtitle: "Какие данные мы храним и сколько",
      keywords: "персональные данные политика конфиденциальность согласие телефон удалить",
      href: "/privacy",
    },
  ];
  return [...services, ...barbers, ...info];
}
