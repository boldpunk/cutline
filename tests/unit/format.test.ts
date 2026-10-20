import { describe, expect, it } from "vitest";
import { formatDuration, formatUzs } from "@/lib/domain/money";
import { maskPhone, normalizePhone, phoneLast4 } from "@/lib/domain/phone";

describe("money", () => {
  it("formats integer sums", () => {
    expect(formatUzs(150000)).toBe("150 000 сум");
    expect(formatUzs(1250000)).toBe("1 250 000 сум");
    expect(formatUzs(0)).toBe("0 сум");
    expect(formatDuration(90)).toBe("1 ч 30 мин");
    expect(formatDuration(45)).toBe("45 мин");
  });
});

describe("phone", () => {
  it("normalizes to E.164", () => {
    expect(normalizePhone("+998 90 123-45-67")).toBe("+998901234567");
    expect(normalizePhone("90 123 45 67")).toBe("+998901234567");
    expect(normalizePhone("+7 912 345-67-89")).toBe("+79123456789");
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("hello")).toBeNull();
  });
  it("masks and extracts last 4", () => {
    expect(phoneLast4("+998901234567")).toBe("4567");
    expect(maskPhone("+998901234567")).toBe("+998 ••• ••• •• 67");
  });
});

import { suggestSlug } from "@/lib/slug";
describe("slug suggestion", () => {
  it("transliterates and cleans names", () => {
    expect(suggestSlug("Барбершоп Морки")).toBe("barbershop-morki");
    expect(suggestSlug("Morki Barber!")).toBe("morki-barber");
    expect(suggestSlug("  Щёлк & Ко  ")).toBe("shchyolk-ko");
    expect(suggestSlug("O‘zbek sartaroshxona")).toBe("o-zbek-sartaroshxona");
  });
});
