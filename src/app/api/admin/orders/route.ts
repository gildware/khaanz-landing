import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { ADMIN_TOKEN_COOKIE, verifyAdminToken } from "@/lib/admin-auth";
import { formatIstDateInput, parseIstDateInput } from "@/lib/ist-dates";
import { getPrisma } from "@/lib/prisma";
import { ORDER_STATUS_LABEL } from "@/lib/order-status-workflow";
import {
  buildDirectionsUrl,
  buildLocationUrl,
  getTravelDistance,
  isTravelDistanceConfigured,
} from "@/lib/travel-distance";

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

  const dateRaw = url.searchParams.get("date");
  const dayStart = dateRaw
    ? parseIstDateInput(dateRaw)
    : parseIstDateInput(formatIstDateInput(new Date()));
  if (!dayStart) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }
  const dayEndExclusive = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  // `online_pending`: new customer (website) orders awaiting acceptance — the
  //   Online orders inbox; spans all dates so unaccepted orders are never lost.
  // `exclude_online_pending`: the main Orders page, which only shows orders once
  //   they have been accepted (pending website orders live in the inbox).
  // (no view): legacy/full list used by the new-order notifier poller.
  const view = url.searchParams.get("view");
  const pendingOnlineFilter = {
    status: "PENDING" as const,
    source: "website" as const,
  };
  const where =
    view === "online_pending"
      ? pendingOnlineFilter
      : view === "exclude_online_pending"
        ? {
            createdAt: { gte: dayStart, lt: dayEndExclusive },
            NOT: pendingOnlineFilter,
          }
        : { createdAt: { gte: dayStart, lt: dayEndExclusive } };

  const prisma = getPrisma();
  const rows = await prisma.order.findMany({
    where,
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

  // Only the Online orders inbox calls Google for a driving ETA, to avoid
  // billing the Distance Matrix API on large/paginated order lists.
  const withTravel = view === "online_pending";

  const mapped = await Promise.all(
    orders.map(async (o) => {
      const hasCoords =
        typeof o.latitude === "number" && typeof o.longitude === "number";
      const travel =
        withTravel && hasCoords
          ? await getTravelDistance(o.latitude, o.longitude)
          : null;
      return {
        id: o.id,
        orderRef: o.orderRef,
        status: o.status,
        statusLabel: ORDER_STATUS_LABEL[o.status],
        fulfillment: o.fulfillment,
        scheduleMode: o.scheduleMode,
        scheduledAt: o.scheduledAt?.toISOString() ?? null,
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
        notes: o.notes,
        latitude: o.latitude,
        longitude: o.longitude,
        mapUrl: hasCoords
          ? buildDirectionsUrl(o.latitude as number, o.longitude as number)
          : null,
        locationUrl: hasCoords
          ? buildLocationUrl(o.latitude as number, o.longitude as number)
          : null,
        distance: travel,
        lines: o.lines.map((l) => ({
          sortIndex: l.sortIndex,
          payload: l.payload,
        })),
      };
    }),
  );

  return NextResponse.json({
    date: formatIstDateInput(dayStart),
    hasMore,
    travelDistanceConfigured: withTravel
      ? await isTravelDistanceConfigured()
      : undefined,
    orders: mapped,
  });
}
