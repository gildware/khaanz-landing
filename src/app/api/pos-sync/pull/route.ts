import { NextResponse } from "next/server";

import { ORDER_STATUS_LABEL } from "@/lib/order-status-workflow";
import {
  clientHasCurrentCatalog,
  readPosSyncCatalog,
} from "@/lib/pos-sync-catalog";
import { getPrisma } from "@/lib/prisma";

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

function parsePendingSince(req: Request): Date | null {
  const raw = (req.headers.get("x-pos-pending-since") || "").trim();
  if (!raw) return null;
  const d = new Date(raw);
  if (!Number.isFinite(d.getTime())) return null;
  return new Date(d.getTime() - 2000);
}

export async function GET(req: Request) {
  if (!requireSyncKey(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  if (url.searchParams.get("ping") === "1") {
    return NextResponse.json(
      { ok: true, ping: true },
      { headers: { "Cache-Control": "no-store, must-revalidate" } },
    );
  }

  const haveMenuRev = (req.headers.get("x-pos-menu-rev") || "").trim();
  const haveSettingsRev = (req.headers.get("x-pos-settings-rev") || "").trim();
  const skipCatalog = await clientHasCurrentCatalog(haveMenuRev, haveSettingsRev);
  const since = parsePendingSince(req);

  const prisma = getPrisma();
  const orderInclude = {
    customer: { select: { phoneDigits: true, displayName: true } },
    lines: { orderBy: { sortIndex: "asc" as const } },
  };

  const [catalog, pendingIdRows, changedOrders] = await Promise.all([
    skipCatalog ? Promise.resolve(null) : readPosSyncCatalog(),
    prisma.order.findMany({
      where: { status: "PENDING" },
      select: { id: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 200,
    }),
    prisma.order.findMany({
      where: since
        ? { status: "PENDING", updatedAt: { gt: since } }
        : { status: "PENDING" },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 100,
      include: orderInclude,
    }),
  ]);

  const menuRevision = catalog?.menuRevision ?? haveMenuRev;
  const settingsRevision = catalog?.settingsRevision ?? haveSettingsRev;
  const menuUnchanged = !catalog || haveMenuRev === catalog.menuRevision;
  const settingsUnchanged = !catalog || haveSettingsRev === catalog.settingsRevision;

  return NextResponse.json(
    {
      ok: true,
      menu: menuUnchanged ? undefined : catalog?.menu,
      menuRevision,
      settings: settingsUnchanged ? undefined : catalog?.settings,
      settingsRevision,
      menuUnchanged,
      settingsUnchanged,
      pendingIdList: pendingIdRows.map((r) => r.id),
      recentOrders: changedOrders.map((o) => ({
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
        address: o.address,
        landmark: o.landmark,
        source: o.source,
        dineInTable: o.dineInTable,
        paymentMethod: o.paymentMethod,
        lines: o.lines.map((l) => ({
          sortIndex: l.sortIndex,
          payload: l.payload,
        })),
      })),
      pendingDelta: Boolean(since),
      serverTime: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store, must-revalidate",
      },
    },
  );
}
