import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { ADMIN_TOKEN_COOKIE, verifyAdminToken } from "@/lib/admin-auth";
import { getPrisma } from "@/lib/prisma";
import { ORDER_STATUS_LABEL } from "@/lib/order-status-workflow";
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
