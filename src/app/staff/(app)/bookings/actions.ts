"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { normalizePhone } from "@/lib/domain/phone";
import { runAction, type ActionResult } from "@/lib/server/action-result";
import { cancelBooking, createBooking, rescheduleBooking, setOutcome } from "@/lib/server/bookings";
import { env } from "@/lib/server/env";
import { DomainError } from "@/lib/server/errors";
import { getSettings } from "@/lib/server/settings";
import { actorOf, requireAdmin, requireStaff } from "@/lib/server/staff-auth";
import { clientName, comment, isoInstant, uuid } from "@/lib/validation";

const reason = z.string().trim().min(3, "Укажите причину (не короче 3 символов)").max(300);

export async function cancelAction(bookingId: string, why: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireAdmin();
    const r = await cancelBooking({ bookingId: uuid.parse(bookingId), actor: actorOf(user), reason: reason.parse(why) });
    revalidatePath("/staff", "layout");
    return { ok: true, message: r.changed ? "Запись отменена." : "Запись уже была отменена." };
  });
}

export async function rescheduleAction(input: {
  bookingId: string;
  startAt: string;
  barberId?: string;
  expectedPriceUzs?: number;
  reason: string;
}): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireAdmin();
    const r = await rescheduleBooking({
      bookingId: uuid.parse(input.bookingId),
      newStartAt: isoInstant.parse(input.startAt),
      newBarberId: input.barberId ? uuid.parse(input.barberId) : undefined,
      expectedPriceUzs: input.expectedPriceUzs,
      actor: actorOf(user),
      reason: reason.parse(input.reason),
    });
    revalidatePath("/staff", "layout");
    return { ok: true, message: r.changed ? "Запись перенесена." : "Время не изменилось." };
  });
}

export async function outcomeAction(bookingId: string, outcome: "completed" | "no_show"): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireStaff();
    const r = await setOutcome({ bookingId: uuid.parse(bookingId), outcome: z.enum(["completed", "no_show"]).parse(outcome), actor: actorOf(user) });
    revalidatePath("/staff", "layout");
    return { ok: true, message: r.changed ? "Отмечено." : "Без изменений." };
  });
}

const staffCreate = z.object({
  serviceId: uuid,
  barberId: uuid,
  startAt: isoInstant,
  expectedPriceUzs: z.number().int().min(0),
  name: clientName,
  phone: z.string().trim().min(5).max(32),
  comment: comment.optional(),
  consent: z.literal(true, { message: "Подтвердите, что клиент согласен на обработку данных" }),
  idempotencyKey: z.string().uuid(),
});

export async function createStaffBookingAction(
  input: z.input<typeof staffCreate>,
): Promise<ActionResult<{ code: string; manageUrl: string; bookingId: string }>> {
  return runAction(async () => {
    const user = await requireAdmin();
    const body = staffCreate.parse(input);
    const phone = normalizePhone(body.phone);
    if (!phone) throw new DomainError("validation", "Проверьте номер телефона.", { fields: { phone: "Некорректный номер" } });
    const settings = await getSettings(getDb());
    const r = await createBooking({
      serviceId: body.serviceId,
      barberId: body.barberId,
      startAt: body.startAt,
      expectedPriceUzs: body.expectedPriceUzs,
      clientName: body.name,
      phoneE164: phone,
      comment: body.comment || null,
      consentVersion: settings.consentVersion,
      idempotencyKey: body.idempotencyKey,
      source: "staff",
      actorUserId: user.id,
    });
    revalidatePath("/staff", "layout");
    return { ok: true, data: { code: r.code, manageUrl: `${env.appUrl}/booking/${r.token}`, bookingId: r.bookingId } };
  });
}
