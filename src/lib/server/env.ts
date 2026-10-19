// Server configuration read from the environment.

function bool(v: string | undefined, fallback: boolean): boolean {
  if (v === undefined || v === "") return fallback;
  return v === "1" || v.toLowerCase() === "true";
}

export const env = {
  get appUrl(): string {
    // Render sets RENDER_EXTERNAL_URL, so a one-click deploy needs no APP_URL.
    return (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:3000").replace(/\/+$/, "");
  },
  get appSecret(): string {
    const s = process.env.APP_SECRET ?? "";
    if (s.length < 32) throw new Error("APP_SECRET must be at least 32 characters");
    if (s.startsWith("change-me")) throw new Error("APP_SECRET is still the placeholder from .env.example — generate a random one");
    return s;
  },
  get cookieSecure(): boolean {
    return bool(process.env.COOKIE_SECURE, process.env.NODE_ENV === "production");
  },
  get trustProxy(): boolean {
    return bool(process.env.TRUST_PROXY, false);
  },
  get smtp() {
    const host = process.env.SMTP_HOST?.trim();
    if (!host) return null;
    return {
      host,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: bool(process.env.SMTP_SECURE, false),
      user: process.env.SMTP_USER || undefined,
      password: process.env.SMTP_PASSWORD || undefined,
      from: process.env.SMTP_FROM || "CUTLINE <no-reply@localhost>",
    };
  },
  /** E-mail is offered to clients only when a provider is configured. */
  get emailEnabled(): boolean {
    return this.smtp !== null;
  },
  get reminderHoursBefore(): number {
    const n = Number(process.env.REMINDER_HOURS_BEFORE ?? 24);
    return Number.isFinite(n) && n > 0 ? n : 0;
  },
};
