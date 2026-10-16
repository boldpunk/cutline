import { describe, expect, it } from "vitest";
import { computeSlots, fitsSchedule, workingWindows, type WeeklyHours } from "@/lib/domain/slots";
import { zonedToUtc } from "@/lib/domain/time";
import { intersect, subtract, normalize } from "@/lib/domain/intervals";

const TZ = "Asia/Tashkent";
const DATE = "2026-10-20"; // Tuesday
const at = (hhmm: string, date = DATE) => {
  const [h, m] = hhmm.split(":").map(Number);
  return zonedToUtc(date, h! * 60 + m!, TZ);
};
const hhmm = (t: number) =>
  new Date(t + 5 * 3600_000).toISOString().slice(11, 16);

const allWeek = (startMin: number, endMin: number): WeeklyHours =>
  Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((d) => [d, [{ startMin, endMin }]]));

function slots(opts: Partial<Parameters<typeof computeSlots>[0]> & { windows: Parameters<typeof computeSlots>[0]["windows"] }) {
  return computeSlots({
    busy: [],
    durationMin: 60,
    bufferBeforeMin: 0,
    bufferAfterMin: 0,
    stepMin: 15,
    gridOrigin: at("00:00"),
    notBefore: 0,
    ...opts,
  }).map(hhmm);
}

describe("intervals", () => {
  it("normalize / intersect / subtract", () => {
    expect(normalize([{ start: 5, end: 7 }, { start: 1, end: 3 }, { start: 3, end: 4 }])).toEqual([
      { start: 1, end: 4 },
      { start: 5, end: 7 },
    ]);
    expect(intersect([{ start: 0, end: 10 }], [{ start: 5, end: 15 }])).toEqual([{ start: 5, end: 10 }]);
    expect(subtract([{ start: 0, end: 10 }], [{ start: 3, end: 5 }])).toEqual([
      { start: 0, end: 3 },
      { start: 5, end: 10 },
    ]);
  });
});

describe("workingWindows", () => {
  it("intersects salon and barber hours", () => {
    const w = workingWindows({
      date: DATE,
      tz: TZ,
      salonWeekly: allWeek(9 * 60, 21 * 60),
      barberWeekly: { 2: [{ startMin: 8 * 60, endMin: 13 * 60 }, { startMin: 14 * 60, endMin: 22 * 60 }] },
    });
    expect(w.map((i) => [hhmm(i.start), hhmm(i.end)])).toEqual([
      ["09:00", "13:00"],
      ["14:00", "21:00"],
    ]);
  });

  it("salon closure and barber day off produce no windows", () => {
    expect(
      workingWindows({ date: DATE, tz: TZ, salonWeekly: allWeek(540, 1260), salonOverride: { kind: "closed" }, barberWeekly: allWeek(540, 1260) }),
    ).toEqual([]);
    expect(
      workingWindows({ date: DATE, tz: TZ, salonWeekly: allWeek(540, 1260), barberWeekly: { 1: [{ startMin: 540, endMin: 1260 }] } }),
    ).toEqual([]);
  });

  it("date override replaces weekly hours", () => {
    const w = workingWindows({
      date: DATE,
      tz: TZ,
      salonWeekly: allWeek(540, 1260),
      barberWeekly: allWeek(540, 1260),
      barberOverride: { kind: "hours", ranges: [{ startMin: 720, endMin: 900 }] },
    });
    expect(w.map((i) => [hhmm(i.start), hhmm(i.end)])).toEqual([["12:00", "15:00"]]);
  });
});

describe("computeSlots", () => {
  const day = [{ start: at("10:00"), end: at("13:00") }];

  it("steps by 15 minutes and the last slot ends exactly at closing", () => {
    const s = slots({ windows: day });
    expect(s[0]).toBe("10:00");
    expect(s[1]).toBe("10:15");
    expect(s.at(-1)).toBe("12:00"); // 12:00 + 60 = 13:00 closing
    expect(s).not.toContain("12:15");
  });

  it("A05: service with buffer is offered only if the whole interval fits before closing", () => {
    const s = slots({ windows: day, bufferAfterMin: 15 });
    expect(s.at(-1)).toBe("11:45"); // 11:45 + 60 + 15 = 13:00
    const sb = slots({ windows: day, bufferBeforeMin: 10, bufferAfterMin: 5 });
    expect(sb[0]).toBe("10:15"); // 10:00 would need prep from 09:50
    expect(sb.at(-1)).toBe("11:45"); // 11:45 + 65 = 12:50; 12:00 + 65 = 13:05 > 13:00
  });

  it("A04: breaks, vacations and other bookings are excluded; [start,end) allows back-to-back", () => {
    const busy = [{ start: at("11:00"), end: at("11:30") }];
    const s = slots({ windows: day, busy });
    expect(s).toContain("10:00"); // 10:00–11:00 ends exactly when busy starts
    expect(s).not.toContain("10:15");
    expect(s).not.toContain("11:00");
    expect(s).toContain("11:30"); // starts exactly at busy end
    expect(slots({ windows: day, busy: [{ start: at("00:00"), end: at("23:59") }] })).toEqual([]);
  });

  it("buffer of an existing booking is respected via its occupied interval", () => {
    // Existing 10:00–11:00 with 15 min cleanup → occupied until 11:15
    const s = slots({ windows: day, busy: [{ start: at("10:00"), end: at("11:15") }] });
    expect(s[0]).toBe("11:15");
  });

  it("respects minimum lead time", () => {
    const s = slots({ windows: day, notBefore: at("10:20") });
    expect(s[0]).toBe("10:30");
  });

  it("aligns to the local-midnight grid even if the window starts off-grid", () => {
    const s = slots({ windows: [{ start: at("10:05"), end: at("12:00") }] });
    expect(s[0]).toBe("10:15");
  });

  it("fitsSchedule mirrors computeSlots without the grid", () => {
    const req = { windows: day, busy: [{ start: at("11:00"), end: at("11:30") }], durationMin: 60, bufferBeforeMin: 0, bufferAfterMin: 0 };
    expect(fitsSchedule(req, at("10:00"))).toBe(true);
    expect(fitsSchedule(req, at("10:10"))).toBe(false);
    expect(fitsSchedule(req, at("12:00"))).toBe(true);
    expect(fitsSchedule(req, at("12:05"))).toBe(false);
  });

  it("works across a DST transition day", () => {
    const tz = "Europe/Berlin";
    const date = "2026-03-29";
    const windows = workingWindows({ date, tz, salonWeekly: allWeek(60, 240), barberWeekly: allWeek(60, 240) });
    // 01:00 CET → 04:00 CEST is only 2 real hours.
    expect(windows).toHaveLength(1);
    expect((windows[0]!.end - windows[0]!.start) / 3600_000).toBe(2);
    const s = computeSlots({
      windows, busy: [], durationMin: 60, bufferBeforeMin: 0, bufferAfterMin: 0, stepMin: 30,
      gridOrigin: zonedToUtc(date, 0, tz), notBefore: 0,
    });
    expect(s.map((t) => new Date(t).toISOString().slice(11, 16))).toEqual(["00:00", "00:30", "01:00"]);
  });
});
