import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { ADMIN_TOKEN_COOKIE, verifyAdminToken } from "@/lib/admin-auth";
import { formatIstDateInput, parseIstDateInput } from "@/lib/ist-dates";
import { mapOrderCreatedByLabels } from "@/lib/order-created-by";
import { ORDER_STATUS_LABEL } from "@/lib/order-status-workflow";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/**
 * Recent POS orders for the mobile register history screen.
 * Auth: admin cookie; permission via `/api/admin/pos/*` → `pos`.
 *
 * Query: `date`, `limit`, `offset`, `scope=mine|all` (default all).
 */
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

  const dateRaw = url.searchParams.get("date");
  const dayStart = dateRaw
    ? parseIstDateInput(dateRaw)
    : parseIstDateInput(formatIstDateInput(new Date()));
  if (!dayStart) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }
  const dayEndExclusive = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const scope = url.searchParams.get("scope");
  const mineOnly = scope === "mine";

  const prisma = getPrisma();
  const rows = await prisma.order.findMany({
    where: {
      source: "pos",
      createdAt: { gte: dayStart, lt: dayEndExclusive },
      ...(mineOnly ? { createdByUserId: session.userId } : {}),
    },
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
  const page = rows.slice(0, pageSize);

  const createdByLabelById = await mapOrderCreatedByLabels(
    prisma,
    page.map((o) => ({ id: o.id, createdByUserId: o.createdByUserId })),
  );

  const orders = page.map((o) => ({
    id: o.id,
    orderRef: o.orderRef,
    status: o.status,
    statusLabel: ORDER_STATUS_LABEL[o.status],
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
    createdByUserId: o.createdByUserId,
    createdByLabel: createdByLabelById.get(o.id) ?? null,
    lines: o.lines.map((l) => ({
      sortIndex: l.sortIndex,
      payload: l.payload,
    })),
  }));

  return NextResponse.json({
    date: formatIstDateInput(dayStart),
    hasMore,
    scope: mineOnly ? "mine" : "all",
    currentUserId: session.userId,
    orders,
  });
}
