import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { env } from "./env";

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hmac(value: string, purpose: string): string {
  return createHmac("sha256", `${purpose}:${env.appSecret}`).update(value).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

// Unambiguous alphabet (no 0/O, 1/I/L, U) for codes people read aloud.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";

/** Non-sequential public booking code, 8 chars from a CSPRNG. */
export function bookingCode(): string {
  let out = "";
  for (let i = 0; i < 8; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return out;
}

export function formatCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** Accepts "abcd-efgh" / "ABCDEFGH"; returns null if it can't be a code. */
export function parseCode(input: string): string | null {
  const c = input.toUpperCase().replace(/[\s-]/g, "");
  return /^[A-Z0-9]{8}$/.test(c) ? c : null;
}

function key(purpose: string): Buffer {
  return createHash("sha256").update(`${purpose}:${env.appSecret}`).digest();
}

/** AES-256-GCM seal for short-lived secrets kept in the DB (idempotent replies). */
export function seal(plain: string, purpose: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(purpose), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64url")).join(".");
}

export function unseal(sealed: string, purpose: string): string | null {
  try {
    const [iv, tag, enc] = sealed.split(".").map((p) => Buffer.from(p, "base64url"));
    if (!iv || !tag || !enc) return null;
    const d = createDecipheriv("aes-256-gcm", key(purpose), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
