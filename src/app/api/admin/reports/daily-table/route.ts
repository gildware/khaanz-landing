import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { ADMIN_TOKEN_COOKIE, verifyAdminToken } from "@/lib/admin-auth";
import { migrateCartLine } from "@/lib/cart-line";
import {
  computeOrderWorthPaise,
  computeStockWorthPaise,
} from "@/lib/expenses/personal-use-worth";
import { d } from "@/lib/inventory/decimal-utils";
import { planOrderConsumption } from "@/lib/inventory/plan-order-consumption";
import {
  formatIstDateInput,
  istDateLabel,
  istDayKey,
  istMonthKey,
  istStartOfNextMonth,
  parseIstDateInput,
} from "@/lib/ist-dates";
import { getPrisma } from "@/lib/prisma";
import {
  computeSalariesByDayPaise,
  dayKeysInMonth,
} from "@/lib/reports/day-salaries";
import { filterDayKeysFromReportingStart } from "@/lib/reports/reporting-start";
import type { CartLine } from "@/types/menu";

export const runtime = "nodejs";

type DayRow = {
  date: string;
  label: string;
  isFuture: boolean;
  salesPaise: number;
  orderCount: number;
  /** Recipe consumption only. */
  recipeStockCostPaise: number;
  kitchenUseCostPaise: number;
  /** recipe + kitchen — used for gross margin. */
  stockCostUsedPaise: number;
  capitalExpensesPaise: number;
  grossMarginPaise: number;
  /** Operating expenses only (hits P&L). */
  expensesPaise: number;
  salariesPaise: number;
  wastageCostPaise: number;
  netProfitPaise: number;
  personalUsePaise: number;
  vendorSalesPaise: number;
  stockSalesPaise: number;
};

function parseMonthKey(raw: string | null): string | null {
  if (!raw) return null;
  if (!/^\d{4}-\d{2}$/.test(raw)) return null;
  const start = parseIstDateInput(`${raw}-01`);
  return start ? raw : null;
}

function monthRange(monthKey: string): { from: Date; toExclusive: Date } {
  const from = parseIstDateInput(`${monthKey}-01`)!;
  return { from, toExclusive: istStartOfNextMonth(from) };
}

function monthLabel(monthKey: string): string {
  const from = parseIstDateInput(`${monthKey}-01`)!;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    month: "long",
    year: "numeric",
  }).format(from);
}

function emptyDay(date: string, label: string, isFuture: boolean): DayRow {
  return {
    date,
    label,
    isFuture,
    salesPaise: 0,
    orderCount: 0,
    recipeStockCostPaise: 0,
    kitchenUseCostPaise: 0,
    stockCostUsedPaise: 0,
    capitalExpensesPaise: 0,
    grossMarginPaise: 0,
    expensesPaise: 0,
    salariesPaise: 0,
    wastageCostPaise: 0,
    netProfitPaise: 0,
    personalUsePaise: 0,
    vendorSalesPaise: 0,
    stockSalesPaise: 0,
  };
}

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const session = await verifyAdminToken(cookieStore.get(ADMIN_TOKEN_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const now = new Date();
  const todayKey = formatIstDateInput(now);
  const monthKey = parseMonthKey(url.searchParams.get("month")) ?? istMonthKey(now);
  const { from, toExclusive } = monthRange(monthKey);
  const prisma = getPrisma();

  const dayKeys = dayKeysInMonth(monthKey);
  const rowsByDate = new Map<string, DayRow>();
  for (const date of dayKeys) {
    const dayStart = parseIstDateInput(date)!;
    rowsByDate.set(date, emptyDay(date, istDateLabel(dayStart), date > todayKey));
  }

  const [
    orders,
    expenseEntries,
    kitchenUseEntries,
    wastageEntries,
    personalUseEntries,
    vendorSales,
    stockSales,
  ] =
    await Promise.all([
      prisma.order.findMany({
        where: {
          createdAt: { gte: from, lt: toExclusive },
          status: { not: "CANCELLED" },
        },
        select: {
          createdAt: true,
          totalMinor: true,
          lines: { orderBy: { sortIndex: "asc" }, select: { payload: true } },
        },
      }),
      prisma.expenseEntry.findMany({
        where: { occurredAt: { gte: from, lt: toExclusive } },
        select: { occurredAt: true, amountPaise: true, kind: true },
      }),
      prisma.kitchenUseEntry.findMany({
        where: { usedAt: { gte: from, lt: toExclusive } },
        select: { usedAt: true, costPaise: true },
      }),
      prisma.wastageEntry.findMany({
        where: { wastedAt: { gte: from, lt: toExclusive } },
        select: {
          wastedAt: true,
          qtyBase: true,
          item: { select: { avgCostPaisePerBase: true } },
        },
      }),
      prisma.personalUseEntry.findMany({
        where: { occurredAt: { gte: from, lt: toExclusive } },
        select: {
          kind: true,
          occurredAt: true,
          cashAmountPaise: true,
          qtyBase: true,
          item: { select: { avgCostPaisePerBase: true } },
          variation: { select: { price: true } },
          order: { select: { totalMinor: true } },
        },
      }),
      prisma.vendorSale.findMany({
        where: { soldAt: { gte: from, lt: toExclusive } },
        select: { soldAt: true, totalPaise: true },
      }),
      prisma.stockSaleEntry.findMany({
        where: { soldAt: { gte: from, lt: toExclusive } },
        select: { soldAt: true, totalPaise: true, costPaise: true },
      }),
    ]);

  const pastOrTodayKeys = filterDayKeysFromReportingStart(
    dayKeys.filter((k) => k <= todayKey),
  );
  const salaryByDay = await computeSalariesByDayPaise(prisma, pastOrTodayKeys);
  for (const [date, salary] of salaryByDay) {
    const row = rowsByDate.get(date);
    if (row && !row.isFuture) {
      row.salariesPaise = salary.salariesPaise;
    }
  }

  const consumptionByDay = new Map<string, Map<string, Prisma.Decimal>>();

  await prisma.$transaction(async (tx) => {
    for (const order of orders) {
      const date = istDayKey(order.createdAt);
      const row = rowsByDate.get(date);
      if (!row) continue;
      row.salesPaise += order.totalMinor;
      row.orderCount += 1;

      const lines: CartLine[] = order.lines.map((l) =>
        migrateCartLine(l.payload as unknown as CartLine),
      );
      const consumption = await planOrderConsumption(tx, { lines }, order.createdAt);
      let dayMap = consumptionByDay.get(date);
      if (!dayMap) {
        dayMap = new Map();
        consumptionByDay.set(date, dayMap);
      }
      for (const [inventoryItemId, qtyBase] of consumption.entries()) {
        dayMap.set(
          inventoryItemId,
          (dayMap.get(inventoryItemId) ?? d(0)).add(qtyBase),
        );
      }
    }
  });

  const invIds = [
    ...new Set(
      [...consumptionByDay.values()].flatMap((m) => [...m.keys()]),
    ),
  ];
  const invMeta =
    invIds.length === 0
      ? []
      : await prisma.inventoryItem.findMany({
          where: { id: { in: invIds } },
          select: { id: true, avgCostPaisePerBase: true },
        });
  const costById = new Map(invMeta.map((i) => [i.id, i.avgCostPaisePerBase]));

  for (const [date, consumption] of consumptionByDay) {
    const row = rowsByDate.get(date);
    if (!row) continue;
    let stockCost = new Prisma.Decimal(0);
    for (const [id, qtyBase] of consumption) {
      const rate = costById.get(id) ?? d(0);
      stockCost = stockCost.add(qtyBase.mul(rate));
    }
    const recipe = Math.round(Number(stockCost.toString()));
    row.recipeStockCostPaise = recipe;
    row.stockCostUsedPaise = recipe;
  }

  for (const entry of expenseEntries) {
    const row = rowsByDate.get(istDayKey(entry.occurredAt));
    if (!row) continue;
    if (entry.kind === "CAPITAL") {
      row.capitalExpensesPaise += entry.amountPaise;
    } else {
      row.expensesPaise += entry.amountPaise;
    }
  }

  for (const entry of kitchenUseEntries) {
    const row = rowsByDate.get(istDayKey(entry.usedAt));
    if (!row) continue;
    row.kitchenUseCostPaise += entry.costPaise;
    row.stockCostUsedPaise += entry.costPaise;
  }

  for (const entry of wastageEntries) {
    const row = rowsByDate.get(istDayKey(entry.wastedAt));
    if (!row) continue;
    const rate = entry.item?.avgCostPaisePerBase ?? d(0);
    row.wastageCostPaise += Math.round(
      Number(d(entry.qtyBase).mul(rate).toString()),
    );
  }

  for (const p of personalUseEntries) {
    const row = rowsByDate.get(istDayKey(p.occurredAt));
    if (!row) continue;
    let worth = 0;
    if (p.kind === "CASH" || p.kind === "OTHER") {
      worth = p.cashAmountPaise;
    } else if (p.kind === "STOCK") {
      worth = computeStockWorthPaise([{ qtyBase: p.qtyBase, item: p.item }]);
    } else if (p.kind === "ORDER") {
      worth = computeOrderWorthPaise([
        { qtyBase: p.qtyBase, variation: p.variation, order: p.order },
      ]);
    }
    row.personalUsePaise += worth;
  }

  for (const sale of vendorSales) {
    const row = rowsByDate.get(istDayKey(sale.soldAt));
    if (row) row.vendorSalesPaise += sale.totalPaise;
  }

  for (const sale of stockSales) {
    const row = rowsByDate.get(istDayKey(sale.soldAt));
    if (!row) continue;
    row.stockSalesPaise += sale.totalPaise;
    row.stockCostUsedPaise += sale.costPaise;
  }

  const days: DayRow[] = dayKeys.map((date) => {
    const row = rowsByDate.get(date)!;
    if (row.isFuture) {
      return emptyDay(row.date, row.label, true);
    }
    row.grossMarginPaise =
      row.salesPaise + row.stockSalesPaise - row.stockCostUsedPaise;
    row.netProfitPaise =
      row.grossMarginPaise - row.expensesPaise - row.salariesPaise;
    return row;
  });

  const totals = days.reduce(
    (acc, row) => {
      if (row.isFuture) return acc;
      acc.salesPaise += row.salesPaise;
      acc.orderCount += row.orderCount;
      acc.recipeStockCostPaise += row.recipeStockCostPaise;
      acc.stockCostUsedPaise += row.stockCostUsedPaise;
      acc.kitchenUseCostPaise += row.kitchenUseCostPaise;
      acc.capitalExpensesPaise += row.capitalExpensesPaise;
      acc.grossMarginPaise += row.grossMarginPaise;
      acc.expensesPaise += row.expensesPaise;
      acc.salariesPaise += row.salariesPaise;
      acc.wastageCostPaise += row.wastageCostPaise;
      acc.netProfitPaise += row.netProfitPaise;
      acc.personalUsePaise += row.personalUsePaise;
      acc.vendorSalesPaise += row.vendorSalesPaise;
      acc.stockSalesPaise += row.stockSalesPaise;
      return acc;
    },
    {
      salesPaise: 0,
      orderCount: 0,
      recipeStockCostPaise: 0,
      stockCostUsedPaise: 0,
      kitchenUseCostPaise: 0,
      capitalExpensesPaise: 0,
      grossMarginPaise: 0,
      expensesPaise: 0,
      salariesPaise: 0,
      wastageCostPaise: 0,
      netProfitPaise: 0,
      personalUsePaise: 0,
      vendorSalesPaise: 0,
      stockSalesPaise: 0,
    },
  );

  return NextResponse.json({
    monthKey,
    label: monthLabel(monthKey),
    from: from.toISOString(),
    toExclusive: toExclusive.toISOString(),
    today: todayKey,
    days,
    totals,
  });
}
