import { NextResponse } from "next/server";

import { formatIstDateInput, parseIstDateInput } from "@/lib/ist-dates";
import { getPrisma } from "@/lib/prisma";
import { ORDER_STATUS_LABEL } from "@/lib/order-status-workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 100;

function requireSyncKey(req: Request): string | null {
  const expected = (process.env.POS_SYNC_KEY || "").trim();
  if (!expected) return null;
  const got = (req.headers.get("x-pos-sync-key") || "").trim();
  if (!got || got !== expected) return null;
  return got;
}

/** POS desktop order lists — mirrors admin `/api/admin/orders` view + date filters. */
export async function GET(req: Request) {
  if (!requireSyncKey(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const limitRaw = url.searchParams.get("limit");
  const pageSize = Math.min(
    Math.max(
      parseInt(limitRaw ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT,
      1,
    ),
    MAX_LIMIT,
  );

  const dateRaw = url.searchParams.get("date");
  const dayStart = dateRaw
    ? parseIstDateInput(dateRaw)
    : parseIstDateInput(formatIstDateInput(new Date()));
  if (!dayStart) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }
  const dayEndExclusive = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const view = url.searchParams.get("view");
  const websiteFilter = { source: "website" as const };
  const where =
    view === "online"
      ? {
          ...websiteFilter,
          createdAt: { gte: dayStart, lt: dayEndExclusive },
        }
      : {
          createdAt: { gte: dayStart, lt: dayEndExclusive },
          NOT: websiteFilter,
        };

  const prisma = getPrisma();
  const rows = await prisma.order.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: pageSize,
    include: {
      customer: { select: { phoneDigits: true, displayName: true } },
      lines: { orderBy: { sortIndex: "asc" } },
    },
  });

  return NextResponse.json(
    {
      ok: true,
      date: formatIstDateInput(dayStart),
      orders: rows.map((o) => ({
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
        source: o.source,
        dineInTable: o.dineInTable,
        address: o.address,
        landmark: o.landmark,
        lines: o.lines.map((l) => ({
          sortIndex: l.sortIndex,
          payload: l.payload,
        })),
      })),
    },
    { headers: { "Cache-Control": "no-store, must-revalidate" } },
  );
}
