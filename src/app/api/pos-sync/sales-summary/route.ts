import { NextResponse } from "next/server";

import { migrateCartLine } from "@/lib/cart-line";
import { getPrisma } from "@/lib/prisma";
import { readRestaurantSettings } from "@/lib/settings-repository";
import type { CartLine } from "@/types/menu";

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

function istDateParts(now: Date): { y: string; m: string; d: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d2 = parts.find((p) => p.type === "day")?.value ?? "01";
  return { y, m, d: d2 };
}

function istStartOfDay(now: Date): Date {
  const { y, m, d: day } = istDateParts(now);
  return new Date(`${y}-${m}-${day}T00:00:00+05:30`);
}

function istDateLabel(now: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(now);
}

function istHourFromDate(d: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    hour12: false,
  }).formatToParts(d);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  return Number.isFinite(hour) ? hour : 0;
}

function formatIstHourLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  if (h === 0) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

type LineReportRow = {
  key: string;
  label: string;
  quantity: number;
  revenueMinor: number;
};

function lineFromPayload(payload: unknown): LineReportRow | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const quantity =
    typeof p.quantity === "number" && Number.isFinite(p.quantity) && p.quantity > 0
      ? Math.floor(p.quantity)
      : 1;
  const unitPrice =
    typeof p.unitPrice === "number" && Number.isFinite(p.unitPrice) ? p.unitPrice : 0;
  const revenueMinor = Math.round(unitPrice * quantity * 100);

  if (p.kind === "open") {
    const name = String(p.name || "Open item");
    return {
      key: `open:${name.toLowerCase()}`,
      label: `${name} (Open)`,
      quantity,
      revenueMinor,
    };
  }

  if (p.kind === "combo") {
    const name = String(p.name || "Combo");
    const comboId = typeof p.comboId === "string" ? p.comboId : name;
    return {
      key: `combo:${comboId}`,
      label: name,
      quantity,
      revenueMinor,
    };
  }

  const name = String(p.name || "Item");
  const variation = p.variation as Record<string, unknown> | undefined;
  const variationName =
    variation && typeof variation.name === "string" ? variation.name : "";
  const variationId =
    variation && typeof variation.id === "string" ? variation.id : "default";
  const itemId = typeof p.itemId === "string" ? p.itemId : name;
  return {
    key: `item:${itemId}:${variationId}`,
    label: variationName ? `${name} · ${variationName}` : name,
    quantity,
    revenueMinor,
  };
}

function lineFromCartLine(line: CartLine): LineReportRow | null {
  if (line.kind === "open") {
    const revenueMinor = Math.round(line.unitPrice * line.quantity * 100);
    return {
      key: `open:${line.name.toLowerCase()}`,
      label: `${line.name} (Open)`,
      quantity: line.quantity,
      revenueMinor,
    };
  }
  if (line.kind === "combo") {
    const revenueMinor = Math.round(line.unitPrice * line.quantity * 100);
    return {
      key: `combo:${line.comboId}`,
      label: line.name,
      quantity: line.quantity,
      revenueMinor,
    };
  }
  const revenueMinor = Math.round(line.unitPrice * line.quantity * 100);
  return {
    key: `item:${line.itemId}:${line.variation.id}`,
    label: line.variation.name ? `${line.name} · ${line.variation.name}` : line.name,
    quantity: line.quantity,
    revenueMinor,
  };
}

export async function GET(req: Request) {
  if (!requireSyncKey(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const todayStart = istStartOfDay(now);
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  const prisma = getPrisma();
  const [orders, settings] = await Promise.all([
    prisma.order.findMany({
      where: {
        createdAt: { gte: todayStart, lt: tomorrowStart },
      },
      select: {
        id: true,
        status: true,
        totalMinor: true,
        paymentMethod: true,
        createdAt: true,
        lines: { orderBy: { sortIndex: "asc" }, select: { payload: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    readRestaurantSettings(),
  ]);

  const paymentLabels = new Map(
    settings.paymentMethods.map((p) => [p.id, p.name] as const),
  );

  let totalSalesMinor = 0;
  let orderCount = 0;
  let cancelledCount = 0;
  const paymentMap = new Map<string, { orderCount: number; totalMinor: number }>();
  const itemMap = new Map<string, { label: string; quantity: number; revenueMinor: number }>();
  const hourly = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: formatIstHourLabel(hour),
    orderCount: 0,
    totalMinor: 0,
  }));

  for (const order of orders) {
    const cancelled = order.status === "CANCELLED";
    if (cancelled) {
      cancelledCount += 1;
      continue;
    }

    orderCount += 1;
    totalSalesMinor += order.totalMinor;

    const pmKey = (order.paymentMethod || "").trim() || "unknown";
    const pmPrev = paymentMap.get(pmKey) ?? { orderCount: 0, totalMinor: 0 };
    paymentMap.set(pmKey, {
      orderCount: pmPrev.orderCount + 1,
      totalMinor: pmPrev.totalMinor + order.totalMinor,
    });

    const hour = istHourFromDate(order.createdAt);
    const hourRow = hourly[hour];
    if (hourRow) {
      hourRow.orderCount += 1;
      hourRow.totalMinor += order.totalMinor;
    }

    for (const line of order.lines) {
      let row: LineReportRow | null = null;
      try {
        row = lineFromCartLine(migrateCartLine(line.payload as unknown as CartLine));
      } catch {
        row = lineFromPayload(line.payload);
      }
      if (!row) continue;
      const prev = itemMap.get(row.key) ?? {
        label: row.label,
        quantity: 0,
        revenueMinor: 0,
      };
      itemMap.set(row.key, {
        label: prev.label || row.label,
        quantity: prev.quantity + row.quantity,
        revenueMinor: prev.revenueMinor + row.revenueMinor,
      });
    }
  }

  const averageTicketMinor =
    orderCount > 0 ? Math.round(totalSalesMinor / orderCount) : 0;

  return NextResponse.json(
    {
      ok: true,
      source: "server",
      dateLabel: istDateLabel(now),
      generatedAt: now.toISOString(),
      ranges: {
        todayStart: todayStart.toISOString(),
        tomorrowStart: tomorrowStart.toISOString(),
      },
      summary: {
        totalSalesMinor,
        orderCount,
        averageTicketMinor,
        cancelledCount,
      },
      paymentMethods: [...paymentMap.entries()]
        .map(([key, v]) => ({
          key,
          label:
            key === "unknown"
              ? "Not recorded"
              : paymentLabels.get(key) || key || "Not recorded",
          orderCount: v.orderCount,
          totalMinor: v.totalMinor,
        }))
        .sort((a, b) => b.totalMinor - a.totalMinor),
      items: [...itemMap.values()]
        .map((v, i) => ({
          key: `item-${i}`,
          label: v.label,
          quantity: v.quantity,
          revenueMinor: v.revenueMinor,
        }))
        .sort((a, b) => b.revenueMinor - a.revenueMinor),
      hourly: hourly.filter((h) => h.orderCount > 0),
    },
    {
      headers: {
        "Cache-Control": "no-store, must-revalidate",
      },
    },
  );
}
