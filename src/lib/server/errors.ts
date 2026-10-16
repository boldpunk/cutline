export type ErrorCode =
  | "validation"
  | "not_found"
  | "forbidden"
  | "unauthorized"
  | "slot_taken"
  | "slot_unavailable"
  | "price_changed"
  | "service_unavailable"
  | "barber_unavailable"
  | "too_late"
  | "not_modifiable"
  | "idempotency_mismatch"
  | "rate_limited"
  | "conflict"
  | "schedule_conflict"
  | "locked";

const STATUS: Record<ErrorCode, number> = {
  validation: 400,
  not_found: 404,
  forbidden: 403,
  unauthorized: 401,
  slot_taken: 409,
  slot_unavailable: 409,
  price_changed: 409,
  service_unavailable: 409,
  barber_unavailable: 409,
  too_late: 409,
  not_modifiable: 409,
  idempotency_mismatch: 422,
  rate_limited: 429,
  conflict: 409,
  schedule_conflict: 409,
  locked: 423,
};

/** Expected business error with a user-facing Russian message. */
export class DomainError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.status = STATUS[code];
  }
}

export function isPgError(err: unknown, code: string): boolean {
  // postgres.js puts SQLSTATE on `code`; drizzle may wrap it in `cause`.
  let e: unknown = err;
  for (let i = 0; i < 3 && e && typeof e === "object"; i++) {
    if ((e as { code?: string }).code === code) return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

export const PG = {
  EXCLUSION_VIOLATION: "23P01",
  UNIQUE_VIOLATION: "23505",
  DEADLOCK: "40P01",
  SERIALIZATION: "40001",
} as const;
