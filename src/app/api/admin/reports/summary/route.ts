import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { Prisma, type PersonalUseKind, type WastageType } from "@prisma/client";

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
  formatIstHourLabel,
  istDateLabel,
  istDayKey,
  istHourFromDate,
  istMonthKeysInRange,
  istStartOfDay,
  istStartOfMonth,
  istStartOfNextMonth,
  istStartOfPreviousMonth,
  parseIstDateInput,
} from "@/lib/ist-dates";
import { readMenuPayload } from "@/lib/menu-repository";
import { getPrisma } from "@/lib/prisma";
import { computeDaySalariesPaise } from "@/lib/reports/day-salaries";
import { readRestaurantSettings } from "@/lib/settings-repository";
import type { CartLine } from "@/types/menu";

export const runtime = "nodejs";

type SalesRow = { key: string; label: string; qty: number; revenuePaise: number };
type CategoryExpenseRow = { key: string; label: string; group: string; totalPaise: number };
type WastageRow = { key: string; label: string; qtyBase: string; costPaise: number };
type WastageTypeRow = { type: string; label: string; costPaise: number; entryCount: number };
type MenuWastageRow = {
  key: string;
  label: string;
  qty: string;
  costPaise: number;
  entryCount: number;
};
type PersonalKindRow = {
  kind: PersonalUseKind;
  label: string;
  totalPaise: number;
  entryCount: number;
};
type BusinessGroupRow = { group: string; totalPaise: number; entryCount: number };
type DailyOutflowRow = {
  date: string;
  label: string;
  businessPaise: number;
  personalPaise: number;
};
type DailySalesRow = { date: string; label: string; salesPaise: number; orderCount: number };
type HourlySalesRow = { hour: number; label: string; salesPaise: number; orderCount: number };
type PaymentRow = { key: string; label: string; salesPaise: number; orderCount: number };

const CHART_ITEMS_LIMIT = 8;
const WASTAGE_ITEMS_LIMIT = 20;

const WASTAGE_TYPE_LABELS: Record<WastageType, string> = {
  SPOILAGE: "Spoiled / expired",
  PREPARATION: "Used in kitchen prep",
  OVERPRODUCTION: "Made too much",
  OTHER: "Other waste",
};

const PERSONAL_KIND_LABELS: Record<PersonalUseKind, string> = {
  CASH: "Cash",
  STOCK: "Stock",
  ORDER: "Menu items",
  OTHER: "Other",
};

function splitTopBottom(rows: SalesRow[]) {
  const sorted = [...rows].sort(
    (a, b) => b.qty - a.qty || b.revenuePaise - a.revenuePaise || a.label.localeCompare(b.label),
  );
  const withSales = sorted.filter((r) => r.qty > 0);
  const zeroSalesAll = sorted.filter((r) => r.qty === 0);
  return {
    top: withSales.slice(0, CHART_ITEMS_LIMIT),
    bottom: [...withSales].reverse().slice(0, CHART_ITEMS_LIMIT),
    zeroSales: zeroSalesAll.slice(0, CHART_ITEMS_LIMIT),
  };
}

function resolveRange(url: URL): { from: Date; toExclusive: Date; label: string } | { error: string } {
  const preset = url.searchParams.get("preset") ?? "this_month";
  const now = new Date();

  if (preset === "this_month") {
    const from = istStartOfMonth(now);
    const toExclusive = istStartOfNextMonth(now);
    return { from, toExclusive, label: "This month" };
  }

  if (preset === "last_month") {
    const from = istStartOfPreviousMonth(now);
    const toExclusive = istStartOfMonth(now);
    return { from, toExclusive, label: "Last month" };
  }

  if (preset === "day") {
    const dateStr = url.searchParams.get("date") ?? formatIstDateInput(now);
    const from = parseIstDateInput(dateStr);
    if (!from) {
      return { error: "Invalid date (YYYY-MM-DD)" };
    }
    const toExclusive = new Date(from.getTime() + 24 * 60 * 60 * 1000);
    return { from, toExclusive, label: istDateLabel(from) };
  }

  if (preset === "custom") {
    const fromStr = url.searchParams.get("from");
    const toStr = url.searchParams.get("to");
    if (!fromStr || !toStr) {
      return { error: "from and to required for custom preset (YYYY-MM-DD)" };
    }
    const from = parseIstDateInput(fromStr);
    const toStart = parseIstDateInput(toStr);
    if (!from || !toStart) {
      return { error: "Invalid from or to date" };
    }
    const toExclusive = new Date(toStart.getTime() + 24 * 60 * 60 * 1000);
    if (toExclusive <= from) {
      return { error: "to must be on or after from" };
    }
    const label =
      formatIstDateInput(from) === formatIstDateInput(toStart)
        ? istDateLabel(from)
        : `${formatIstDateInput(from)} – ${formatIstDateInput(toStart)}`;
    return { from, toExclusive, label };
  }

  return { error: "Invalid preset. Use this_month, last_month, day, or custom." };
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isSingleDayRange(from: Date, toExclusive: Date): boolean {
  return toExclusive.getTime() - from.getTime() === MS_PER_DAY;
}

async function buildMenuCatalogRows(): Promise<SalesRow[]> {
  const menu = await readMenuPayload();
  const rows: SalesRow[] = [];

  for (const item of menu.items) {
    for (const v of item.variations) {
      rows.push({
        key: `item:${item.id}:${v.id}`,
        label: `${item.name}${v.name ? ` • ${v.name}` : ""}`,
        qty: 0,
        revenuePaise: 0,
      });
    }
  }
  for (const combo of menu.combos) {
    rows.push({
      key: `combo:${combo.id}`,
      label: combo.name || "Combo",
      qty: 0,
      revenuePaise: 0,
    });
  }
  return rows;
}

function mergeSalesIntoCatalog(
  catalog: SalesRow[],
  soldByKey: Map<string, { label: string; qty: number; revenuePaise: number }>,
) {
  const byKey = new Map(catalog.map((r) => [r.key, r]));
  for (const [key, sold] of soldByKey) {
    const row = byKey.get(key);
    if (row) {
      row.qty = sold.qty;
      row.revenuePaise = sold.revenuePaise;
      if (sold.label) row.label = sold.label;
    } else {
      byKey.set(key, { key, label: sold.label, qty: sold.qty, revenuePaise: sold.revenuePaise });
    }
  }
  return [...byKey.values()];
}

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const session = await verifyAdminToken(cookieStore.get(ADMIN_TOKEN_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const range = resolveRange(url);
  if ("error" in range) {
    return NextResponse.json({ error: range.error }, { status: 400 });
  }

  const { from, toExclusive, label: rangeLabel } = range;
  const prisma = getPrisma();

  const [
    salesAgg,
    expenseAgg,
    capitalExpenseAgg,
    kitchenUseAgg,
    vendorSalesAgg,
    vendorPaymentsAgg,
    expenseEntries,
    wastageEntries,
    menuWastageEntries,
    personalUseEntries,
    settings,
  ] = await Promise.all([
    prisma.order.aggregate({
      where: {
        createdAt: { gte: from, lt: toExclusive },
        status: { not: "CANCELLED" },
      },
      _sum: { totalMinor: true },
      _count: { _all: true },
    }),
    prisma.expenseEntry.aggregate({
      where: {
        occurredAt: { gte: from, lt: toExclusive },
        kind: "OPERATING",
      },
      _sum: { amountPaise: true },
      _count: { _all: true },
    }),
    prisma.expenseEntry.aggregate({
      where: {
        occurredAt: { gte: from, lt: toExclusive },
        kind: "CAPITAL",
      },
      _sum: { amountPaise: true },
      _count: { _all: true },
    }),
    prisma.kitchenUseEntry.aggregate({
      where: { usedAt: { gte: from, lt: toExclusive } },
      _sum: { costPaise: true },
      _count: { _all: true },
    }),
    prisma.vendorSale.aggregate({
      where: { soldAt: { gte: from, lt: toExclusive } },
      _sum: { totalPaise: true },
      _count: { _all: true },
    }),
    prisma.vendorPayment.aggregate({
      where: { paidAt: { gte: from, lt: toExclusive } },
      _sum: { amountPaise: true },
    }),
    prisma.expenseEntry.findMany({
      where: {
        occurredAt: { gte: from, lt: toExclusive },
        kind: "OPERATING",
      },
      select: {
        amountPaise: true,
        occurredAt: true,
        category: { select: { id: true, name: true, group: true } },
      },
    }),
    prisma.wastageEntry.findMany({
      where: { wastedAt: { gte: from, lt: toExclusive } },
      select: {
        id: true,
        qtyBase: true,
        wastageType: true,
        menuWastageEntryId: true,
        wastedAt: true,
        item: { select: { id: true, name: true, avgCostPaisePerBase: true } },
      },
    }),
    prisma.menuWastageEntry.findMany({
      where: { wastedAt: { gte: from, lt: toExclusive } },
      select: {
        id: true,
        quantity: true,
        menuItem: { select: { id: true, name: true } },
        variation: { select: { name: true } },
        ingredients: {
          select: {
            qtyBase: true,
            item: { select: { avgCostPaisePerBase: true } },
          },
        },
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
    readRestaurantSettings(),
  ]);

  let salariesPaise = 0;
  let salariesSubtitle: "day_rates" | "payroll_runs" = "payroll_runs";
  let salariesStaffCount: number | null = null;

  if (isSingleDayRange(from, toExclusive)) {
    const daySalary = await computeDaySalariesPaise(prisma, istDayKey(from));
    salariesPaise = daySalary.salariesPaise;
    salariesSubtitle = "day_rates";
    salariesStaffCount = daySalary.chargedStaffCount;
  } else {
    const monthKeys = istMonthKeysInRange(from, toExclusive);
    const payrollRuns =
      monthKeys.length > 0
        ? await prisma.payrollRun.findMany({
            where: { monthKey: { in: monthKeys } },
            select: { lines: { select: { netPayPaise: true } } },
          })
        : [];
    salariesPaise = payrollRuns.reduce(
      (sum, run) => sum + run.lines.reduce((s, l) => s + l.netPayPaise, 0),
      0,
    );
  }

  const orders = await prisma.order.findMany({
    where: {
      createdAt: { gte: from, lt: toExclusive },
      status: { not: "CANCELLED" },
    },
    select: {
      id: true,
      createdAt: true,
      totalMinor: true,
      paymentMethod: true,
      lines: { orderBy: { sortIndex: "asc" }, select: { payload: true } },
    },
  });

  const soldByKey = new Map<string, { label: string; qty: number; revenuePaise: number }>();
  const periodConsumption = new Map<string, Prisma.Decimal>();
  const dailyMap = new Map<string, DailySalesRow>();
  const hourlyMap = new Map<number, HourlySalesRow>();
  const paymentMap = new Map<string, PaymentRow>();

  const paymentLabels = new Map(settings.paymentMethods.map((p) => [p.id, p.name] as const));

  await prisma.$transaction(async (tx) => {
    for (const o of orders) {
      const dayKey = istDayKey(o.createdAt);
      const dayPrev = dailyMap.get(dayKey) ?? {
        date: dayKey,
        label: istDateLabel(o.createdAt),
        salesPaise: 0,
        orderCount: 0,
      };
      dailyMap.set(dayKey, {
        ...dayPrev,
        salesPaise: dayPrev.salesPaise + o.totalMinor,
        orderCount: dayPrev.orderCount + 1,
      });

      const hour = istHourFromDate(o.createdAt);
      const hourPrev = hourlyMap.get(hour) ?? {
        hour,
        label: formatIstHourLabel(hour),
        salesPaise: 0,
        orderCount: 0,
      };
      hourlyMap.set(hour, {
        ...hourPrev,
        salesPaise: hourPrev.salesPaise + o.totalMinor,
        orderCount: hourPrev.orderCount + 1,
      });

      const pmKey = (o.paymentMethod || "").trim() || "unknown";
      const pmPrev = paymentMap.get(pmKey) ?? {
        key: pmKey,
        label:
          pmKey === "unknown"
            ? "Not recorded"
            : paymentLabels.get(pmKey) || pmKey || "Not recorded",
        salesPaise: 0,
        orderCount: 0,
      };
      paymentMap.set(pmKey, {
        ...pmPrev,
        salesPaise: pmPrev.salesPaise + o.totalMinor,
        orderCount: pmPrev.orderCount + 1,
      });

      const lines: CartLine[] = o.lines.map((l) =>
        migrateCartLine(l.payload as unknown as CartLine),
      );

      for (const line of lines) {
        let key: string;
        let label: string;
        let qty: number;
        let revenuePaise: number;

        if (line.kind === "item") {
          key = `item:${line.itemId}:${line.variation.id}`;
          label = `${line.name}${line.variation.name ? ` • ${line.variation.name}` : ""}`;
          qty = line.quantity;
          revenuePaise = Math.round(line.unitPrice * line.quantity * 100);
        } else if (line.kind === "combo") {
          key = `combo:${line.comboId}`;
          label = line.name || "Combo";
          qty = line.quantity;
          revenuePaise = Math.round(line.unitPrice * line.quantity * 100);
        } else {
          key = `open:${line.name.toLowerCase()}`;
          label = `${line.name} (Open)`;
          qty = line.quantity;
          revenuePaise = Math.round(line.unitPrice * line.quantity * 100);
        }

        const prev = soldByKey.get(key) ?? { label, qty: 0, revenuePaise: 0 };
        soldByKey.set(key, {
          label: prev.label || label,
          qty: prev.qty + qty,
          revenuePaise: prev.revenuePaise + revenuePaise,
        });
      }

      const consumption = await planOrderConsumption(tx, { lines }, o.createdAt);
      for (const [inventoryItemId, qtyBase] of consumption.entries()) {
        periodConsumption.set(
          inventoryItemId,
          (periodConsumption.get(inventoryItemId) ?? d(0)).add(qtyBase),
        );
      }
    }
  });

  const invIds = [...periodConsumption.keys()];
  const invMeta =
    invIds.length === 0
      ? []
      : await prisma.inventoryItem.findMany({
          where: { id: { in: invIds } },
          select: { id: true, avgCostPaisePerBase: true },
        });
  const costById = new Map(invMeta.map((i) => [i.id, i.avgCostPaisePerBase]));

  let stockCostPaise = new Prisma.Decimal(0);
  for (const [id, qtyBase] of periodConsumption.entries()) {
    const rate = costById.get(id) ?? d(0);
    stockCostPaise = stockCostPaise.add(qtyBase.mul(rate));
  }
  const stockCostPaiseInt = Math.round(Number(stockCostPaise.toString()));
  const kitchenUseCostPaise = kitchenUseAgg._sum.costPaise ?? 0;
  const recipeStockCostPaise = stockCostPaiseInt;
  const totalStockCostUsedPaise = recipeStockCostPaise + kitchenUseCostPaise;

  const salesPaise = salesAgg._sum.totalMinor ?? 0;
  const orderCount = salesAgg._count._all ?? 0;
  const expensesPaise = expenseAgg._sum.amountPaise ?? 0;
  const capitalExpensesPaise = capitalExpenseAgg._sum.amountPaise ?? 0;
  const grossMarginPaise = salesPaise - totalStockCostUsedPaise;
  const netProfitPaise = grossMarginPaise - expensesPaise - salariesPaise;

  const personalByKind = new Map<
    PersonalUseKind,
    { totalPaise: number; entryCount: number }
  >();
  const dailyOutflowMap = new Map<string, DailyOutflowRow>();

  for (const p of personalUseEntries) {
    let worth = 0;
    if (p.kind === "CASH" || p.kind === "OTHER") {
      worth = p.cashAmountPaise;
    } else if (p.kind === "STOCK") {
      worth = computeStockWorthPaise([
        { qtyBase: p.qtyBase, item: p.item },
      ]);
    } else if (p.kind === "ORDER") {
      worth = computeOrderWorthPaise([
        {
          qtyBase: p.qtyBase,
          variation: p.variation,
          order: p.order,
        },
      ]);
    }

    const prev = personalByKind.get(p.kind) ?? { totalPaise: 0, entryCount: 0 };
    personalByKind.set(p.kind, {
      totalPaise: prev.totalPaise + worth,
      entryCount: prev.entryCount + 1,
    });

    const dayKey = istDayKey(p.occurredAt);
    const dayPrev = dailyOutflowMap.get(dayKey) ?? {
      date: dayKey,
      label: istDateLabel(p.occurredAt),
      businessPaise: 0,
      personalPaise: 0,
    };
    dailyOutflowMap.set(dayKey, {
      ...dayPrev,
      personalPaise: dayPrev.personalPaise + worth,
    });
  }

  const personalKindRows: PersonalKindRow[] = (
    ["CASH", "STOCK", "ORDER", "OTHER"] as PersonalUseKind[]
  ).map((kind) => {
    const row = personalByKind.get(kind);
    return {
      kind,
      label: PERSONAL_KIND_LABELS[kind],
      totalPaise: row?.totalPaise ?? 0,
      entryCount: row?.entryCount ?? 0,
    };
  });

  const personalUsePaise = personalKindRows.reduce((s, r) => s + r.totalPaise, 0);
  const personalEntryCount = personalUseEntries.length;

  const wastageByItem = new Map<string, WastageRow>();
  const wastageByType = new Map<WastageType, WastageTypeRow>();
  let wastageCostPaise = 0;
  let ingredientOnlyCostPaise = 0;
  let dishLinkedCostPaise = 0;
  let ingredientOnlyEntryCount = 0;

  for (const w of wastageEntries) {
    const qty = w.qtyBase;
    const cost = Math.round(Number(qty.mul(w.item.avgCostPaisePerBase).toString()));
    wastageCostPaise += cost;

    if (w.menuWastageEntryId) {
      dishLinkedCostPaise += cost;
    } else {
      ingredientOnlyCostPaise += cost;
      ingredientOnlyEntryCount += 1;
    }

    const typePrev = wastageByType.get(w.wastageType) ?? {
      type: w.wastageType,
      label: WASTAGE_TYPE_LABELS[w.wastageType],
      costPaise: 0,
      entryCount: 0,
    };
    wastageByType.set(w.wastageType, {
      ...typePrev,
      costPaise: typePrev.costPaise + cost,
      entryCount: typePrev.entryCount + 1,
    });

    const prev = wastageByItem.get(w.item.id) ?? {
      key: w.item.id,
      label: w.item.name,
      qtyBase: "0",
      costPaise: 0,
    };
    const newQty = d(prev.qtyBase).add(qty);
    wastageByItem.set(w.item.id, {
      key: w.item.id,
      label: w.item.name,
      qtyBase: newQty.toString(),
      costPaise: prev.costPaise + cost,
    });
  }
  const wastageRows = [...wastageByItem.values()].sort((a, b) => b.costPaise - a.costPaise);
  const wastageTypeRows = [...wastageByType.values()].sort((a, b) => b.costPaise - a.costPaise);

  const menuWastageByDish = new Map<string, MenuWastageRow>();
  for (const mw of menuWastageEntries) {
    let costPaise = 0;
    for (const ing of mw.ingredients) {
      costPaise += Math.round(
        Number(ing.qtyBase.mul(ing.item.avgCostPaisePerBase).toString()),
      );
    }
    const key = `${mw.menuItem.id}:${mw.variation.name}`;
    const label = `${mw.menuItem.name} · ${mw.variation.name}`;
    const prev = menuWastageByDish.get(key) ?? {
      key,
      label,
      qty: "0",
      costPaise: 0,
      entryCount: 0,
    };
    menuWastageByDish.set(key, {
      key,
      label,
      qty: d(prev.qty).add(mw.quantity).toString(),
      costPaise: prev.costPaise + costPaise,
      entryCount: prev.entryCount + 1,
    });
  }
  const menuWastageRows = [...menuWastageByDish.values()].sort(
    (a, b) => b.costPaise - a.costPaise,
  );

  const expenseByCategory = new Map<string, CategoryExpenseRow>();
  const expenseByGroupCounts = new Map<string, number>();
  for (const e of expenseEntries) {
    const prev = expenseByCategory.get(e.category.id) ?? {
      key: e.category.id,
      label: e.category.name,
      group: e.category.group,
      totalPaise: 0,
    };
    expenseByCategory.set(e.category.id, {
      ...prev,
      totalPaise: prev.totalPaise + e.amountPaise,
    });
    expenseByGroupCounts.set(
      e.category.group,
      (expenseByGroupCounts.get(e.category.group) ?? 0) + 1,
    );

    const dayKey = istDayKey(e.occurredAt);
    const dayPrev = dailyOutflowMap.get(dayKey) ?? {
      date: dayKey,
      label: istDateLabel(e.occurredAt),
      businessPaise: 0,
      personalPaise: 0,
    };
    dailyOutflowMap.set(dayKey, {
      ...dayPrev,
      businessPaise: dayPrev.businessPaise + e.amountPaise,
    });
  }
  const expenseCategoryRows = [...expenseByCategory.values()].sort(
    (a, b) => b.totalPaise - a.totalPaise,
  );

  const expenseByGroup = new Map<string, number>();
  for (const row of expenseCategoryRows) {
    expenseByGroup.set(row.group, (expenseByGroup.get(row.group) ?? 0) + row.totalPaise);
  }

  const businessGroupRows: BusinessGroupRow[] = [...expenseByGroup.entries()]
    .map(([group, totalPaise]) => ({
      group,
      totalPaise,
      entryCount: expenseByGroupCounts.get(group) ?? 0,
    }))
    .sort((a, b) => b.totalPaise - a.totalPaise);

  const dailyOutflow = [...dailyOutflowMap.values()].sort((a, b) =>
    a.date.localeCompare(b.date),
  );

  const catalog = await buildMenuCatalogRows();
  const soldRows = mergeSalesIntoCatalog(catalog, soldByKey);
  const { top: topSelling, bottom: leastSelling, zeroSales } = splitTopBottom(soldRows);

  const dailySales = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date));
  const hourlySales = [...hourlyMap.values()].sort((a, b) => a.hour - b.hour);
  const paymentMethods = [...paymentMap.values()].sort((a, b) => b.salesPaise - a.salesPaise);

  const averageTicketPaise = orderCount > 0 ? Math.round(salesPaise / orderCount) : 0;

  return NextResponse.json({
    range: {
      label: rangeLabel,
      from: from.toISOString(),
      toExclusive: toExclusive.toISOString(),
      preset: url.searchParams.get("preset") ?? "this_month",
    },
    kpis: {
      salesPaise,
      orderCount,
      averageTicketPaise,
      expensesPaise,
      expenseEntryCount: expenseAgg._count._all ?? 0,
      salariesPaise,
      salariesSource: salariesSubtitle,
      salariesStaffCount,
      stockCostUsedPaise: totalStockCostUsedPaise,
      recipeStockCostPaise,
      kitchenUseCostPaise,
      kitchenUseEntryCount: kitchenUseAgg._count._all ?? 0,
      capitalExpensesPaise,
      capitalExpenseEntryCount: capitalExpenseAgg._count._all ?? 0,
      grossMarginPaise,
      netProfitPaise,
      wastageCostPaise,
      wastageEntryCount: wastageEntries.length,
      menuWastageCount: menuWastageEntries.length,
      ingredientOnlyCostPaise,
      ingredientOnlyEntryCount,
      dishLinkedCostPaise,
      personalUsePaise,
      personalEntryCount,
      vendorSalesPaise: vendorSalesAgg._sum.totalPaise ?? 0,
      vendorSalesCount: vendorSalesAgg._count._all ?? 0,
      vendorPaymentsPaise: vendorPaymentsAgg._sum.amountPaise ?? 0,
    },
    charts: {
      dailySales,
      hourlySales,
      topSelling,
      leastSelling,
      zeroSales,
      expenseCategories: expenseCategoryRows,
      expenseGroups: [...expenseByGroup.entries()].map(([group, totalPaise]) => ({
        group,
        totalPaise,
      })),
      businessGroups: businessGroupRows,
      personalByKind: personalKindRows,
      dailyOutflow,
      wastageItems: wastageRows.slice(0, WASTAGE_ITEMS_LIMIT),
      wastageByType: wastageTypeRows,
      menuWastageDishes: menuWastageRows.slice(0, WASTAGE_ITEMS_LIMIT),
      paymentMethods,
    },
  });
}
