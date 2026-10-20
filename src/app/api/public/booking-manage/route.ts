import { cookies } from "next/headers";
import { cancelBooking, rescheduleBooking } from "@/lib/server/bookings";
import { checkGrant, findBookingIdByToken, grantCookieName } from "@/lib/server/client-access";
import { DomainError } from "@/lib/server/errors";
import { assertSameOrigin, errorResponse, json, readJson } from "@/lib/server/web";
import { manageSchema } from "@/lib/validation";

export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const body = manageSchema.parse(await readJson(req, 2048));
    const found = await findBookingIdByToken(body.token);
    if (!found) throw new DomainError("not_found", "Ссылка недействительна.");
    const grant = (await cookies()).get(grantCookieName(found.tokenHash))?.value;
    if (!checkGrant(grant, found.id)) {
      throw new DomainError("unauthorized", "Подтвердите доступ ещё раз: введите последние 4 цифры телефона.");
    }
    if (body.action === "cancel") {
      const r = await cancelBooking({ bookingId: found.id, actor: { type: "client" } });
      return json({ ok: true, status: r.status, changed: r.changed });
    }
    const r = await rescheduleBooking({
      bookingId: found.id,
      newStartAt: body.startAt,
      newBarberId: body.barberId,
      expectedPriceUzs: body.expectedPriceUzs,
      actor: { type: "client" },
    });
    const { bookingId: _id, ...summary } = r;
    return json({ ok: true, ...summary });
  } catch (err) {
    return errorResponse(err);
  }
}
