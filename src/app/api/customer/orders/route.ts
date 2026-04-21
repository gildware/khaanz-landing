import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { verifyCustomerToken, CUSTOMER_TOKEN_COOKIE } from "@/lib/customer-auth";
import { getPrisma } from "@/lib/prisma";
import { ORDER_STATUS_LABEL } from "@/lib/order-status-workflow";

export const runtime = "nodejs";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(CUSTOMER_TOKEN_COOKIE)?.value;
  const session = await verifyCustomerToken(token);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const prisma = getPrisma();
  const orders = await prisma.order.findMany({
    where: { customerId: session.customerId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      orderRef: true,
      status: true,
      fulfillment: true,
      scheduleMode: true,
      scheduledAt: true,
      totalMinor: true,
      currency: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    orders: orders.map((o) => ({
      id: o.id,
      orderRef: o.orderRef,
      status: o.status,
      statusLabel: ORDER_STATUS_LABEL[o.status],
      fulfillment: o.fulfillment,
      scheduleMode: o.scheduleMode,
      scheduledAt: o.scheduledAt?.toISOString() ?? null,
      totalMinor: o.totalMinor,
      currency: o.currency,
      createdAt: o.createdAt.toISOString(),
    })),
  });
}
