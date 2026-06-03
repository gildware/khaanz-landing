import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { ADMIN_TOKEN_COOKIE, verifyAdminToken } from "@/lib/admin-auth";
import { editOnlineOrder } from "@/lib/edit-order-db";
import { getPrisma } from "@/lib/prisma";
import { ORDER_STATUS_LABEL } from "@/lib/order-status-workflow";
import { isCartLine, parseNonNegativeMinor, toCartLines } from "@/lib/parse-order-create-body";
import { isOrderStatus, updateOrderStatus } from "@/lib/update-order-status";

type RouteContext = { params: Promise<{ orderId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const cookieStore = await cookies();
  const session = await verifyAdminToken(
    cookieStore.get(ADMIN_TOKEN_COOKIE)?.value,
  );
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orderId } = await context.params;
  if (!orderId) {
    return NextResponse.json({ error: "Missing order id" }, { status: 400 });
  }

  const prisma = getPrisma();
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      customer: {
        select: { phoneDigits: true, displayName: true },
      },
      lines: { orderBy: { sortIndex: "asc" } },
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: order.id,
    orderRef: order.orderRef,
    status: order.status,
    statusLabel: ORDER_STATUS_LABEL[order.status],
    fulfillment: order.fulfillment,
    scheduleMode: order.scheduleMode,
    scheduledAt: order.scheduledAt?.toISOString() ?? null,
    address: order.address,
    landmark: order.landmark,
    notes: order.notes,
    latitude: order.latitude,
    longitude: order.longitude,
    totalMinor: order.totalMinor,
    deliveryChargeMinor: order.deliveryChargeMinor,
    discountMinor: order.discountMinor,
    currency: order.currency,
    messageSentViaWhatsApp: order.messageSentViaWhatsApp,
    source: order.source,
    paymentMethod: order.paymentMethod,
    dineInTable: order.dineInTable,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    customerPhone: order.customer.phoneDigits,
    customerName: order.customer.displayName,
    lines: order.lines.map((l) => ({
      sortIndex: l.sortIndex,
      payload: l.payload,
    })),
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const cookieStore = await cookies();
  const admin = await verifyAdminToken(
    cookieStore.get(ADMIN_TOKEN_COOKIE)?.value,
  );
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orderId } = await context.params;
  if (!orderId) {
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

  const result = await updateOrderStatus(orderId, body.status, {
    adminUserId: admin.userId,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}

export async function PUT(request: Request, context: RouteContext) {
  const cookieStore = await cookies();
  const admin = await verifyAdminToken(
    cookieStore.get(ADMIN_TOKEN_COOKIE)?.value,
  );
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { orderId } = await context.params;
  if (!orderId) {
    return NextResponse.json({ error: "Missing order id" }, { status: 400 });
  }

  let body: {
    lines?: unknown;
    deliveryChargeMinor?: unknown;
    discountMinor?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!Array.isArray(body.lines) || body.lines.length === 0) {
    return NextResponse.json(
      { error: "An order must have at least one item." },
      { status: 400 },
    );
  }
  if (!body.lines.every(isCartLine)) {
    return NextResponse.json({ error: "Invalid order items." }, { status: 400 });
  }

  const result = await editOnlineOrder(
    orderId,
    {
      lines: toCartLines(body.lines),
      deliveryChargeMinor: parseNonNegativeMinor(body.deliveryChargeMinor),
      discountMinor: parseNonNegativeMinor(body.discountMinor),
    },
    { adminUserId: admin.userId },
  );

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, shortages: result.shortages },
      { status: result.status },
    );
  }

  return NextResponse.json(result);
}
