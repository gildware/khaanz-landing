import { cookies } from "next/headers";
import { after } from "next/server";
import { NextResponse } from "next/server";

import { ADMIN_TOKEN_COOKIE, verifyAdminToken } from "@/lib/admin-auth";
import { notifyCustomerOrderStatusChange } from "@/lib/customer-notify";
import { getPrisma } from "@/lib/prisma";
import {
  canAdminSetOrderStatus,
  ORDER_STATUS_LABEL,
} from "@/lib/order-status-workflow";
import type { OrderStatus } from "@prisma/client";

export const runtime = "nodejs";

const ALL_STATUSES: OrderStatus[] = [
  "PENDING",
  "ACCEPTED",
  "PREPARING",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
];

function isOrderStatus(x: unknown): x is OrderStatus {
  return typeof x === "string" && ALL_STATUSES.includes(x as OrderStatus);
}

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
  const nextStatus = body.status;

  const prisma = getPrisma();
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { customer: true },
  });
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (order.status === nextStatus) {
    return NextResponse.json({
      ok: true,
      id: order.id,
      status: order.status,
      statusLabel: ORDER_STATUS_LABEL[order.status],
    });
  }

  if (!canAdminSetOrderStatus(order.status, nextStatus)) {
    return NextResponse.json(
      {
        error: `Cannot change status from ${ORDER_STATUS_LABEL[order.status]} to ${ORDER_STATUS_LABEL[nextStatus]}.`,
      },
      { status: 400 },
    );
  }

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: { status: nextStatus },
  });

  if (order.status !== nextStatus) {
    after(async () => {
      try {
        await notifyCustomerOrderStatusChange({
          orderRef: updated.orderRef,
          orderId: updated.id,
          phoneDigits10: order.customer.phoneDigits,
          status: nextStatus,
        });
      } catch (e) {
        console.error("Customer status notify failed:", e);
      }
    });
  }

  return NextResponse.json({
    ok: true,
    id: updated.id,
    status: updated.status,
    statusLabel: ORDER_STATUS_LABEL[updated.status],
  });
}
