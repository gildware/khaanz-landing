import { NextResponse } from "next/server";

import { requireAdminInventorySession } from "@/lib/admin-inventory-session";
import {
  itemUnitCostPaisePerBase,
  onHandValuesFifoPaiseByItem,
} from "@/lib/inventory/inventory-costing";
import { ensureInventorySettings } from "@/lib/inventory/inventory-settings";
import {
  decimalToPaiseInt,
  splitStockValueRanks,
  STOCK_VALUE_CHART_LIMIT,
  type StockValueRankRow,
} from "@/lib/inventory/stock-value-charts";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

type ExpiryBatchRow = {
  batchId: string;
  inventoryItemId: string;
  itemName: string;
  baseUnit: string;
  expiryDate: string;
  receivedAt: string;
  lotCode: string;
  remainingQtyBase: string;
};

export async function GET(request: Request) {
  const session = await requireAdminInventorySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const fromStr = url.searchParams.get("from");
  const toStr = url.searchParams.get("to");
  const from = fromStr ? new Date(fromStr) : null;
  const to = toStr ? new Date(toStr) : null;
  const expiryDays = Math.max(
    0,
    Math.floor(Number(url.searchParams.get("expiryDays") ?? "7")),
  );

  const prisma = getPrisma();
  const now = new Date();
  const expiryCutoff = new Date(
    now.getTime() + expiryDays * 24 * 60 * 60 * 1000,
  );
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    invSettings,
    items,
    activeSuppliersCount,
    expiredBatchesCount,
    nearExpiryBatchesCount,
    expiryPreviewRows,
    ledgerAgg,
    allSuppliers,
    overduePurchases,
    movementAgg,
    rangedMovements,
  ] = await Promise.all([
    ensureInventorySettings(prisma),
    prisma.inventoryItem.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        category: true,
        baseUnit: true,
        stockOnHandBase: true,
        minStockBase: true,
        avgCostPaisePerBase: true,
        lastPurchasePaisePerBase: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.supplier.count({ where: { active: true } }),
    prisma.inventoryBatch.count({
      where: {
        remainingQtyBase: { gt: 0 },
        expiryDate: { lt: now },
      },
    }),
    prisma.inventoryBatch.count({
      where: {
        remainingQtyBase: { gt: 0 },
        expiryDate: { gte: now, lte: expiryCutoff },
      },
    }),
    prisma.inventoryBatch.findMany({
      where: {
        remainingQtyBase: { gt: 0 },
        expiryDate: { not: null, lte: expiryCutoff },
      },
      orderBy: [{ expiryDate: "asc" }, { receivedAt: "asc" }],
      take: 40,
      select: {
        id: true,
        inventoryItemId: true,
        expiryDate: true,
        receivedAt: true,
        lotCode: true,
        remainingQtyBase: true,
        item: { select: { name: true, baseUnit: true } },
      },
    }),
    prisma.supplierLedgerEntry.groupBy({
      by: ["supplierId"],
      _sum: { debitPaise: true, creditPaise: true },
    }),
    prisma.supplier.findMany({
      select: { id: true, name: true },
    }),
    prisma.purchase.findMany({
      where: {
        paymentType: "CREDIT",
        dueAt: { lt: now },
      },
      orderBy: { dueAt: "asc" },
      take: 50,
      select: {
        id: true,
        batchRef: true,
        totalPaise: true,
        dueAt: true,
        purchasedAt: true,
        supplier: { select: { name: true } },
      },
    }),
    prisma.inventoryMovement.groupBy({
      by: ["type"],
      where: { occurredAt: { gte: thirtyDaysAgo } },
      _count: { id: true },
    }),
    from && to && !Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime())
      ? prisma.inventoryMovement.groupBy({
          by: ["type"],
          where: { occurredAt: { gte: from, lte: to } },
          _count: { id: true },
        })
      : Promise.resolve(null),
  ]);

  let stockValueRows: StockValueRankRow[];
  if (invSettings.costingMethod === "FIFO") {
    const values = await onHandValuesFifoPaiseByItem(
      prisma,
      items.map((i) => i.id),
    );
    stockValueRows = items.map((item) => ({
      key: item.id,
      label: item.name,
      valuePaise: values.get(item.id) ?? 0,
    }));
  } else {
    stockValueRows = items.map((item) => {
      const unit = itemUnitCostPaisePerBase(item, invSettings.costingMethod);
      return {
        key: item.id,
        label: item.name,
        valuePaise: decimalToPaiseInt(item.stockOnHandBase.mul(unit)),
      };
    });
  }

  const { topByValue, lowestByValue } = splitStockValueRanks(stockValueRows);

  const valueByKey = new Map(stockValueRows.map((r) => [r.key, r.valuePaise]));
  let totalInventoryValuePaise = 0;
  const valueByCategory = new Map<string, number>();

  for (const item of items) {
    const valuePaise = valueByKey.get(item.id) ?? 0;
    totalInventoryValuePaise += valuePaise;
    const cat = item.category.trim() || "Uncategorized";
    valueByCategory.set(cat, (valueByCategory.get(cat) ?? 0) + valuePaise);
  }

  const lowStock = items
    .filter((r) => r.stockOnHandBase.lessThan(r.minStockBase))
    .map((r) => ({
      id: r.id,
      name: r.name,
      baseUnit: r.baseUnit,
      stockOnHandBase: r.stockOnHandBase.toString(),
      minStockBase: r.minStockBase.toString(),
    }));

  const mapExpiry = (r: (typeof expiryPreviewRows)[number]): ExpiryBatchRow => ({
    batchId: r.id,
    inventoryItemId: r.inventoryItemId,
    itemName: r.item.name,
    baseUnit: r.item.baseUnit,
    expiryDate: r.expiryDate!.toISOString(),
    receivedAt: r.receivedAt.toISOString(),
    lotCode: r.lotCode,
    remainingQtyBase: r.remainingQtyBase.toString(),
  });

  const nowMs = now.getTime();
  const expiredPreview: ExpiryBatchRow[] = [];
  const nearExpiryPreview: ExpiryBatchRow[] = [];
  for (const r of expiryPreviewRows) {
    if (!r.expiryDate) continue;
    const row = mapExpiry(r);
    if (r.expiryDate.getTime() < nowMs) expiredPreview.push(row);
    else nearExpiryPreview.push(row);
  }

  const supplierName = new Map(allSuppliers.map((s) => [s.id, s.name]));

  const supplierBalances = ledgerAgg
    .map((g) => ({
      supplierId: g.supplierId,
      supplierName: supplierName.get(g.supplierId) ?? "",
      balancePaise: (g._sum.debitPaise ?? 0) - (g._sum.creditPaise ?? 0),
    }))
    .filter((r) => r.balancePaise !== 0)
    .sort((a, b) => b.balancePaise - a.balancePaise);

  const supplierPayablePaise = supplierBalances
    .filter((r) => r.balancePaise > 0)
    .reduce((sum, r) => sum + r.balancePaise, 0);

  const overduePurchasesPaise = overduePurchases.reduce(
    (s, p) => s + p.totalPaise,
    0,
  );

  const movementTypeLabels: Record<string, string> = {
    OPENING_STOCK: "Opening stock",
    PURCHASE_RECEIPT: "Purchases",
    PURCHASE_RETURN: "Purchase returns",
    POS_OR_WEB_SALE: "POS / web sales",
    VENDOR_SALE: "Vendor sales",
    ORDER_CANCEL_RESTORE: "Order cancel restore",
    ADJUSTMENT_UP: "Adjustment (in)",
    ADJUSTMENT_DOWN: "Adjustment (out)",
    AUDIT_SURPLUS: "Audit surplus",
    AUDIT_SHORTAGE: "Audit shortage",
    WASTAGE: "Wastage",
    KITCHEN_USE: "Kitchen use",
    STOCK_SALE: "Stock sales",
  };

  const movementsLast30Days = movementAgg
    .map((m) => ({
      type: m.type,
      label: movementTypeLabels[m.type] ?? m.type,
      count: m._count.id,
    }))
    .sort((a, b) => b.count - a.count);

  const movementCounts = rangedMovements
    ? Object.fromEntries(rangedMovements.map((m) => [m.type, m._count.id]))
    : null;

  const okStockCount = items.length - lowStock.length;

  const payablesRanked = supplierBalances
    .filter((r) => r.balancePaise > 0)
    .sort((a, b) => b.balancePaise - a.balancePaise);
  const topSupplierPayables = payablesRanked.slice(0, STOCK_VALUE_CHART_LIMIT);
  const lowestSupplierPayables = [...payablesRanked]
    .reverse()
    .slice(0, STOCK_VALUE_CHART_LIMIT);

  return NextResponse.json({
    settings: invSettings,
    expiry: {
      days: expiryDays,
      expired: expiredPreview,
      nearExpiry: nearExpiryPreview,
    },
    kpis: {
      totalInventoryValuePaise,
      activeItemsCount: items.length,
      activeSuppliersCount,
      lowStockCount: lowStock.length,
      nearExpiryBatchesCount,
      expiredBatchesCount,
      supplierPayablePaise,
      overduePurchasesCount: overduePurchases.length,
      overduePurchasesPaise,
      costingMethod: invSettings.costingMethod,
    },
    charts: {
      valueByCategory: [...valueByCategory.entries()]
        .map(([label, valuePaise]) => ({ label, valuePaise }))
        .sort((a, b) => b.valuePaise - a.valuePaise),
      topItemsByValue: topByValue.map((r) => ({
        label: r.label,
        valuePaise: r.valuePaise,
      })),
      lowestItemsByValue: lowestByValue.map((r) => ({
        label: r.label,
        valuePaise: r.valuePaise,
      })),
      supplierPayables: topSupplierPayables.map((r) => ({
        label: r.supplierName || r.supplierId,
        balancePaise: r.balancePaise,
      })),
      lowestSupplierPayables: lowestSupplierPayables.map((r) => ({
        label: r.supplierName || r.supplierId,
        balancePaise: r.balancePaise,
      })),
      stockHealth: [
        { label: "In stock", count: okStockCount },
        { label: "Low stock", count: lowStock.length },
      ],
      movementsLast30Days,
    },
    lowStock,
    supplierBalances,
    overduePurchases: overduePurchases.map((p) => ({
      id: p.id,
      batchRef: p.batchRef,
      supplierName: p.supplier.name,
      totalPaise: p.totalPaise,
      dueAt: p.dueAt?.toISOString() ?? null,
      purchasedAt: p.purchasedAt.toISOString(),
    })),
    movementCounts,
  });
}
