import { NextResponse } from "next/server";

import { requireAdminInventorySession } from "@/lib/admin-inventory-session";
import { formatRecipeQtyBase } from "@/lib/inventory/decimal-utils";
import { ensureInventorySettings } from "@/lib/inventory/inventory-settings";
import { serializeYieldLink } from "@/lib/inventory/yield-links";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

const MOVEMENT_LABELS: Record<string, string> = {
  OPENING_STOCK: "Opening stock",
  PURCHASE_RECEIPT: "Purchase",
  PURCHASE_RETURN: "Purchase return",
  POS_OR_WEB_SALE: "POS / web sale",
  VENDOR_SALE: "Vendor sale",
  ORDER_CANCEL_RESTORE: "Order cancel restore",
  ADJUSTMENT_UP: "Adjustment (in)",
  ADJUSTMENT_DOWN: "Adjustment (out)",
  AUDIT_SURPLUS: "Audit surplus",
  AUDIT_SHORTAGE: "Audit shortage",
  WASTAGE: "Wastage",
  KITCHEN_USE: "Kitchen use",
  STOCK_SALE: "Stock sale",
};

type TabId =
  | "items"
  | "suppliers"
  | "purchase"
  | "recipes"
  | "sell"
  | "ops";

const TAB_PARTS: Record<TabId, string[]> = {
  items: ["settings", "items"],
  suppliers: ["suppliers", "purchases"],
  purchase: ["purchases", "suppliers", "items"],
  recipes: ["settings", "recipes", "menu", "items"],
  sell: ["stockSales", "items"],
  ops: ["settings", "movements", "items"],
};

function serializeIngredient(i: {
  inventoryItemId: string | null;
  componentMenuItemId: string | null;
  componentVariationId: string | null;
  qtyBase: { toString(): string };
  componentMenuItem?: { name: string } | null;
}) {
  const qtyBase = formatRecipeQtyBase(i.qtyBase as never);
  if (i.componentMenuItemId) {
    return {
      kind: "menu_item" as const,
      componentMenuItemId: i.componentMenuItemId,
      componentMenuItemName: i.componentMenuItem?.name ?? "",
      componentVariationId: i.componentVariationId,
      qtyBase,
    };
  }
  return {
    kind: "inventory" as const,
    inventoryItemId: i.inventoryItemId!,
    qtyBase,
  };
}

async function loadItems() {
  const prisma = getPrisma();
  const rows = await prisma.inventoryItem.findMany({
    select: {
      id: true,
      name: true,
      category: true,
      baseUnit: true,
      purchaseUnit: true,
      baseUnitsPerPurchaseUnit: true,
      stockOnHandBase: true,
      minStockBase: true,
      avgCostPaisePerBase: true,
      lastPurchasePaisePerBase: true,
      active: true,
      yieldSourceItemId: true,
      yieldPercent: true,
      yieldSourceItem: { select: { id: true, name: true } },
    },
    orderBy: { name: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    baseUnit: r.baseUnit,
    purchaseUnit: r.purchaseUnit,
    baseUnitsPerPurchaseUnit: r.baseUnitsPerPurchaseUnit.toString(),
    stockOnHandBase: r.stockOnHandBase.toString(),
    minStockBase: r.minStockBase.toString(),
    avgCostPaisePerBase: r.avgCostPaisePerBase.toString(),
    lastPurchasePaisePerBase: r.lastPurchasePaisePerBase.toString(),
    active: r.active,
    yieldLink: serializeYieldLink(r),
  }));
}

async function loadSuppliers() {
  const prisma = getPrisma();
  const rows = await prisma.supplier.findMany({
    select: {
      id: true,
      name: true,
      phone: true,
      address: true,
      active: true,
      defaultCreditDays: true,
    },
    orderBy: { name: "asc" },
  });
  const supplierIds = rows.map((s) => s.id);
  const [ledgerAgg, purchaseAgg] = await Promise.all([
    supplierIds.length > 0
      ? prisma.supplierLedgerEntry.groupBy({
          by: ["supplierId"],
          where: { supplierId: { in: supplierIds } },
          _sum: { debitPaise: true, creditPaise: true },
        })
      : [],
    supplierIds.length > 0
      ? prisma.purchase.groupBy({
          by: ["supplierId"],
          where: { supplierId: { in: supplierIds } },
          _sum: { totalPaise: true },
          _count: { id: true },
        })
      : [],
  ]);
  const balanceById = new Map(
    ledgerAgg.map((g) => [
      g.supplierId,
      (g._sum.debitPaise ?? 0) - (g._sum.creditPaise ?? 0),
    ]),
  );
  const purchasesById = new Map(
    purchaseAgg.map((g) => [
      g.supplierId,
      {
        totalPurchasesPaise: g._sum.totalPaise ?? 0,
        purchaseCount: g._count.id,
      },
    ]),
  );
  return rows.map((s) => {
    const purchases = purchasesById.get(s.id);
    return {
      id: s.id,
      name: s.name,
      phone: s.phone,
      address: s.address,
      active: s.active,
      defaultCreditDays: s.defaultCreditDays,
      balancePaise: balanceById.get(s.id) ?? 0,
      purchaseCount: purchases?.purchaseCount ?? 0,
      totalPurchasesPaise: purchases?.totalPurchasesPaise ?? 0,
    };
  });
}

async function loadPurchases() {
  const prisma = getPrisma();
  const rows = await prisma.purchase.findMany({
    orderBy: { purchasedAt: "desc" },
    take: 200,
    select: {
      id: true,
      batchRef: true,
      supplierId: true,
      purchasedAt: true,
      paymentType: true,
      creditDays: true,
      dueAt: true,
      totalPaise: true,
      notes: true,
      supplier: { select: { id: true, name: true } },
      _count: { select: { lines: true } },
    },
  });
  return rows.map((p) => ({
    id: p.id,
    batchRef: p.batchRef,
    supplierId: p.supplierId,
    supplierName: p.supplier.name,
    purchasedAt: p.purchasedAt.toISOString(),
    paymentType: p.paymentType,
    creditDays: p.creditDays,
    dueAt: p.dueAt?.toISOString() ?? null,
    totalPaise: p.totalPaise,
    lineCount: p._count.lines,
    notes: p.notes,
  }));
}

async function loadRecipes() {
  const prisma = getPrisma();
  const rows = await prisma.recipeVersion.findMany({
    orderBy: [{ menuItemId: "asc" }, { effectiveFrom: "desc" }],
    take: 200,
    select: {
      id: true,
      menuItemId: true,
      variationId: true,
      effectiveFrom: true,
      createdAt: true,
      label: true,
      yieldQty: true,
      yieldUnit: true,
      ingredients: {
        select: {
          inventoryItemId: true,
          componentMenuItemId: true,
          componentVariationId: true,
          qtyBase: true,
          componentMenuItem: { select: { id: true, name: true } },
        },
      },
      menuItem: { select: { id: true, name: true } },
    },
  });

  const versionById = new Map<string, number>();
  const byKey = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = `${r.menuItemId}\0${r.variationId ?? ""}`;
    const list = byKey.get(key) ?? [];
    list.push(r);
    byKey.set(key, list);
  }
  for (const list of byKey.values()) {
    list.sort((a, b) => {
      const t = a.effectiveFrom.getTime() - b.effectiveFrom.getTime();
      if (t !== 0) return t;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
    list.forEach((r, i) => versionById.set(r.id, i + 1));
  }

  return rows.map((r) => ({
    id: r.id,
    menuItemId: r.menuItemId,
    menuItemName: r.menuItem.name,
    variationId: r.variationId,
    effectiveFrom: r.effectiveFrom.toISOString(),
    label: r.label,
    yieldQty: r.yieldQty.toString(),
    yieldUnit: r.yieldUnit,
    version: versionById.get(r.id) ?? 1,
    ingredients: r.ingredients.map(serializeIngredient),
  }));
}

/** Slim menu catalog for recipe pickers — not the full storefront payload. */
async function loadMenuSlim() {
  const prisma = getPrisma();
  const [items, categories] = await Promise.all([
    prisma.menuItem.findMany({
      select: {
        id: true,
        name: true,
        categoryId: true,
        variations: {
          select: { id: true, name: true, price: true },
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.category.findMany({
      select: { id: true, name: true },
    }),
  ]);
  const catName = new Map(categories.map((c) => [c.id, c.name]));
  return {
    items: items.map((item) => ({
      id: item.id,
      name: item.name,
      category: catName.get(item.categoryId) ?? "",
      variations: item.variations.map((v) => ({
        id: v.id,
        name: v.name,
        price: v.price,
      })),
    })),
  };
}

async function loadMovements() {
  const prisma = getPrisma();
  const rows = await prisma.inventoryMovement.findMany({
    orderBy: { occurredAt: "desc" },
    take: 200,
    select: {
      id: true,
      inventoryItemId: true,
      occurredAt: true,
      type: true,
      qtyDeltaBase: true,
      referenceType: true,
      referenceId: true,
      note: true,
      item: { select: { id: true, name: true, baseUnit: true } },
    },
  });
  return rows.map((m) => ({
    id: m.id,
    inventoryItemId: m.inventoryItemId,
    itemName: m.item.name,
    baseUnit: m.item.baseUnit,
    occurredAt: m.occurredAt.toISOString(),
    type: m.type,
    typeLabel: MOVEMENT_LABELS[m.type] ?? m.type,
    qtyDeltaBase: m.qtyDeltaBase.toString(),
    referenceType: m.referenceType,
    referenceId: m.referenceId,
    note: m.note,
  }));
}

async function loadStockSales() {
  const prisma = getPrisma();
  const entries = await prisma.stockSaleEntry.findMany({
    orderBy: [{ soldAt: "desc" }, { createdAt: "desc" }],
    take: 100,
    select: {
      id: true,
      inventoryItemId: true,
      soldAt: true,
      qtyBase: true,
      ratePaisePerBase: true,
      totalPaise: true,
      costPaise: true,
      buyerName: true,
      note: true,
      createdAt: true,
      item: { select: { name: true, baseUnit: true } },
    },
  });
  return entries.map((e) => ({
    id: e.id,
    inventoryItemId: e.inventoryItemId,
    soldAt: e.soldAt.toISOString(),
    qtyBase: e.qtyBase.toString(),
    ratePaisePerBase: e.ratePaisePerBase.toString(),
    totalPaise: e.totalPaise,
    costPaise: e.costPaise,
    buyerName: e.buyerName,
    note: e.note,
    createdAt: e.createdAt.toISOString(),
    item: e.item,
  }));
}

async function loadSettings() {
  return ensureInventorySettings(getPrisma());
}

/**
 * One round-trip bootstrap for inventory tabs.
 * `have=items,suppliers` skips parts already cached in the client.
 */
export async function GET(request: Request) {
  const session = await requireAdminInventorySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const tabRaw = url.searchParams.get("tab") ?? "";
  const tab = (TAB_PARTS[tabRaw as TabId] ? tabRaw : "") as TabId | "";
  if (!tab) {
    return NextResponse.json(
      { error: "tab must be items|suppliers|purchase|recipes|sell|ops" },
      { status: 400 },
    );
  }

  const have = new Set(
    (url.searchParams.get("have") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );

  const want = TAB_PARTS[tab].filter((part) => !have.has(part));
  const out: Record<string, unknown> = { tab };

  await Promise.all(
    want.map(async (part) => {
      switch (part) {
        case "settings":
          out.settings = await loadSettings();
          break;
        case "items":
          out.items = await loadItems();
          break;
        case "suppliers":
          out.suppliers = await loadSuppliers();
          break;
        case "purchases":
          out.purchases = await loadPurchases();
          break;
        case "recipes":
          out.recipes = await loadRecipes();
          break;
        case "menu":
          out.menu = await loadMenuSlim();
          break;
        case "movements":
          out.movements = await loadMovements();
          break;
        case "stockSales":
          out.stockSales = await loadStockSales();
          break;
        default:
          break;
      }
    }),
  );

  return NextResponse.json(out);
}
