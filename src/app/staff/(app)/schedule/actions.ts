"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { isValidDateString, parseHHMM, zonedToUtc } from "@/lib/domain/time";
import type { MinuteRange } from "@/lib/domain/slots";
import { runAction, type ActionResult } from "@/lib/server/action-result";
import { DomainError } from "@/lib/server/errors";
import { createTimeBlock, deleteTimeBlock, removeDateException, replaceWeeklyHours, setDateException } from "@/lib/server/schedule-admin";
import { getSettings } from "@/lib/server/settings";
import { actorOf, requireStaff } from "@/lib/server/staff-auth";
import { uuid } from "@/lib/validation";

const hhmm = z.string().refine((v) => parseHHMM(v) !== null, "Время в формате ЧЧ:ММ");
const date = z.string().refine(isValidDateString, "Некорректная дата");

const blockSchema = z.object({
  barberId: uuid,
  kind: z.enum(["break", "vacation", "other"]),
  startDate: date,
  startTime: hhmm,
  endDate: date,
  endTime: hhmm,
  note: z.string().trim().max(200).optional(),
});

export async function createBlockAction(input: z.input<typeof blockSchema>): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireStaff();
    const b = blockSchema.parse(input);
    const tz = (await getSettings(getDb())).timezone;
    const startAt = new Date(zonedToUtc(b.startDate, parseHHMM(b.startTime)!, tz));
    const endAt = new Date(zonedToUtc(b.endDate, parseHHMM(b.endTime)!, tz));
    await createTimeBlock({ actor: actorOf(user), barberId: b.barberId, kind: b.kind, startAt, endAt, note: b.note || null });
    revalidatePath("/staff", "layout");
    return { ok: true, message: "Время заблокировано." };
  });
}

export async function deleteBlockAction(id: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireStaff();
    await deleteTimeBlock({ actor: actorOf(user), blockId: uuid.parse(id) });
    revalidatePath("/staff", "layout");
    return { ok: true, message: "Блокировка удалена." };
  });
}

const rangesSchema = z.array(z.object({ start: hhmm, end: hhmm })).max(6);

function toRanges(list: z.infer<typeof rangesSchema>): MinuteRange[] {
  return list.map((r) => {
    const startMin = parseHHMM(r.start)!;
    const endMin = parseHHMM(r.end)!;
    if (startMin >= endMin) throw new DomainError("validation", `Интервал ${r.start}–${r.end}: окончание должно быть позже начала.`);
    return { startMin, endMin };
  });
}

export async function saveWeeklyHoursAction(barberId: string | null, days: Record<string, { start: string; end: string }[]>): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireStaff();
    const hours: Record<number, MinuteRange[]> = {};
    for (const [d, list] of Object.entries(days)) hours[Number(d)] = toRanges(rangesSchema.parse(list));
    await replaceWeeklyHours({ actor: actorOf(user), barberId: barberId ? uuid.parse(barberId) : null, hours });
    revalidatePath("/", "layout");
    return { ok: true, message: "График сохранён." };
  });
}

const exceptionSchema = z.object({
  barberId: uuid.nullable(),
  date,
  kind: z.enum(["closed", "hours"]),
  ranges: rangesSchema.optional(),
  note: z.string().trim().max(200).optional(),
});

export async function setExceptionAction(input: z.input<typeof exceptionSchema>): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireStaff();
    const e = exceptionSchema.parse(input);
    await setDateException({
      actor: actorOf(user),
      barberId: e.barberId,
      date: e.date,
      kind: e.kind,
      ranges: e.kind === "hours" ? toRanges(e.ranges ?? []) : undefined,
      note: e.note || null,
    });
    revalidatePath("/", "layout");
    return { ok: true, message: e.kind === "closed" ? "День закрыт." : "Часы на дату сохранены." };
  });
}

export async function removeExceptionAction(barberId: string | null, d: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireStaff();
    await removeDateException({ actor: actorOf(user), barberId: barberId ? uuid.parse(barberId) : null, date: date.parse(d) });
    revalidatePath("/", "layout");
    return { ok: true, message: "Исключение удалено." };
  });
}
