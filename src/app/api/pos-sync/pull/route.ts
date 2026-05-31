import { NextResponse } from "next/server";

import { readMenuPayload } from "@/lib/menu-repository";
import { ORDER_STATUS_LABEL } from "@/lib/order-status-workflow";
import { getPrisma } from "@/lib/prisma";
import { readRestaurantSettings } from "@/lib/settings-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function requireSyncKey(req: Request): string | null {
  const expected = (process.env.POS_SYNC_KEY || "").trim();
  if (!expected) return null;
  const got = (req.headers.get("x-pos-sync-key") || "").trim();
  if (!got || got !== expected) return null;
  return got;
}

export async function GET(req: Request) {
  if (!requireSyncKey(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const prisma = getPrisma();
  const [payload, orders, settings] = await Promise.all([
    readMenuPayload(),
    prisma.order.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
      include: {
        customer: { select: { phoneDigits: true, displayName: true } },
        lines: { orderBy: { sortIndex: "asc" } },
      },
    }),
    readRestaurantSettings(),
  ]);

  return NextResponse.json(
    {
      ok: true,
      menu: payload,
      settings,
      recentOrders: orders.map((o) => ({
        id: o.id,
        orderRef: o.orderRef,
        status: o.status,
        statusLabel: ORDER_STATUS_LABEL[o.status],
        fulfillment: o.fulfillment,
        totalMinor: o.totalMinor,
        currency: o.currency,
        createdAt: o.createdAt.toISOString(),
        customerPhone: o.customer.phoneDigits,
        customerName: o.customer.displayName,
        source: o.source,
        dineInTable: o.dineInTable,
        paymentMethod: o.paymentMethod,
        lines: o.lines.map((l) => ({
          sortIndex: l.sortIndex,
          payload: l.payload,
        })),
      })),
      serverTime: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store, must-revalidate",
      },
    },
  );
}

