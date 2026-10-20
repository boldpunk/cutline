import { z } from "zod";

export const uuid = z.string().uuid("Некорректный идентификатор");
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Некорректная дата");
export const isoInstant = z.string().datetime({ offset: true, message: "Некорректное время" });

export const clientName = z
  .string()
  .trim()
  .min(1, "Укажите имя")
  .max(100, "Не длиннее 100 символов");

export const phoneInput = z.string().trim().min(5, "Укажите телефон").max(32, "Слишком длинный номер");
export const comment = z.string().trim().max(500, "Не длиннее 500 символов");
export const optionalEmail = z
  .string()
  .trim()
  .max(200)
  .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Некорректный e-mail");

export const createBookingSchema = z.object({
  serviceId: uuid,
  barberId: z.union([uuid, z.literal("any")]),
  assignedBarberId: uuid.optional(),
  startAt: isoInstant,
  expectedPriceUzs: z.number().int().min(0).max(100_000_000),
  name: clientName,
  phone: phoneInput,
  email: optionalEmail.optional(),
  comment: comment.optional(),
  consent: z.literal(true, { message: "Нужно согласие на обработку данных" }),
  consentVersion: z.string().min(1).max(40),
  idempotencyKey: z.string().uuid(),
});
export type CreateBookingBody = z.infer<typeof createBookingSchema>;

export const accessSchema = z.object({
  token: z.string().min(40).max(64),
  last4: z.string().regex(/^\d{4}$/, "Введите 4 цифры"),
});

export const manageSchema = z.discriminatedUnion("action", [
  z.object({ token: z.string().min(40).max(64), action: z.literal("cancel") }),
  z.object({
    token: z.string().min(40).max(64),
    action: z.literal("reschedule"),
    startAt: isoInstant,
    barberId: uuid.optional(),
    expectedPriceUzs: z.number().int().min(0).max(100_000_000).optional(),
  }),
]);
