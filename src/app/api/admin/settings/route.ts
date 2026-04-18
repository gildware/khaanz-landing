import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { ADMIN_TOKEN_COOKIE, verifyAdminToken } from "@/lib/admin-auth";
import type { RestaurantSettingsPayload } from "@/types/restaurant-settings";
import {
  isRestaurantSettingsPayload,
  normalizeHHMM,
  normalizeWhatsAppPhone,
  readRestaurantSettings,
  writeRestaurantSettings,
} from "@/lib/settings-repository";

function minutesFromHHMM(s: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function isValidSameDayRange(start: string, end: string): boolean {
  const a = minutesFromHHMM(start);
  const b = minutesFromHHMM(end);
  if (a === null || b === null) return false;
  return b > a;
}

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_TOKEN_COOKIE)?.value;
  if (!(await verifyAdminToken(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const payload = await readRestaurantSettings();
  return NextResponse.json(payload);
}

export async function PUT(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_TOKEN_COOKIE)?.value;
  if (!(await verifyAdminToken(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const o = body as Record<string, unknown>;
  const phone = normalizeWhatsAppPhone(
    typeof o.whatsappPhoneE164 === "string" ? o.whatsappPhoneE164 : "",
  );
  const pu =
    o.pickup && typeof o.pickup === "object"
      ? (o.pickup as { start?: string; end?: string })
      : null;
  const dl =
    o.delivery && typeof o.delivery === "object"
      ? (o.delivery as { start?: string; end?: string })
      : null;
  const normalized: RestaurantSettingsPayload = {
    whatsappPhoneE164: phone,
    pickup: {
      start: normalizeHHMM(String(pu?.start ?? "")),
      end: normalizeHHMM(String(pu?.end ?? "")),
    },
    delivery: {
      start: normalizeHHMM(String(dl?.start ?? "")),
      end: normalizeHHMM(String(dl?.end ?? "")),
    },
  };

  if (!/^\d{10,15}$/.test(normalized.whatsappPhoneE164)) {
    return NextResponse.json(
      { error: "WhatsApp number must be 10–15 digits (include country code, no +)." },
      { status: 400 },
    );
  }
  if (!isValidSameDayRange(normalized.pickup.start, normalized.pickup.end)) {
    return NextResponse.json(
      { error: "Pickup hours: end must be after start (same day, 24h format)." },
      { status: 400 },
    );
  }
  if (!isValidSameDayRange(normalized.delivery.start, normalized.delivery.end)) {
    return NextResponse.json(
      { error: "Delivery hours: end must be after start (same day, 24h format)." },
      { status: 400 },
    );
  }

  if (!isRestaurantSettingsPayload(normalized)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  await writeRestaurantSettings(normalized);
  return NextResponse.json({ ok: true });
}
