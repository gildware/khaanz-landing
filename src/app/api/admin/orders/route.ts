import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { ADMIN_TOKEN_COOKIE, verifyAdminToken } from "@/lib/admin-auth";
import { getPrisma } from "@/lib/prisma";
import { ORDER_STATUS_LABEL } from "@/lib/order-status-workflow";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 100;

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const session = await verifyAdminToken(
    cookieStore.get(ADMIN_TOKEN_COOKIE)?.value,
  );
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limitRaw = url.searchParams.get("limit");
  const offsetRaw = url.searchParams.get("offset");
  const pageSize = Math.min(
    Math.max(
      parseInt(limitRaw ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT,
      1,
    ),
    MAX_LIMIT,
  );
  const skip = Math.max(parseInt(offsetRaw ?? "0", 10) || 0, 0);

  const prisma = getPrisma();
  const rows = await prisma.order.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip,
    take: pageSize + 1,
    include: {
      customer: {
        select: { phoneDigits: true, displayName: true },
      },
      lines: { orderBy: { sortIndex: "asc" } },
    },
  });

  const hasMore = rows.length > pageSize;
  const orders = rows.slice(0, pageSize);

  return NextResponse.json({
    hasMore,
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
      customerPhone: o.customer.phoneDigits,
      customerName: o.customer.displayName,
      source: o.source,
      dineInTable: o.dineInTable,
      lines: o.lines.map((l) => ({
        sortIndex: l.sortIndex,
        payload: l.payload,
      })),
    })),
  });
}
