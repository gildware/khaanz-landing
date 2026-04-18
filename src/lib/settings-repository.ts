import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";

import type { RestaurantSettingsPayload } from "@/types/restaurant-settings";

const FILE = join(process.cwd(), "data", "settings.json");

export const DEFAULT_RESTAURANT_SETTINGS: RestaurantSettingsPayload = {
  whatsappPhoneE164: "919876543210",
  pickup: { start: "11:00", end: "23:00" },
  delivery: { start: "11:00", end: "23:00" },
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

export function isRestaurantSettingsPayload(
  x: unknown,
): x is RestaurantSettingsPayload {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.whatsappPhoneE164 === "string" &&
    /^\d{10,15}$/.test(o.whatsappPhoneE164.replace(/\D/g, "")) &&
    isRange(o.pickup) &&
    isRange(o.delivery)
  );
}

/** Normalize phone to digits only for storage */
export function normalizeWhatsAppPhone(input: string): string {
  return input.replace(/\D/g, "");
}

export async function readRestaurantSettings(): Promise<RestaurantSettingsPayload> {
  try {
    const raw = await readFile(FILE, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (!isRestaurantSettingsPayload(parsed)) {
      return DEFAULT_RESTAURANT_SETTINGS;
    }
    return {
      ...parsed,
      whatsappPhoneE164: normalizeWhatsAppPhone(parsed.whatsappPhoneE164),
      pickup: {
        start: normalizeHHMM(parsed.pickup.start),
        end: normalizeHHMM(parsed.pickup.end),
      },
      delivery: {
        start: normalizeHHMM(parsed.delivery.start),
        end: normalizeHHMM(parsed.delivery.end),
      },
    };
  } catch {
    return DEFAULT_RESTAURANT_SETTINGS;
  }
}

export async function writeRestaurantSettings(
  payload: RestaurantSettingsPayload,
): Promise<void> {
  await mkdir(join(process.cwd(), "data"), { recursive: true });
  const text = `${JSON.stringify(payload, null, 2)}\n`;
  await writeFile(FILE, text, "utf-8");
}

export async function ensureSettingsFile(): Promise<void> {
  try {
    await readFile(FILE, "utf-8");
  } catch {
    await writeRestaurantSettings(DEFAULT_RESTAURANT_SETTINGS);
  }
}
