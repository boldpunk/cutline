import { parsePhoneNumberFromString } from "libphonenumber-js/min";

const DEFAULT_COUNTRY = "UZ";

/** Normalizes user input to E.164 ("+998901234567") or returns null if invalid. */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.length < 5 || trimmed.length > 32) return null;
  const parsed = parsePhoneNumberFromString(trimmed, DEFAULT_COUNTRY);
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number;
}

export function phoneLast4(e164: string): string {
  return e164.replace(/\D/g, "").slice(-4);
}

/** Human-readable international format for staff screens. */
export function formatPhone(e164: string): string {
  return parsePhoneNumberFromString(e164)?.formatInternational() ?? e164;
}

/** Keeps only the country code and the last two digits: "+998 ••• ••• •• 67". */
export function maskPhone(e164: string): string {
  const parsed = parsePhoneNumberFromString(e164);
  const cc = parsed ? `+${parsed.countryCallingCode}` : "+";
  return `${cc} ••• ••• •• ${e164.slice(-2)}`;
}
