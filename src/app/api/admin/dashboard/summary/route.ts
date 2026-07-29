import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { ADMIN_TOKEN_COOKIE, verifyAdminToken } from "@/lib/admin-auth";
import { migrateCartLine } from "@/lib/cart-line";
import {
  cashBalanceBefore,
  ensureCashPoolSettings,
} from "@/lib/cash/cash-pool";
import { sumOrderConsumptionCostPaiseInRange } from "@/lib/inventory/fifo-cogs";
import {
  loadStockValueRankRows,
  splitStockValueRanks,
} from "@/lib/inventory/stock-value-charts";
import { getPrisma } from "@/lib/prisma";
import type { CartLine } from "@/types/menu";

type SalesRow = { key: string; label: string; qty: number };
type ValueRankRow = { key: string; label: string; valuePaise: number };

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

const CHART_ITEMS_LIMIT = 5;

function splitTopBottom(rows: SalesRow[]) {
  const sorted = [...rows].sort((a, b) => b.qty - a.qty || a.label.localeCompare(b.label));
  const bottom = [...sorted].reverse();
  return {
    top: sorted.slice(0, CHART_ITEMS_LIMIT),
    bottom: bottom.slice(0, CHART_ITEMS_LIMIT),
  };
}

function splitTopBottomValues(rows: ValueRankRow[]) {
  const sorted = [...rows].sort(
    (a, b) => b.valuePaise - a.valuePaise || a.label.localeCompare(b.label),
  );
  const bottom = [...sorted].reverse();
  return {
    top: sorted.slice(0, CHART_ITEMS_LIMIT),
    bottom: bottom.slice(0, CHART_ITEMS_LIMIT),
  };
}

async function buildVendorChartRows(
  monthStart: Date,
  monthEndExclusive: Date,
): Promise<{
  topVendorsBySales: ValueRankRow[];
  bottomVendorsBySales: ValueRankRow[];
  topVendorItemsByQty: SalesRow[];
  bottomVendorItemsByQty: SalesRow[];
}> {
  const prisma = getPrisma();

  const [vendorSalesAgg, vendorLines] = await Promise.all([
    prisma.vendorSale.groupBy({
      by: ["vendorId"],
      where: { soldAt: { gte: monthStart, lt: monthEndExclusive } },
      _sum: { totalPaise: true },
    }),
    prisma.vendorSaleLine.findMany({
      where: {
        sale: { soldAt: { gte: monthStart, lt: monthEndExclusive } },
      },
      select: {
        menuItemId: true,
        quantity: true,
        menuItem: { select: { name: true } },
      },
    }),
  ]);

  const vendorIds = vendorSalesAgg.map((v) => v.vendorId);
  const vendors =
    vendorIds.length > 0
      ? await prisma.vendor.findMany({
          where: { id: { in: vendorIds } },
          select: { id: true, name: true },
        })
      : [];
  const vendorName = new Map(vendors.map((v) => [v.id, v.name]));

  const vendorRows: ValueRankRow[] = vendorSalesAgg
    .map((v) => ({
      key: v.vendorId,
      label: vendorName.get(v.vendorId) ?? v.vendorId,
      valuePaise: v._sum.totalPaise ?? 0,
    }))
    .filter((r) => r.valuePaise > 0);

  const itemQty = new Map<string, { label: string; qty: number }>();
  for (const ln of vendorLines) {
    const qty = Number(ln.quantity);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const prev = itemQty.get(ln.menuItemId) ?? { label: ln.menuItem.name, qty: 0 };
    itemQty.set(ln.menuItemId, { label: prev.label, qty: prev.qty + qty });
  }
  const itemRows: SalesRow[] = [...itemQty.entries()].map(([key, v]) => ({
    key,
    label: v.label,
    qty: v.qty,
  }));

  const { top: topVendorsBySales, bottom: bottomVendorsBySales } =
    splitTopBottomValues(vendorRows);
  const { top: topVendorItemsByQty, bottom: bottomVendorItemsByQty } =
    splitTopBottom(itemRows);

  return {
    topVendorsBySales,
    bottomVendorsBySales,
    topVendorItemsByQty,
    bottomVendorItemsByQty,
  };
}

async function sumVendorReceivablePaise(): Promise<number> {
  const prisma = getPrisma();
  const ledgerAgg = await prisma.vendorLedgerEntry.groupBy({
    by: ["vendorId"],
    _sum: { debitPaise: true, creditPaise: true },
  });
  return ledgerAgg.reduce((sum, g) => {
    const balance = (g._sum.debitPaise ?? 0) - (g._sum.creditPaise ?? 0);
    return sum + (balance > 0 ? balance : 0);
  }, 0);
}

async function sumSupplierPayablePaise(): Promise<number> {
  const prisma = getPrisma();
  const ledgerAgg = await prisma.supplierLedgerEntry.groupBy({
    by: ["supplierId"],
    _sum: { debitPaise: true, creditPaise: true },
  });
  return ledgerAgg.reduce((sum, g) => {
    const balance = (g._sum.debitPaise ?? 0) - (g._sum.creditPaise ?? 0);
    return sum + (balance > 0 ? balance : 0);
  }, 0);
}

/** Slim catalog for sales rank charts — skips addons / full menu payload. */
async function buildMenuCatalogRows(): Promise<SalesRow[]> {
  const prisma = getPrisma();
  const [items, combos] = await Promise.all([
    prisma.menuItem.findMany({
      select: {
        id: true,
        name: true,
        variations: {
          select: { id: true, name: true },
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.menuCombo.findMany({
      select: { id: true, name: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);

  const rows: SalesRow[] = [];
  for (const item of items) {
    for (const v of item.variations) {
      rows.push({
        key: `item:${item.id}:${v.id}`,
        label: `${item.name}${v.name ? ` • ${v.name}` : ""}`,
        qty: 0,
      });
    }
  }
  for (const combo of combos) {
    rows.push({
      key: `combo:${combo.id}`,
      label: combo.name || "Combo",
      qty: 0,
    });
  }
  return rows;
}

function mergeSalesIntoCatalog(
  catalog: SalesRow[],
  soldByKey: Map<string, { label: string; qty: number }>,
) {
  const byKey = new Map(catalog.map((r) => [r.key, r]));
  for (const [key, sold] of soldByKey) {
    const row = byKey.get(key);
    if (row) {
      row.qty = sold.qty;
      if (sold.label) row.label = sold.label;
    } else {
      byKey.set(key, { key, label: sold.label, qty: sold.qty });
    }
  }
  return [...byKey.values()];
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
  const at = url.searchParams.get("at")
    ? new Date(url.searchParams.get("at")!)
    : new Date();
  if (Number.isNaN(at.getTime())) {
    return NextResponse.json({ error: "Invalid at" }, { status: 400 });
  }

  const todayStart = istStartOfDay(at);
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const monthStart = istStartOfMonth(at);
  const monthEndExclusive = istStartOfNextMonth(at);
  const monthKey = istMonthKey(at);

  const prisma = getPrisma();

  // All independent reads in parallel — a $transaction would force them sequential.
  const [
    todaySalesAgg,
    monthSalesAgg,
    todayExpenseAgg,
    monthExpenseAgg,
    monthCapitalExpenseAgg,
    monthKitchenUseAgg,
    payroll,
    todayVendorSalesAgg,
    monthVendorSalesAgg,
    monthVendorPaymentsAgg,
    overdueVendorSalesCount,
    todayPurchasesAgg,
    monthPurchasesAgg,
    monthSupplierPaymentsAgg,
    overduePurchasesCount,
    monthOrderLines,
    stockCostPaiseInt,
    catalog,
    stockValueRows,
    vendorReceivablePaise,
    supplierPayablePaise,
    vendorCharts,
    cashAvailablePaise,
    categoryCount,
    itemCount,
    comboCount,
    addonCount,
  ] = await Promise.all([
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
      where: {
        occurredAt: { gte: todayStart, lt: tomorrowStart },
        kind: "OPERATING",
      },
      _sum: { amountPaise: true },
    }),
    prisma.expenseEntry.aggregate({
      where: {
        occurredAt: { gte: monthStart, lt: monthEndExclusive },
        kind: "OPERATING",
      },
      _sum: { amountPaise: true },
    }),
    prisma.expenseEntry.aggregate({
      where: {
        occurredAt: { gte: monthStart, lt: monthEndExclusive },
        kind: "CAPITAL",
      },
      _sum: { amountPaise: true },
      _count: { _all: true },
    }),
    prisma.kitchenUseEntry.aggregate({
      where: { usedAt: { gte: monthStart, lt: monthEndExclusive } },
      _sum: { costPaise: true },
      _count: { _all: true },
    }),
    prisma.payrollRun.findMany({
      where: { monthKey },
      select: { lines: { select: { netPayPaise: true } } },
    }),
    prisma.vendorSale.aggregate({
      where: { soldAt: { gte: todayStart, lt: tomorrowStart } },
      _sum: { totalPaise: true },
      _count: { _all: true },
    }),
    prisma.vendorSale.aggregate({
      where: { soldAt: { gte: monthStart, lt: monthEndExclusive } },
      _sum: { totalPaise: true },
      _count: { _all: true },
    }),
    prisma.vendorPayment.aggregate({
      where: { paidAt: { gte: monthStart, lt: monthEndExclusive } },
      _sum: { amountPaise: true },
    }),
    prisma.vendorSale.count({
      where: { paymentType: "CREDIT", dueAt: { lt: at } },
    }),
    prisma.purchase.aggregate({
      where: { purchasedAt: { gte: todayStart, lt: tomorrowStart } },
      _sum: { totalPaise: true },
      _count: { _all: true },
    }),
    prisma.purchase.aggregate({
      where: { purchasedAt: { gte: monthStart, lt: monthEndExclusive } },
      _sum: { totalPaise: true },
      _count: { _all: true },
    }),
    prisma.supplierPayment.aggregate({
      where: { paidAt: { gte: monthStart, lt: monthEndExclusive } },
      _sum: { amountPaise: true },
    }),
    prisma.purchase.count({
      where: { paymentType: "CREDIT", dueAt: { lt: at } },
    }),
    prisma.orderLine.findMany({
      where: {
        order: {
          createdAt: { gte: monthStart, lt: monthEndExclusive },
          status: { not: "CANCELLED" },
        },
      },
      select: { payload: true },
    }),
    sumOrderConsumptionCostPaiseInRange(prisma, monthStart, monthEndExclusive),
    buildMenuCatalogRows(),
    loadStockValueRankRows(),
    sumVendorReceivablePaise(),
    sumSupplierPayablePaise(),
    buildVendorChartRows(monthStart, monthEndExclusive),
    (async () => {
      const opening = await ensureCashPoolSettings(prisma);
      return cashBalanceBefore(prisma, tomorrowStart, opening);
    })(),
    prisma.category.count({ where: { parentId: null } }),
    prisma.menuItem.count(),
    prisma.menuCombo.count(),
    prisma.menuGlobalAddon.count(),
  ]);

  const salariesPaise =
    payroll?.reduce(
      (sum, run) => sum + run.lines.reduce((s, l) => s + l.netPayPaise, 0),
      0,
    ) ?? 0;

  const soldByKey = new Map<string, { label: string; qty: number }>();
  for (const lineRow of monthOrderLines) {
    const line = migrateCartLine(lineRow.payload as unknown as CartLine);
    if (line.kind === "item") {
      const key = `item:${line.itemId}:${line.variation.id}`;
      const label = `${line.name}${line.variation.name ? ` • ${line.variation.name}` : ""}`;
      const prev = soldByKey.get(key) ?? { label, qty: 0 };
      soldByKey.set(key, {
        label: prev.label || label,
        qty: prev.qty + line.quantity,
      });
      continue;
    }
    if (line.kind === "combo") {
      const key = `combo:${line.comboId}`;
      const label = line.name || "Combo";
      const prev = soldByKey.get(key) ?? { label, qty: 0 };
      soldByKey.set(key, {
        label: prev.label || label,
        qty: prev.qty + line.quantity,
      });
    }
  }

  const kitchenUseCostPaise = monthKitchenUseAgg._sum.costPaise ?? 0;
  const recipeStockCostPaise = stockCostPaiseInt;
  const totalStockCostUsedPaise = recipeStockCostPaise + kitchenUseCostPaise;
  const capitalExpensesPaise = monthCapitalExpenseAgg._sum.amountPaise ?? 0;

  const monthSalesMinor = monthSalesAgg._sum.totalMinor ?? 0;
  const grossMarginPaise = monthSalesMinor - totalStockCostUsedPaise;
  const monthExpensesPaise = monthExpenseAgg._sum.amountPaise ?? 0;
  const netProfitPaise = grossMarginPaise - monthExpensesPaise - salariesPaise;

  const soldRows = mergeSalesIntoCatalog(catalog, soldByKey);
  const { top: topSelling, bottom: leastSelling } = splitTopBottom(soldRows);
  const { topByValue: topStockValue, lowestByValue: lowestStockValue } =
    splitStockValueRanks(stockValueRows);
  const {
    topVendorsBySales,
    bottomVendorsBySales,
    topVendorItemsByQty,
    bottomVendorItemsByQty,
  } = vendorCharts;

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
      cashAvailablePaise,
      todaySalesPaise: todaySalesAgg._sum.totalMinor ?? 0,
      monthSalesPaise: monthSalesMinor,
      todayExpensesPaise: todayExpenseAgg._sum.amountPaise ?? 0,
      monthExpensesPaise,
      capitalExpensesPaise,
      capitalExpenseEntryCount: monthCapitalExpenseAgg._count._all ?? 0,
      salariesPaise,
      stockCostUsedPaise: totalStockCostUsedPaise,
      recipeStockCostPaise,
      kitchenUseCostPaise,
      kitchenUseEntryCount: monthKitchenUseAgg._count._all ?? 0,
      grossMarginPaise,
      netProfitPaise,
      todayOrdersCount: todaySalesAgg._count._all ?? 0,
      monthOrdersCount: monthSalesAgg._count._all ?? 0,
      todayVendorSalesPaise: todayVendorSalesAgg._sum.totalPaise ?? 0,
      todayVendorSalesCount: todayVendorSalesAgg._count._all ?? 0,
      monthVendorSalesPaise: monthVendorSalesAgg._sum.totalPaise ?? 0,
      monthVendorSalesCount: monthVendorSalesAgg._count._all ?? 0,
      vendorReceivablePaise,
      overdueVendorSalesCount,
      monthVendorPaymentsPaise: monthVendorPaymentsAgg._sum.amountPaise ?? 0,
      todayPurchasesPaise: todayPurchasesAgg._sum.totalPaise ?? 0,
      todayPurchasesCount: todayPurchasesAgg._count._all ?? 0,
      monthPurchasesPaise: monthPurchasesAgg._sum.totalPaise ?? 0,
      monthPurchasesCount: monthPurchasesAgg._count._all ?? 0,
      supplierPayablePaise,
      overduePurchasesCount,
      monthSupplierPaymentsPaise: monthSupplierPaymentsAgg._sum.amountPaise ?? 0,
    },
    menuCounts: {
      categories: categoryCount,
      items: itemCount,
      combos: comboCount,
      globalAddons: addonCount,
    },
    charts: {
      topSelling,
      leastSelling,
      topStockValue,
      lowestStockValue,
      topVendorsBySales,
      bottomVendorsBySales,
      topVendorItemsByQty,
      bottomVendorItemsByQty,
    },
  });
}
