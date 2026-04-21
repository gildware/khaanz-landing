/** Reserved walk-in / POS orders when no phone is provided (valid Indian mobile pattern). */
export const POS_ANONYMOUS_PHONE_DIGITS = "6000000000";

export function isPosAnonymousPhoneDigits(digits: string): boolean {
  return digits === POS_ANONYMOUS_PHONE_DIGITS;
}

/** Normalize Indian checkout mobile to 10 digits (no country code). */
export function normalizeIndianMobileDigits(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) return d.slice(2);
  if (d.length === 11 && d.startsWith("0")) return d.slice(1);
  return d;
}

export function isIndianMobile10(digits: string): boolean {
  return /^[6-9]\d{9}$/.test(digits);
}

/** WhatsApp Cloud `to` field: digits with country code, no + */
export function toWhatsAppDigitsFromIndian10(digits10: string): string {
  const d = digits10.replace(/\D/g, "");
  const cc = (process.env.CUSTOMER_WHATSAPP_COUNTRY_CODE ?? "91").replace(
    /\D/g,
    "",
  );
  if (d.length === 10) return `${cc}${d}`;
  return d;
}
