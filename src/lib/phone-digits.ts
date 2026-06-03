/** Reserved walk-in / POS orders when no phone is provided (valid Indian mobile pattern). */
export const POS_ANONYMOUS_PHONE_DIGITS = "6000000000";

export function isPosAnonymousPhoneDigits(digits: string): boolean {
  return digits === POS_ANONYMOUS_PHONE_DIGITS;
}

/**
 * Dev-only demo customer login. Lets you sign in and place orders without
 * real OTP delivery (WhatsApp / Firebase / SMS). Disabled in production.
 */
export const DEMO_CUSTOMER_PHONE_DIGITS = "1234567890";
export const DEMO_CUSTOMER_OTP = "1234";

/**
 * Dev mode toggle. Set NEXT_PUBLIC_DEV_MODE=1 in .env to enable the demo
 * customer login. Leave unset/0 to disable it (e.g. in production).
 */
export function isDemoCustomerLoginEnabled(): boolean {
  return process.env.NEXT_PUBLIC_DEV_MODE === "1";
}

export function isDemoCustomerPhone(digits: string): boolean {
  return digits === DEMO_CUSTOMER_PHONE_DIGITS;
}

/**
 * Whether a phone number is allowed to start a login / place an order.
 * Always allows real Indian mobiles; additionally allows the demo number
 * when dev mode is on.
 */
export function isLoginPhoneAllowed(digits: string): boolean {
  if (isIndianMobile10(digits)) return true;
  return isDemoCustomerLoginEnabled() && isDemoCustomerPhone(digits);
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
