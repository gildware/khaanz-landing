import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { OrderStatus } from "@prisma/client";

import { ADMIN_TOKEN_COOKIE, verifyAdminToken } from "@/lib/admin-auth";
import { editPosOrder } from "@/lib/edit-order-db";
import { readFloorPlan } from "@/lib/floor-plan";
import { restaurantOrderStatusLabel } from "@/lib/order-status-workflow";
import { parseOrderCreateBody } from "@/lib/parse-order-create-body";
import { findOccupyingOrderForTable } from "@/lib/pos-occupied-tables";
import { getPrisma } from "@/lib/prisma";
import { readRestaurantSettings } from "@/lib/settings-repository";
import { isOrderStatus, updateOrderStatus } from "@/lib/update-order-status";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ orderId: string }> };

async function requirePosSession() {
  const cookieStore = await cookies();
  return verifyAdminToken(cookieStore.get(ADMIN_TOKEN_COOKIE)?.value);
}

/** Full POS order for edit-in-register (occupied table / history). */
export async function GET(_request: Request, context: RouteContext) {
  const session = await requirePosSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orderId } = await context.params;
  if (!orderId?.trim()) {
    return NextResponse.json({ error: "Missing order id" }, { status: 400 });
  }

  const prisma = getPrisma();
  const o = await prisma.order.findUnique({
    where: { id: orderId.trim() },
    include: {
      customer: {
        select: { phoneDigits: true, displayName: true },
      },
      lines: { orderBy: { sortIndex: "asc" } },
    },
  });

  if (!o) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (o.source !== "pos") {
    return NextResponse.json(
      { error: "Only POS orders can be opened here." },
      { status: 409 },
    );
  }

  return NextResponse.json({
    id: o.id,
    orderRef: o.orderRef,
    status: o.status,
    statusLabel: restaurantOrderStatusLabel(o.status, o.fulfillment),
    fulfillment: o.fulfillment,
    totalMinor: o.totalMinor,
    deliveryChargeMinor: o.deliveryChargeMinor,
    discountMinor: o.discountMinor,
    currency: o.currency,
    createdAt: o.createdAt.toISOString(),
    customerPhone: o.customer.phoneDigits,
    customerName: o.customer.displayName,
    paymentMethod: o.paymentMethod,
    dineInTable: o.dineInTable,
    address: o.address,
    landmark: o.landmark,
    notes: o.notes,
    lines: o.lines.map((l) => ({
      sortIndex: l.sortIndex,
      payload: l.payload,
    })),
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await requirePosSession();
  if (!session) {
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

  const prisma = getPrisma();
  const existing = await prisma.order.findUnique({
    where: { id: orderId.trim() },
    select: { source: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (existing.source !== "pos") {
    return NextResponse.json(
      { error: "Only POS orders can be updated here." },
      { status: 409 },
    );
  }

  const result = await updateOrderStatus(
    orderId.trim(),
    body.status as OrderStatus,
    { adminUserId: session.userId },
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}

/** Full POS order update from the mobile register cart. */
export async function PUT(request: Request, context: RouteContext) {
  const session = await requirePosSession();
  if (!session) {
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

  const prisma = getPrisma();
  const existing = await prisma.order.findUnique({
    where: { id: orderId.trim() },
    select: { source: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (existing.source !== "pos") {
    return NextResponse.json(
      { error: "Only POS orders can be edited here." },
      { status: 409 },
    );
  }

  const parsed = parseOrderCreateBody(json, { posMode: true });
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const body = json && typeof json === "object" ? (json as Record<string, unknown>) : {};
  const rawPm =
    typeof body.paymentMethodKey === "string"
      ? body.paymentMethodKey.trim().slice(0, 64)
      : "";

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
    const occupying = await findOccupyingOrderForTable(
      getPrisma(),
      dineInTable,
      { excludeOrderId: orderId.trim() },
    );
    if (occupying) {
      return NextResponse.json(
        {
          error: `Table ${dineInTable} is occupied (${occupying.orderRef ?? "open order"}). Clear that table first.`,
        },
        { status: 409 },
      );
    }
  }

  const result = await editPosOrder(orderId.trim(), parsed, {
    paymentMethodKey,
    dineInTable,
    adminUserId: session.userId,
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
