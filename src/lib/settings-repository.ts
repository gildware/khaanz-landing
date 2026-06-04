import { Prisma, type PrismaClient } from "@prisma/client";

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
  freeDeliveryUptoKm: 0,
  baseDeliveryCharge: 0,
  deliveryPerKmCharge: 0,
  maxDeliveryDistanceKm: 0,
  restaurantLatitude: null,
  restaurantLongitude: null,
  paymentMethods: DEFAULT_PAYMENT_METHODS,
};

/** Parse latitude/longitude; empty input → null. */
export function normalizeCoordinate(
  input: unknown,
  kind: "lat" | "lng",
): number | null {
  if (input === null || input === undefined || input === "") return null;
  const n =
    typeof input === "number"
      ? input
      : typeof input === "string"
        ? Number(input.trim())
        : NaN;
  if (!Number.isFinite(n)) return null;
  if (kind === "lat" && (n < -90 || n > 90)) return null;
  if (kind === "lng" && (n < -180 || n > 180)) return null;
  return Math.round(n * 1_000_000) / 1_000_000;
}

/** Clamp to a finite, non-negative number (rounded to 2 decimals); fallback 0. */
export function normalizeNonNegativeNumber(input: unknown): number {
  const n =
    typeof input === "number"
      ? input
      : typeof input === "string"
        ? Number(input.trim())
        : NaN;
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

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
  if (
    typeof o.freeDeliveryUptoKm !== "number" ||
    !Number.isFinite(o.freeDeliveryUptoKm) ||
    o.freeDeliveryUptoKm < 0 ||
    typeof o.baseDeliveryCharge !== "number" ||
    !Number.isFinite(o.baseDeliveryCharge) ||
    o.baseDeliveryCharge < 0 ||
    typeof o.deliveryPerKmCharge !== "number" ||
    !Number.isFinite(o.deliveryPerKmCharge) ||
    o.deliveryPerKmCharge < 0 ||
    typeof o.maxDeliveryDistanceKm !== "number" ||
    !Number.isFinite(o.maxDeliveryDistanceKm) ||
    o.maxDeliveryDistanceKm < 0
  ) {
    return false;
  }
  if (!Array.isArray(o.paymentMethods)) return false;
  const pm = parsePaymentMethodsJson(o.paymentMethods);
  if (pm.length === 0) return false;
  const lat = o.restaurantLatitude;
  const lng = o.restaurantLongitude;
  if (lat != null && (typeof lat !== "number" || !Number.isFinite(lat))) {
    return false;
  }
  if (lng != null && (typeof lng !== "number" || !Number.isFinite(lng))) {
    return false;
  }
  if ((lat == null) !== (lng == null)) return false;
  return true;
}

/** Normalize phone to digits only for storage */
export function normalizeWhatsAppPhone(input: string): string {
  return input.replace(/\D/g, "");
}

function isPrismaMissingColumnError(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    return e.code === "P2022";
  }
  const msg = e instanceof Error ? e.message : String(e);
  return (
    msg.includes("restaurant_latitude") ||
    msg.includes("restaurant_longitude") ||
    msg.includes("max_delivery_distance_km") ||
    msg.includes("does not exist")
  );
}

/**
 * Whether `restaurant_latitude` / `restaurant_longitude` exist in the DB the app
 * uses. Probes with Prisma (no cache) so a migrate deploy is recognized without
 * restarting the server.
 */
export async function restaurantCoordsColumnsAvailable(): Promise<boolean> {
  const prisma = getPrisma();
  try {
    await prisma.restaurantSettings.findFirst({
      where: { id: "default" },
      select: {
        restaurantLatitude: true,
        restaurantLongitude: true,
      },
    });
    return true;
  } catch (e) {
    if (isPrismaMissingColumnError(e)) return false;
    throw e;
  }
}

/** @deprecated No-op; kept for callers after removing the old in-memory cache. */
export function invalidateRestaurantCoordsColumnCache(): void {}

type LegacySettingsRow = {
  display_name: string;
  logo_url: string;
  whatsapp_phone_e164: string;
  pickup_start: string;
  pickup_end: string;
  delivery_start: string;
  delivery_end: string;
  bill_header: string;
  bill_footer: string;
  free_delivery_upto_km: number;
  base_delivery_charge: number;
  delivery_per_km_charge: number;
  payment_methods_json: unknown;
};

async function readRestaurantSettingsLegacy(
  prisma: PrismaClient,
): Promise<RestaurantSettingsPayload> {
  const rows = await prisma.$queryRaw<LegacySettingsRow[]>`
    SELECT
      display_name,
      logo_url,
      whatsapp_phone_e164,
      pickup_start,
      pickup_end,
      delivery_start,
      delivery_end,
      bill_header,
      bill_footer,
      free_delivery_upto_km,
      base_delivery_charge,
      delivery_per_km_charge,
      payment_methods_json
    FROM restaurant_settings
    WHERE id = 'default'
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) {
    return DEFAULT_RESTAURANT_SETTINGS;
  }
  return rowToPayload({
    displayName: row.display_name,
    logoUrl: row.logo_url,
    whatsappPhoneE164: row.whatsapp_phone_e164,
    pickupStart: row.pickup_start,
    pickupEnd: row.pickup_end,
    deliveryStart: row.delivery_start,
    deliveryEnd: row.delivery_end,
    billHeader: row.bill_header,
    billFooter: row.bill_footer,
    freeDeliveryUptoKm: row.free_delivery_upto_km,
    baseDeliveryCharge: row.base_delivery_charge,
    deliveryPerKmCharge: row.delivery_per_km_charge,
    maxDeliveryDistanceKm: 0,
    restaurantLatitude: null,
    restaurantLongitude: null,
    paymentMethodsJson: row.payment_methods_json,
  });
}

async function writeRestaurantSettingsLegacy(
  prisma: PrismaClient,
  payload: RestaurantSettingsPayload,
): Promise<void> {
  const whatsapp = normalizeWhatsAppPhone(payload.whatsappPhoneE164);
  const pm = parsePaymentMethodsJson(payload.paymentMethods);
  const displayName = payload.displayName.trim().slice(0, 120);
  const logoUrl = payload.logoUrl.trim().slice(0, 500);
  const freeDeliveryUptoKm = normalizeNonNegativeNumber(payload.freeDeliveryUptoKm);
  const baseDeliveryCharge = normalizeNonNegativeNumber(payload.baseDeliveryCharge);
  const deliveryPerKmCharge = normalizeNonNegativeNumber(
    payload.deliveryPerKmCharge,
  );
  const pickupStart = normalizeHHMM(payload.pickup.start);
  const pickupEnd = normalizeHHMM(payload.pickup.end);
  const deliveryStart = normalizeHHMM(payload.delivery.start);
  const deliveryEnd = normalizeHHMM(payload.delivery.end);
  const billHeader = payload.billHeader.trim();
  const billFooter = payload.billFooter.trim();
  const paymentJson = JSON.stringify(pm);

  await prisma.$executeRaw`
    INSERT INTO restaurant_settings (
      id,
      display_name,
      logo_url,
      whatsapp_phone_e164,
      pickup_start,
      pickup_end,
      delivery_start,
      delivery_end,
      bill_header,
      bill_footer,
      free_delivery_upto_km,
      base_delivery_charge,
      delivery_per_km_charge,
      payment_methods_json
    ) VALUES (
      'default',
      ${displayName},
      ${logoUrl},
      ${whatsapp},
      ${pickupStart},
      ${pickupEnd},
      ${deliveryStart},
      ${deliveryEnd},
      ${billHeader},
      ${billFooter},
      ${freeDeliveryUptoKm},
      ${baseDeliveryCharge},
      ${deliveryPerKmCharge},
      ${paymentJson}::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      logo_url = EXCLUDED.logo_url,
      whatsapp_phone_e164 = EXCLUDED.whatsapp_phone_e164,
      pickup_start = EXCLUDED.pickup_start,
      pickup_end = EXCLUDED.pickup_end,
      delivery_start = EXCLUDED.delivery_start,
      delivery_end = EXCLUDED.delivery_end,
      bill_header = EXCLUDED.bill_header,
      bill_footer = EXCLUDED.bill_footer,
      free_delivery_upto_km = EXCLUDED.free_delivery_upto_km,
      base_delivery_charge = EXCLUDED.base_delivery_charge,
      delivery_per_km_charge = EXCLUDED.delivery_per_km_charge,
      payment_methods_json = EXCLUDED.payment_methods_json
  `;
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
  freeDeliveryUptoKm: number;
  baseDeliveryCharge: number;
  deliveryPerKmCharge: number;
  maxDeliveryDistanceKm: number;
  restaurantLatitude: number | null;
  restaurantLongitude: number | null;
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
    freeDeliveryUptoKm: normalizeNonNegativeNumber(row.freeDeliveryUptoKm),
    baseDeliveryCharge: normalizeNonNegativeNumber(row.baseDeliveryCharge),
    deliveryPerKmCharge: normalizeNonNegativeNumber(row.deliveryPerKmCharge),
    maxDeliveryDistanceKm: normalizeNonNegativeNumber(row.maxDeliveryDistanceKm),
    restaurantLatitude:
      row.restaurantLatitude != null
        ? normalizeCoordinate(row.restaurantLatitude, "lat")
        : null,
    restaurantLongitude:
      row.restaurantLongitude != null
        ? normalizeCoordinate(row.restaurantLongitude, "lng")
        : null,
    paymentMethods: parsePaymentMethodsJson(row.paymentMethodsJson),
  };
}

export async function readRestaurantSettings(): Promise<RestaurantSettingsPayload> {
  const prisma = getPrisma();
  if (!(await restaurantCoordsColumnsAvailable())) {
    return readRestaurantSettingsLegacy(prisma);
  }
  try {
    const row = await prisma.restaurantSettings.findUnique({
      where: { id: "default" },
    });
    if (!row) {
      return DEFAULT_RESTAURANT_SETTINGS;
    }
    return rowToPayload(row);
  } catch (e) {
    if (!isPrismaMissingColumnError(e)) throw e;
    return readRestaurantSettingsLegacy(prisma);
  }
}

export class RestaurantCoordsMigrationRequiredError extends Error {
  constructor() {
    super(
      "Database migration required: run `npx prisma migrate deploy` on the server (adds restaurant_latitude / restaurant_longitude).",
    );
    this.name = "RestaurantCoordsMigrationRequiredError";
  }
}

export async function writeRestaurantSettings(
  payload: RestaurantSettingsPayload,
): Promise<void> {
  const prisma = getPrisma();
  const hasCoordsColumns = await restaurantCoordsColumnsAvailable();
  const wantsCoords =
    payload.restaurantLatitude != null && payload.restaurantLongitude != null;

  if (!hasCoordsColumns) {
    if (wantsCoords) {
      throw new RestaurantCoordsMigrationRequiredError();
    }
    await writeRestaurantSettingsLegacy(prisma, payload);
    return;
  }

  const whatsapp = normalizeWhatsAppPhone(payload.whatsappPhoneE164);
  const pm = parsePaymentMethodsJson(payload.paymentMethods);
  const displayName = payload.displayName.trim().slice(0, 120);
  const logoUrl = payload.logoUrl.trim().slice(0, 500);
  const freeDeliveryUptoKm = normalizeNonNegativeNumber(payload.freeDeliveryUptoKm);
  const baseDeliveryCharge = normalizeNonNegativeNumber(payload.baseDeliveryCharge);
  const deliveryPerKmCharge = normalizeNonNegativeNumber(payload.deliveryPerKmCharge);
  const maxDeliveryDistanceKm = normalizeNonNegativeNumber(
    payload.maxDeliveryDistanceKm,
  );
  const restaurantLatitude = normalizeCoordinate(
    payload.restaurantLatitude,
    "lat",
  );
  const restaurantLongitude = normalizeCoordinate(
    payload.restaurantLongitude,
    "lng",
  );
  try {
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
        freeDeliveryUptoKm,
        baseDeliveryCharge,
        deliveryPerKmCharge,
        maxDeliveryDistanceKm,
        restaurantLatitude,
        restaurantLongitude,
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
        freeDeliveryUptoKm,
        baseDeliveryCharge,
        deliveryPerKmCharge,
        maxDeliveryDistanceKm,
        restaurantLatitude,
        restaurantLongitude,
        paymentMethodsJson: pm as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (e) {
    if (!isPrismaMissingColumnError(e)) throw e;
    if (wantsCoords) {
      throw new RestaurantCoordsMigrationRequiredError();
    }
    await writeRestaurantSettingsLegacy(prisma, payload);
  }
}

/** @deprecated Settings are in the database; use `npm run db:seed` for first-time setup. */
export async function ensureSettingsFile(): Promise<void> {
  // no-op
}
