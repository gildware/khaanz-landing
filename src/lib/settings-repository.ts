import { Prisma } from "@prisma/client";

import { getPrisma } from "@/lib/prisma";
import type {
  PaymentMethodConfig,
  RestaurantSettingsPayload,
} from "@/types/restaurant-settings";

export const DEFAULT_PAYMENT_METHODS: PaymentMethodConfig[] = [
  { id: "cash", name: "Cash" },
  { id: "upi", name: "UPI" },
  { id: "mpay", name: "Mpay" },
];

export const DEFAULT_RESTAURANT_SETTINGS: RestaurantSettingsPayload = {
  displayName: "",
  logoUrl: "",
  whatsappPhoneE164: "919876543210",
  pickup: { start: "11:00", end: "23:00" },
  delivery: { start: "11:00", end: "23:00" },
  billHeader: "",
  billFooter: "",
  paymentMethods: DEFAULT_PAYMENT_METHODS,
};

/** Normalize browser time values to HH:mm */
export function normalizeHHMM(input: string): string {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?/.exec(input.trim());
  if (!m) return input.trim();
  const h = Math.min(23, Math.max(0, Number(m[1])));
  const min = Math.min(59, Math.max(0, Number(m[2])));
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function isTimeString(s: unknown): s is string {
  return typeof s === "string" && /^\d{2}:\d{2}$/.test(normalizeHHMM(s));
}

function isRange(x: unknown): x is RestaurantSettingsPayload["pickup"] {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return isTimeString(o.start) && isTimeString(o.end);
}

function parsePaymentMethodsJson(raw: unknown): PaymentMethodConfig[] {
  if (!Array.isArray(raw) || raw.length === 0) return [...DEFAULT_PAYMENT_METHODS];
  const out: PaymentMethodConfig[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const id =
      typeof o.id === "string" ? o.id.trim().toLowerCase().slice(0, 48) : "";
    const name = typeof o.name === "string" ? o.name.trim().slice(0, 80) : "";
    if (!id || !name) continue;
    if (!/^[a-z0-9_-]+$/.test(id)) continue;
    if (out.some((x) => x.id === id)) continue;
    out.push({ id, name });
  }
  return out.length > 0 ? out : [...DEFAULT_PAYMENT_METHODS];
}

export function isRestaurantSettingsPayload(
  x: unknown,
): x is RestaurantSettingsPayload {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (typeof o.displayName !== "string" || typeof o.logoUrl !== "string") {
    return false;
  }
  if (
    typeof o.whatsappPhoneE164 !== "string" ||
    !/^\d{10,15}$/.test(o.whatsappPhoneE164.replace(/\D/g, ""))
  ) {
    return false;
  }
  if (!isRange(o.pickup) || !isRange(o.delivery)) return false;
  if (typeof o.billHeader !== "string" || typeof o.billFooter !== "string") {
    return false;
  }
  if (!Array.isArray(o.paymentMethods)) return false;
  const pm = parsePaymentMethodsJson(o.paymentMethods);
  if (pm.length === 0) return false;
  return true;
}

/** Normalize phone to digits only for storage */
export function normalizeWhatsAppPhone(input: string): string {
  return input.replace(/\D/g, "");
}

function rowToPayload(row: {
  displayName: string;
  logoUrl: string;
  whatsappPhoneE164: string;
  pickupStart: string;
  pickupEnd: string;
  deliveryStart: string;
  deliveryEnd: string;
  billHeader: string;
  billFooter: string;
  paymentMethodsJson: unknown;
}): RestaurantSettingsPayload {
  return {
    displayName: (row.displayName ?? "").trim(),
    logoUrl: (row.logoUrl ?? "").trim(),
    whatsappPhoneE164: normalizeWhatsAppPhone(row.whatsappPhoneE164),
    pickup: { start: normalizeHHMM(row.pickupStart), end: normalizeHHMM(row.pickupEnd) },
    delivery: {
      start: normalizeHHMM(row.deliveryStart),
      end: normalizeHHMM(row.deliveryEnd),
    },
    billHeader: row.billHeader ?? "",
    billFooter: row.billFooter ?? "",
    paymentMethods: parsePaymentMethodsJson(row.paymentMethodsJson),
  };
}

export async function readRestaurantSettings(): Promise<RestaurantSettingsPayload> {
  const prisma = getPrisma();
  const row = await prisma.restaurantSettings.findUnique({
    where: { id: "default" },
  });
  if (!row) {
    return DEFAULT_RESTAURANT_SETTINGS;
  }
  return rowToPayload(row);
}

export async function writeRestaurantSettings(
  payload: RestaurantSettingsPayload,
): Promise<void> {
  const prisma = getPrisma();
  const whatsapp = normalizeWhatsAppPhone(payload.whatsappPhoneE164);
  const pm = parsePaymentMethodsJson(payload.paymentMethods);
  const displayName = payload.displayName.trim().slice(0, 120);
  const logoUrl = payload.logoUrl.trim().slice(0, 500);
  await prisma.restaurantSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      displayName,
      logoUrl,
      whatsappPhoneE164: whatsapp,
      pickupStart: normalizeHHMM(payload.pickup.start),
      pickupEnd: normalizeHHMM(payload.pickup.end),
      deliveryStart: normalizeHHMM(payload.delivery.start),
      deliveryEnd: normalizeHHMM(payload.delivery.end),
      billHeader: payload.billHeader.trim(),
      billFooter: payload.billFooter.trim(),
      paymentMethodsJson: pm as unknown as Prisma.InputJsonValue,
    },
    update: {
      displayName,
      logoUrl,
      whatsappPhoneE164: whatsapp,
      pickupStart: normalizeHHMM(payload.pickup.start),
      pickupEnd: normalizeHHMM(payload.pickup.end),
      deliveryStart: normalizeHHMM(payload.delivery.start),
      deliveryEnd: normalizeHHMM(payload.delivery.end),
      billHeader: payload.billHeader.trim(),
      billFooter: payload.billFooter.trim(),
      paymentMethodsJson: pm as unknown as Prisma.InputJsonValue,
    },
  });
}

/** @deprecated Settings are in the database; use `npm run db:seed` for first-time setup. */
export async function ensureSettingsFile(): Promise<void> {
  // no-op
}
