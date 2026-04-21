import { randomUUID } from "crypto";

import { cookies } from "next/headers";

import { ADMIN_TOKEN_COOKIE, verifyAdminToken } from "@/lib/admin-auth";
import { readFloorPlan } from "@/lib/floor-plan";
import { persistPosOrderToDatabase } from "@/lib/persist-order-db";
import { parseOrderCreateBody } from "@/lib/parse-order-create-body";
import { readRestaurantSettings } from "@/lib/settings-repository";

export const runtime = "nodejs";

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

  const body = json && typeof json === "object" ? (json as Record<string, unknown>) : {};
  const rawPm =
    typeof body.paymentMethodKey === "string" ? body.paymentMethodKey.trim().slice(0, 64) : "";
  const settings = await readRestaurantSettings();
  const floorPlan = await readFloorPlan();
  const allowed = new Set(settings.paymentMethods.map((p) => p.id));
  let paymentMethodKey = "";
  if (rawPm) {
    if (!allowed.has(rawPm)) {
      return Response.json(
        { error: "Invalid payment method. Refresh settings and try again." },
        { status: 400 },
      );
    }
    paymentMethodKey = rawPm;
  }

  let dineInTable = "";
  if (parsed.fulfillment === "dine_in" && floorPlan.tables.length > 0) {
    const tableId =
      typeof body.tableId === "string" ? body.tableId.trim().slice(0, 64) : "";
    const t = floorPlan.tables.find((x) => x.id === tableId);
    if (!t) {
      return Response.json(
        { error: "Choose a table for dine-in (floor plan is configured)." },
        { status: 400 },
      );
    }
    dineInTable = t.label.trim().slice(0, 80);
  }

  const orderId = randomUUID();

  let orderRef: string;
  try {
    const out = await persistPosOrderToDatabase(orderId, parsed, {
      paymentMethodKey,
      dineInTable,
    });
    orderRef = out.orderRef;
  } catch (e) {
    console.error("POS order DB persist failed:", e);
    return Response.json(
      { error: "Could not save order. Check database configuration." },
      { status: 503 },
    );
  }

  return Response.json({
    orderId,
    orderRef,
    /** POS orders do not trigger WhatsApp — website orders only. */
    messageSentViaWhatsApp: false,
  });
}
