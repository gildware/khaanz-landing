import { NextResponse } from "next/server";
import { Prisma, type WastageType } from "@prisma/client";

import { requireAdminInventorySession } from "@/lib/admin-inventory-session";
import { d } from "@/lib/inventory/decimal-utils";
import { wastageCostPaiseByEntryId } from "@/lib/inventory/fifo-cogs";
import { ensureInventorySettings } from "@/lib/inventory/inventory-settings";
import {
  istDateLabel,
  istDayKey,
  istStartOfMonth,
  istStartOfNextMonth,
  istStartOfPreviousMonth,
} from "@/lib/ist-dates";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

const CHART_ITEMS_LIMIT = 8;

const WASTAGE_TYPE_LABELS: Record<WastageType, string> = {
  SPOILAGE: "Spoiled / expired",
  PREPARATION: "Used in kitchen prep",
  OVERPRODUCTION: "Made too much",
  OTHER: "Other waste",
};

function resolveRange(preset: string): { from?: Date; toExclusive?: Date; label: string } {
  const now = new Date();
  if (preset === "all_time") {
    return { label: "All time" };
  }
  if (preset === "last_month") {
    return {
      from: istStartOfPreviousMonth(now),
      toExclusive: istStartOfMonth(now),
      label: "Last month",
    };
  }
  return {
    from: istStartOfMonth(now),
    toExclusive: istStartOfNextMonth(now),
    label: "This month",
  };
}

function lineCostPaise(qtyBase: Prisma.Decimal, rate: Prisma.Decimal): number {
  return Math.round(Number(qtyBase.mul(rate).toString()));
}

export async function GET(request: Request) {
  const session = await requireAdminInventorySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const preset = url.searchParams.get("preset") ?? "this_month";
  const range = resolveRange(preset);

  const wastedAtFilter =
    range.from && range.toExclusive
      ? { gte: range.from, lt: range.toExclusive }
      : undefined;

  const prisma = getPrisma();
  const invSettings = await ensureInventorySettings(prisma);

  const [ingredientRows, dishRows] = await Promise.all([
    prisma.wastageEntry.findMany({
      where: wastedAtFilter ? { wastedAt: wastedAtFilter } : undefined,
      select: {
        id: true,
        wastedAt: true,
        qtyBase: true,
        wastageType: true,
        menuWastageEntryId: true,
        item: {
          select: {
            id: true,
            name: true,
            baseUnit: true,
            avgCostPaisePerBase: true,
            lastPurchasePaisePerBase: true,
          },
        },
      },
    }),
    prisma.menuWastageEntry.findMany({
      where: wastedAtFilter ? { wastedAt: wastedAtFilter } : undefined,
      select: {
        wastedAt: true,
        quantity: true,
        menuItem: { select: { name: true } },
        variation: { select: { name: true } },
        ingredients: {
          select: {
            id: true,
            qtyBase: true,
            item: {
              select: {
                avgCostPaisePerBase: true,
                lastPurchasePaisePerBase: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const unitRate = (item: {
    avgCostPaisePerBase: Prisma.Decimal;
    lastPurchasePaisePerBase: Prisma.Decimal;
  }): Prisma.Decimal =>
    invSettings.costingMethod === "LATEST_PURCHASE"
      ? item.lastPurchasePaisePerBase
      : item.avgCostPaisePerBase;

  const fifoCosts =
    invSettings.costingMethod === "FIFO"
      ? await prisma.$transaction((tx) =>
          wastageCostPaiseByEntryId(
            tx,
            ingredientRows.map((w) => w.id),
            new Map(
              ingredientRows.map((w) => [w.item.id, w.item.avgCostPaisePerBase]),
            ),
          ),
        )
      : null;

  const wastageByItem = new Map<
    string,
    { name: string; baseUnit: string; qtyBase: ReturnType<typeof d>; costPaise: number }
  >();
  const wastageByType = new Map<
    WastageType,
    { label: string; costPaise: number; entryCount: number }
  >();

  let totalCostPaise = 0;
  let ingredientCostPaise = 0;
  let dishCostPaise = 0;
  let ingredientEntryCount = 0;
  const dailyCost = new Map<string, { date: string; label: string; costPaise: number }>();

  const addDailyCost = (at: Date, cost: number) => {
    const date = istDayKey(at);
    const prev = dailyCost.get(date) ?? {
      date,
      label: istDateLabel(at),
      costPaise: 0,
    };
    dailyCost.set(date, { ...prev, costPaise: prev.costPaise + cost });
  };

  for (const w of ingredientRows) {
    const cost =
      fifoCosts?.get(w.id) ?? lineCostPaise(w.qtyBase, unitRate(w.item));
    totalCostPaise += cost;
    addDailyCost(w.wastedAt, cost);

    if (w.menuWastageEntryId) {
      dishCostPaise += cost;
    } else {
      ingredientCostPaise += cost;
      ingredientEntryCount += 1;
    }

    const typePrev = wastageByType.get(w.wastageType) ?? {
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
      name: w.item.name,
      baseUnit: w.item.baseUnit,
      qtyBase: d(0),
      costPaise: 0,
    };
    wastageByItem.set(w.item.id, {
      name: w.item.name,
      baseUnit: w.item.baseUnit,
      qtyBase: prev.qtyBase.add(w.qtyBase),
      costPaise: prev.costPaise + cost,
    });
  }

  const menuWastageByDish = new Map<
    string,
    { label: string; qty: ReturnType<typeof d>; costPaise: number; entryCount: number }
  >();

  for (const mw of dishRows) {
    let costPaise = 0;
    for (const ing of mw.ingredients) {
      costPaise +=
        fifoCosts?.get(ing.id) ??
        lineCostPaise(ing.qtyBase, unitRate(ing.item));
    }
    // Ingredient loop already counted these in dailyCost; skip double-add under FIFO
    // when ingredient rows are present. Keep prior behavior for avg/latest.
    if (invSettings.costingMethod !== "FIFO") {
      addDailyCost(mw.wastedAt, costPaise);
    }
    const key = `${mw.menuItem.name}:${mw.variation.name}`;
    const label = `${mw.menuItem.name} · ${mw.variation.name}`;
    const prev = menuWastageByDish.get(key) ?? {
      label,
      qty: d(0),
      costPaise: 0,
      entryCount: 0,
    };
    menuWastageByDish.set(key, {
      label,
      qty: prev.qty.add(mw.quantity),
      costPaise: prev.costPaise + costPaise,
      entryCount: prev.entryCount + 1,
    });
  }

  const topIngredient = [...wastageByItem.values()].sort((a, b) => b.costPaise - a.costPaise)[0];
  const topDish = [...menuWastageByDish.values()].sort((a, b) => b.costPaise - a.costPaise)[0];
  const topReason = [...wastageByType.values()].sort((a, b) => b.costPaise - a.costPaise)[0];

  const dishEntryCount = dishRows.length;

  const byType = [...wastageByType.values()]
    .sort((a, b) => b.costPaise - a.costPaise)
    .map((r) => ({
      type: r.label,
      label: r.label,
      costPaise: r.costPaise,
      entryCount: r.entryCount,
    }));

  const byItem = [...wastageByItem.values()]
    .sort((a, b) => b.costPaise - a.costPaise)
    .slice(0, CHART_ITEMS_LIMIT)
    .map((r) => ({
      key: r.name,
      label: r.name,
      qtyBase: r.qtyBase.toString(),
      baseUnit: r.baseUnit,
      costPaise: r.costPaise,
    }));

  const byDish = [...menuWastageByDish.values()]
    .sort((a, b) => b.costPaise - a.costPaise)
    .slice(0, CHART_ITEMS_LIMIT)
    .map((r) => ({
      label: r.label,
      qty: r.qty.toString(),
      costPaise: r.costPaise,
      entryCount: r.entryCount,
    }));

  const daily = [...dailyCost.values()].sort((a, b) => a.date.localeCompare(b.date));

  const split = [
    { key: "ingredient", label: "Ingredient", costPaise: ingredientCostPaise },
    { key: "dish", label: "Dish (recipe cost)", costPaise: dishCostPaise },
  ].filter((r) => r.costPaise > 0);

  return NextResponse.json({
    range: { preset, label: range.label },
    kpis: {
      totalCostPaise,
      ingredientCostPaise,
      dishCostPaise,
      totalEntryCount: ingredientEntryCount + dishEntryCount,
      ingredientEntryCount,
      dishEntryCount,
    },
    topIngredient: topIngredient
      ? {
          name: topIngredient.name,
          qtyBase: topIngredient.qtyBase.toString(),
          baseUnit: topIngredient.baseUnit,
          costPaise: topIngredient.costPaise,
        }
      : null,
    topDish: topDish
      ? {
          label: topDish.label,
          qty: topDish.qty.toString(),
          costPaise: topDish.costPaise,
          entryCount: topDish.entryCount,
        }
      : null,
    topReason: topReason
      ? {
          label: topReason.label,
          costPaise: topReason.costPaise,
          entryCount: topReason.entryCount,
        }
      : null,
    costingNote:
      invSettings.costingMethod === "LATEST_PURCHASE"
        ? "Valued at latest purchase cost"
        : invSettings.costingMethod === "FIFO"
          ? "Valued at FIFO batch cost (oldest stock first)"
          : "Valued at moving average cost",
    charts: {
      byType,
      byItem,
      byDish,
      daily,
      split,
    },
  });
}
