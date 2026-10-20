import { describe, expect, it } from "vitest";
import { editDistance, fixLayout, highlightParts, normalize, prepare, search, transliterate, type SearchDoc } from "@/lib/search/engine";

const DOCS: SearchDoc[] = [
  { id: "s1", kind: "service", title: "Мужская стрижка", keywords: "ножницы машинка укладка", href: "/a", weight: 1 },
  { id: "s2", kind: "service", title: "Оформление бороды", keywords: "борода контур", href: "/b", weight: 1 },
  { id: "s3", kind: "service", title: "Стрижка + борода", keywords: "комплекс", href: "/c", weight: 1 },
  { id: "s4", kind: "service", title: "Стрижка машинкой", href: "/d", weight: 1 },
  { id: "b1", kind: "barber", title: "Тимур", subtitle: "Классические стрижки", href: "/e" },
  { id: "i1", kind: "info", title: "Отмена и перенос записи", keywords: "отменить перенести", href: "/f" },
  { id: "i2", kind: "info", title: "Адрес и часы работы", keywords: "где находится график", href: "/g" },
];
const index = prepare(DOCS);
const titles = (q: string) => search(index, q).map((h) => h.doc.title);

describe("text helpers", () => {
  it("normalizes case, ё and punctuation", () => {
    expect(normalize("  Ёлка, СТРИЖКА+борода! ")).toBe("елка стрижка борода");
  });
  it("re-types the wrong keyboard layout", () => {
    expect(fixLayout("cnhb;rf")).toBe("стрижка");
    expect(fixLayout(",jhjlf")).toBe("борода");
  });
  it("transliterates Latin", () => {
    expect(transliterate("strizhka")).toBe("стрижка");
    expect(transliterate("boroda")).toBe("борода");
  });
  it("edit distance counts a swap as one edit", () => {
    expect(editDistance("стрижка", "стрижка")).toBe(0);
    expect(editDistance("стришка", "стрижка")).toBe(1);
    expect(editDistance("стрикжа", "стрижка")).toBe(1);
    expect(editDistance("срижк", "стрижка", 1)).toBe(2);
  });
});

describe("search", () => {
  it("prefix match, title matches first", () => {
    expect(titles("стриж").slice(0, 3)).toEqual(expect.arrayContaining(["Мужская стрижка", "Стрижка + борода", "Стрижка машинкой"]));
    expect(titles("стриж")).toContain("Тимур"); // via subtitle, ranked lower
    expect(titles("стриж").at(-1)).toBe("Тимур");
  });
  it("all words must match (AND)", () => {
    expect(titles("стрижка борода")[0]).toBe("Стрижка + борода");
    expect(titles("стрижка борода")).not.toContain("Мужская стрижка");
  });
  it("tolerates one typo", () => {
    expect(titles("стришка")).toContain("Мужская стрижка");
    expect(titles("барода")).toContain("Оформление бороды");
  });
  it("wrong layout and translit", () => {
    expect(search(index, "cnhb;rf")[0]?.via).toBe("layout");
    expect(titles("cnhb;rf")).toContain("Мужская стрижка");
    expect(search(index, "boroda")[0]?.via).toBe("translit");
    expect(titles("boroda")).toContain("Оформление бороды");
  });
  it("finds info by hidden keywords", () => {
    expect(titles("отменить")).toEqual(["Отмена и перенос записи"]);
    expect(titles("где")).toEqual(["Адрес и часы работы"]);
  });
  it("empty / no match", () => {
    expect(search(index, "   ")).toEqual([]);
    expect(search(index, "маникюр")).toEqual([]);
  });
  it("highlights the matched prefix in the title", () => {
    const hit = search(index, "муж")[0]!;
    expect(highlightParts(hit.doc.title, hit.highlights)).toEqual([
      { text: "Муж", mark: true },
      { text: "ская стрижка", mark: false },
    ]);
  });
});
