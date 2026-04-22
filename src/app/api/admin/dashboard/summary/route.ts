import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { ADMIN_TOKEN_COOKIE, verifyAdminToken } from "@/lib/admin-auth";
import { migrateCartLine } from "@/lib/cart-line";
import { d } from "@/lib/inventory/decimal-utils";
import { planOrderConsumption } from "@/lib/inventory/plan-order-consumption";
import { getPrisma } from "@/lib/prisma";
import type { CartLine } from "@/types/menu";

export const runtime = "nodejs";

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

function istMonthKey(now: Date): string {
  const { y, m } = istDateParts(now);
  return `${y}-${m}`;
}

function istStartOfDay(now: Date): Date {
  const { y, m, d: day } = istDateParts(now);
  return new Date(`${y}-${m}-${day}T00:00:00+05:30`);
}

function istStartOfMonth(now: Date): Date {
  const { y, m } = istDateParts(now);
  return new Date(`${y}-${m}-01T00:00:00+05:30`);
}

function istStartOfNextMonth(now: Date): Date {
  const { y, m } = istDateParts(now);
  const year = Number(y);
  const month = Number(m);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return new Date(
    `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}-01T00:00:00+05:30`,
  );
}

function clampTopBottom(
  rows: Array<{ key: string; label: string; qty: number }>,
  limit: number,
) {
  const sorted = [...rows].sort((a, b) => b.qty - a.qty);
  const top = sorted.slice(0, limit);
  const bottom = [...sorted].reverse().slice(0, limit);
  return { top, bottom };
}

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const session = await verifyAdminToken(
    cookieStore.get(ADMIN_TOKEN_COOKIE)?.value,
  );
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const at = url.searchParams.get("at") ? new Date(url.searchParams.get("at")!) : new Date();
  if (Number.isNaN(at.getTime())) {
    return NextResponse.json({ error: "Invalid at" }, { status: 400 });
  }

  const todayStart = istStartOfDay(at);
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const monthStart = istStartOfMonth(at);
  const monthEndExclusive = istStartOfNextMonth(at);
  const monthKey = istMonthKey(at);

  const prisma = getPrisma();

  const [todaySalesAgg, monthSalesAgg, todayExpenseAgg, monthExpenseAgg, payroll] =
    await prisma.$transaction([
      prisma.order.aggregate({
        where: {
          createdAt: { gte: todayStart, lt: tomorrowStart },
          status: { not: "CANCELLED" },
        },
        _sum: { totalMinor: true },
        _count: { _all: true },
      }),
      prisma.order.aggregate({
        where: {
          createdAt: { gte: monthStart, lt: monthEndExclusive },
          status: { not: "CANCELLED" },
        },
        _sum: { totalMinor: true },
        _count: { _all: true },
      }),
      prisma.expenseEntry.aggregate({
        where: { occurredAt: { gte: todayStart, lt: tomorrowStart } },
        _sum: { amountPaise: true },
      }),
      prisma.expenseEntry.aggregate({
        where: { occurredAt: { gte: monthStart, lt: monthEndExclusive } },
        _sum: { amountPaise: true },
      }),
      prisma.payrollRun.findUnique({
        where: { monthKey },
        select: { lines: { select: { netPayPaise: true } } },
      }),
    ]);

  const salariesPaise = payroll?.lines.reduce((s, l) => s + l.netPayPaise, 0) ?? 0;

  const monthOrders = await prisma.order.findMany({
    where: {
      createdAt: { gte: monthStart, lt: monthEndExclusive },
      status: { not: "CANCELLED" },
    },
    select: {
      id: true,
      createdAt: true,
      totalMinor: true,
      lines: { orderBy: { sortIndex: "asc" }, select: { payload: true } },
    },
  });

  const soldByKey = new Map<string, { label: string; qty: number }>();
  const monthConsumption = new Map<string, Prisma.Decimal>();

  await prisma.$transaction(async (tx) => {
    for (const o of monthOrders) {
      const lines: CartLine[] = o.lines.map((l) =>
        migrateCartLine(l.payload as unknown as CartLine),
      );

      for (const line of lines) {
        if (line.kind === "item") {
          const key = `item:${line.itemId}:${line.variation.id}`;
          const label = `${line.name}${line.variation.name ? ` • ${line.variation.name}` : ""}`;
          const prev = soldByKey.get(key) ?? { label, qty: 0 };
          soldByKey.set(key, { label: prev.label || label, qty: prev.qty + line.quantity });
          continue;
        }
        if (line.kind === "combo") {
          const key = `combo:${line.comboId}`;
          const label = line.name || "Combo";
          const prev = soldByKey.get(key) ?? { label, qty: 0 };
          soldByKey.set(key, { label: prev.label || label, qty: prev.qty + line.quantity });
          continue;
        }
      }

      const consumption = await planOrderConsumption(
        tx,
        { lines },
        o.createdAt,
      );
      for (const [inventoryItemId, qtyBase] of consumption.entries()) {
        monthConsumption.set(
          inventoryItemId,
          (monthConsumption.get(inventoryItemId) ?? d(0)).add(qtyBase),
        );
      }
    }
  });

  const invIds = [...monthConsumption.keys()];
  const invMeta =
    invIds.length === 0
      ? []
      : await prisma.inventoryItem.findMany({
          where: { id: { in: invIds } },
          select: { id: true, avgCostPaisePerBase: true },
        });
  const costById = new Map(invMeta.map((i) => [i.id, i.avgCostPaisePerBase]));

  let stockCostPaise = new Prisma.Decimal(0);
  for (const [id, qtyBase] of monthConsumption.entries()) {
    const rate = costById.get(id) ?? d(0);
    stockCostPaise = stockCostPaise.add(qtyBase.mul(rate));
  }
  const stockCostPaiseInt = Math.round(Number(stockCostPaise.toString()));

  const monthSalesMinor = monthSalesAgg._sum.totalMinor ?? 0;
  const grossMarginPaise = monthSalesMinor - stockCostPaiseInt;
  const monthExpensesPaise = monthExpenseAgg._sum.amountPaise ?? 0;
  const netProfitPaise = grossMarginPaise - monthExpensesPaise - salariesPaise;

  const soldRows = [...soldByKey.entries()].map(([key, v]) => ({
    key,
    label: v.label,
    qty: v.qty,
  }));
  const { top: topSelling, bottom: leastSelling } = clampTopBottom(soldRows, 10);

  return NextResponse.json({
    at: at.toISOString(),
    ranges: {
      todayStart: todayStart.toISOString(),
      tomorrowStart: tomorrowStart.toISOString(),
      monthStart: monthStart.toISOString(),
      monthEndExclusive: monthEndExclusive.toISOString(),
      monthKey,
    },
    kpis: {
      todaySalesPaise: todaySalesAgg._sum.totalMinor ?? 0,
      monthSalesPaise: monthSalesMinor,
      todayExpensesPaise: todayExpenseAgg._sum.amountPaise ?? 0,
      monthExpensesPaise,
      salariesPaise,
      stockCostUsedPaise: stockCostPaiseInt,
      grossMarginPaise,
      netProfitPaise,
      todayOrdersCount: todaySalesAgg._count._all ?? 0,
      monthOrdersCount: monthSalesAgg._count._all ?? 0,
    },
    charts: {
      topSelling,
      leastSelling,
    },
  });
}

