// What a salon can offer besides the haircut. Fixed keys so the page stays
// honest and consistent: the owner ticks what they really have.
export const AMENITIES = {
  coffee: "Кофе и чай",
  wifi: "Wi-Fi",
  playstation: "PlayStation",
  kids: "Детское кресло",
  parking: "Парковка",
  card: "Оплата картой",
  ac: "Кондиционер",
  towel: "Горячее полотенце",
  cosmetics: "Продажа косметики",
  prayer: "Место для намаза",
} as const;

export type AmenityKey = keyof typeof AMENITIES;
export const AMENITY_KEYS = Object.keys(AMENITIES) as [AmenityKey, ...AmenityKey[]];

export function amenityLabels(keys: readonly string[]): string[] {
  return keys.filter((k): k is AmenityKey => k in AMENITIES).map((k) => AMENITIES[k]);
}
