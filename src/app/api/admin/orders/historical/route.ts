import { randomUUID } from "crypto";

import { cookies } from "next/headers";

import { ADMIN_TOKEN_COOKIE, verifyAdminToken } from "@/lib/admin-auth";
import { formatIstDateInput, parseIstDateInput } from "@/lib/ist-dates";
import { httpResponseForOrderPersistError } from "@/lib/order-persist-errors";
import { persistPosOrderToDatabase } from "@/lib/persist-order-db";
import { parseOrderCreateBody } from "@/lib/parse-order-create-body";
import { readRestaurantSettings } from "@/lib/settings-repository";

export const runtime = "nodejs";

/**
 * Admin catch-up: create a POS-like order dated on a past IST business day
 * so daily report / cash / COGS attribute sales to that day.
 */
export async function POST(req: Request) {
  const cookieStore = await cookies();
  const session = await verifyAdminToken(
    cookieStore.get(ADMIN_TOKEN_COOKIE)?.value,
  );
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const parsed = parseOrderCreateBody(json, { posMode: true });
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  if (parsed.lines.length === 0) {
    return Response.json({ error: "Add at least one item." }, { status: 400 });
  }

  const body =
    json && typeof json === "object" ? (json as Record<string, unknown>) : {};

  const rawSoldAt =
    typeof body.soldAt === "string" ? body.soldAt.trim() : "";
  if (!rawSoldAt) {
    return Response.json(
      { error: "Choose the sale date (soldAt)." },
      { status: 400 },
    );
  }

  let soldAt: Date;
  // Accept ISO datetime or YYYY-MM-DD (IST noon when date-only).
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawSoldAt)) {
    const dayStart = parseIstDateInput(rawSoldAt);
    if (!dayStart) {
      return Response.json({ error: "Invalid soldAt date." }, { status: 400 });
    }
    soldAt = new Date(`${rawSoldAt}T12:00:00+05:30`);
  } else {
    soldAt = new Date(rawSoldAt);
  }
  if (Number.isNaN(soldAt.getTime())) {
    return Response.json({ error: "Invalid soldAt." }, { status: 400 });
  }

  const todayKey = formatIstDateInput(new Date());
  const soldDayKey = formatIstDateInput(soldAt);
  if (soldDayKey >= todayKey) {
    return Response.json(
      {
        error:
          "Sale date must be a previous day. Use POS for today’s sales.",
      },
      { status: 400 },
    );
  }

  const rawPm =
    typeof body.paymentMethodKey === "string"
      ? body.paymentMethodKey.trim().slice(0, 64)
      : "";
  if (!rawPm) {
    return Response.json(
      { error: "Choose a payment method." },
      { status: 400 },
    );
  }

  const settings = await readRestaurantSettings();
  const allowed = new Set(settings.paymentMethods.map((p) => p.id));
  if (!allowed.has(rawPm)) {
    return Response.json(
      { error: "Invalid payment method. Refresh settings and try again." },
      { status: 400 },
    );
  }

  // Catch-up sales skip dine-in table occupancy; treat as pickup.
  const orderParsed =
    parsed.fulfillment === "dine_in"
      ? { ...parsed, fulfillment: "pickup" as const }
      : parsed;

  const orderId = randomUUID();

  let orderRef: string;
  try {
    const out = await persistPosOrderToDatabase(orderId, orderParsed, {
      paymentMethodKey: rawPm,
      dineInTable: "",
      adminUserId: session.userId,
      soldAt,
      historical: true,
    });
    orderRef = out.orderRef;
  } catch (e) {
    console.error("Historical order DB persist failed:", e);
    const { status, error } = httpResponseForOrderPersistError(e);
    return Response.json({ error }, { status });
  }

  return Response.json({
    orderId,
    orderRef,
    soldAt: soldAt.toISOString(),
    messageSentViaWhatsApp: false,
  });
}
