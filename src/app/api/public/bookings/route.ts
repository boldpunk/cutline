import { normalizePhone } from "@/lib/domain/phone";
import { createBooking } from "@/lib/server/bookings";
import { env } from "@/lib/server/env";
import { DomainError } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/rate-limit";
import { salonForService } from "@/lib/server/public-data";
import { assertSameOrigin, clientIp, errorResponse, json, readJson } from "@/lib/server/web";
import { createBookingSchema } from "@/lib/validation";

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const body = createBookingSchema.parse(await readJson(req));
    const phone = normalizePhone(body.phone);
    if (!phone) {
      throw new DomainError("validation", "Проверьте номер телефона.", {
        fields: { phone: "Укажите номер в международном формате, например +998 90 123 45 67" },
      });
    }
    const found = await salonForService(body.serviceId);
    if (!found) throw new DomainError("service_unavailable", "Эта услуга сейчас недоступна для записи.");
    const settings = found.salon;
    if (body.consentVersion !== settings.consentVersion) {
      throw new DomainError("validation", "Текст согласия обновился. Обновите страницу и подтвердите согласие ещё раз.");
    }
    const ip = clientIp(req.headers);
    if (ip) {
      const r = await rateLimit(`create:ip:${ip}`, 20, 3600);
      if (!r.ok) throw new DomainError("rate_limited", "Слишком много записей с этого устройства. Попробуйте позже.", { retryAfterSec: r.retryAfterSec });
    }
    const perPhone = await rateLimit(`create:phone:${phone}`, 6, 86_400);
    if (!perPhone.ok) {
      throw new DomainError("rate_limited", "На этот номер уже сделано много записей за сутки. Позвоните в салон.", {
        retryAfterSec: perPhone.retryAfterSec,
      });
    }

    const result = await createBooking({
      serviceId: body.serviceId,
      barberId: body.barberId,
      assignedBarberId: body.assignedBarberId,
      startAt: body.startAt,
      expectedPriceUzs: body.expectedPriceUzs,
      clientName: body.name,
      phoneE164: phone,
      email: env.emailEnabled && body.email ? body.email : null,
      comment: body.comment || null,
      consentVersion: settings.consentVersion,
      idempotencyKey: body.idempotencyKey,
      source: "online",
    });
    const { token, replayed, bookingId: _id, ...summary } = result;
    return json(
      { ...summary, token, manageUrl: `${env.appUrl}/booking/${token}`, replayed },
      { status: replayed ? 200 : 201 },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
