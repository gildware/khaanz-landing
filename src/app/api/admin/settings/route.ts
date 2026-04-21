import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { ADMIN_TOKEN_COOKIE, verifyAdminToken } from "@/lib/admin-auth";
import type {
  PaymentMethodConfig,
  RestaurantSettingsPayload,
} from "@/types/restaurant-settings";
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

function parsePaymentMethodsBody(raw: unknown): PaymentMethodConfig[] | null {
  if (!Array.isArray(raw)) return null;
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
  return out.length > 0 ? out : null;
}

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_TOKEN_COOKIE)?.value;
  const session = await verifyAdminToken(token);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const payload = await readRestaurantSettings();
  return NextResponse.json(payload);
}

export async function PUT(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_TOKEN_COOKIE)?.value;
  const session = await verifyAdminToken(token);
  if (!session) {
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
  const displayName =
    typeof o.displayName === "string" ? o.displayName.trim().slice(0, 120) : "";
  const logoUrl =
    typeof o.logoUrl === "string" ? o.logoUrl.trim().slice(0, 500) : "";
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
  const billHeader =
    typeof o.billHeader === "string" ? o.billHeader : "";
  const billFooter =
    typeof o.billFooter === "string" ? o.billFooter : "";
  const pmParsed = parsePaymentMethodsBody(o.paymentMethods);
  if (!pmParsed) {
    return NextResponse.json(
      { error: "Add at least one payment method (id and name)." },
      { status: 400 },
    );
  }

  const normalized: RestaurantSettingsPayload = {
    displayName,
    logoUrl,
    whatsappPhoneE164: phone,
    pickup: {
      start: normalizeHHMM(String(pu?.start ?? "")),
      end: normalizeHHMM(String(pu?.end ?? "")),
    },
    delivery: {
      start: normalizeHHMM(String(dl?.start ?? "")),
      end: normalizeHHMM(String(dl?.end ?? "")),
    },
    billHeader,
    billFooter,
    paymentMethods: pmParsed,
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
