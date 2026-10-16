import { describe, expect, it } from "vitest";
import { addDays, isoWeekday, parseHHMM, startOfWeek, utcToZoned, zonedToUtc, isValidDateString } from "@/lib/domain/time";

describe("time zone conversion", () => {
  it("Asia/Tashkent is UTC+5 without DST", () => {
    expect(new Date(zonedToUtc("2026-10-17", 10 * 60, "Asia/Tashkent")).toISOString()).toBe("2026-10-17T05:00:00.000Z");
    expect(new Date(zonedToUtc("2026-07-01", 0, "Asia/Tashkent")).toISOString()).toBe("2026-06-30T19:00:00.000Z");
    expect(new Date(zonedToUtc("2026-10-17", 1440, "Asia/Tashkent")).toISOString()).toBe("2026-10-17T19:00:00.000Z");
  });

  it("round-trips utc → zoned", () => {
    const t = Date.parse("2026-10-17T05:15:00Z");
    expect(utcToZoned(t, "Asia/Tashkent")).toEqual({ date: "2026-10-17", minutes: 615, weekday: 6 });
    // 21:30Z on Friday is 02:30 Saturday in Tashkent
    expect(utcToZoned(Date.parse("2026-10-16T21:30:00Z"), "Asia/Tashkent").date).toBe("2026-10-17");
  });

  it("handles DST transitions (Europe/Berlin)", () => {
    // Spring forward 2026-03-29 02:00 → 03:00
    expect(new Date(zonedToUtc("2026-03-29", 60, "Europe/Berlin")).toISOString()).toBe("2026-03-29T00:00:00.000Z");
    expect(new Date(zonedToUtc("2026-03-29", 3 * 60, "Europe/Berlin")).toISOString()).toBe("2026-03-29T01:00:00.000Z");
    // 02:30 doesn't exist → resolves forward to 03:30 CEST
    expect(new Date(zonedToUtc("2026-03-29", 150, "Europe/Berlin")).toISOString()).toBe("2026-03-29T01:30:00.000Z");
    // Fall back 2026-10-25: 10:00 local is UTC+1 → 09:00Z
    expect(new Date(zonedToUtc("2026-10-25", 600, "Europe/Berlin")).toISOString()).toBe("2026-10-25T09:00:00.000Z");
    expect(new Date(zonedToUtc("2026-10-24", 600, "Europe/Berlin")).toISOString()).toBe("2026-10-24T08:00:00.000Z");
  });

  it("date arithmetic", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
    expect(isoWeekday("2026-10-19")).toBe(1);
    expect(isoWeekday("2026-10-18")).toBe(7);
    expect(startOfWeek("2026-10-18")).toBe("2026-10-12");
    expect(isValidDateString("2026-02-30")).toBe(false);
    expect(isValidDateString("2026-02-28")).toBe(true);
    expect(parseHHMM("9:05")).toBe(545);
    expect(parseHHMM("24:00")).toBe(1440);
    expect(parseHHMM("24:30")).toBeNull();
  });
});
