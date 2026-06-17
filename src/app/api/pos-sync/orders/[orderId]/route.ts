import { NextResponse } from "next/server";
import type { OrderStatus } from "@prisma/client";

import { editPosOrder } from "@/lib/edit-order-db";
import { readFloorPlan } from "@/lib/floor-plan";
import { isOrderStatus, updateOrderStatus } from "@/lib/update-order-status";
import { parseOrderCreateBody } from "@/lib/parse-order-create-body";
import { readRestaurantSettings } from "@/lib/settings-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function requireSyncKey(req: Request): boolean {
  const expected = (process.env.POS_SYNC_KEY || "").trim();
  if (!expected) return false;
  const got = (req.headers.get("x-pos-sync-key") || "").trim();
  return Boolean(got && got === expected);
}

type RouteContext = { params: Promise<{ orderId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  if (!requireSyncKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orderId } = await context.params;
  if (!orderId?.trim()) {
    return NextResponse.json({ error: "Missing order id" }, { status: 400 });
  }

  let body: { status?: unknown };
  try {
    body = (await request.json()) as { status?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isOrderStatus(body.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const result = await updateOrderStatus(orderId.trim(), body.status as OrderStatus);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}

export async function PUT(request: Request, context: RouteContext) {
  if (!requireSyncKey(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orderId } = await context.params;
  if (!orderId?.trim()) {
    return NextResponse.json({ error: "Missing order id" }, { status: 400 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parseOrderCreateBody(json, { posMode: true });
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const body = json && typeof json === "object" ? (json as Record<string, unknown>) : {};
  const rawPm =
    typeof body.paymentMethodKey === "string" ? body.paymentMethodKey.trim().slice(0, 64) : "";

  const [settings, floorPlan] = await Promise.all([
    readRestaurantSettings(),
    readFloorPlan(),
  ]);

  const allowed = new Set(settings.paymentMethods.map((p) => p.id));
  let paymentMethodKey = "";
  if (rawPm) {
    if (!allowed.has(rawPm)) {
      return NextResponse.json(
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
      return NextResponse.json(
        { error: "Choose a table for dine-in (floor plan is configured)." },
        { status: 400 },
      );
    }
    dineInTable = t.label.trim().slice(0, 80);
  }

  const result = await editPosOrder(orderId.trim(), parsed, {
    paymentMethodKey,
    dineInTable,
    adminUserId: null,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, shortages: result.shortages },
      { status: result.status },
    );
  }

  return NextResponse.json({
    ok: true,
    id: result.id,
    orderRef: result.orderRef,
    totalMinor: result.totalMinor,
    deliveryChargeMinor: result.deliveryChargeMinor,
    discountMinor: result.discountMinor,
  });
}
