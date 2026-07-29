import { NextResponse } from "next/server";

import { requireAdminInventorySession } from "@/lib/admin-inventory-session";
import { getPrisma } from "@/lib/prisma";
import type { WastageType } from "@prisma/client";

export const runtime = "nodejs";

const WASTAGE_TYPE_LABELS: Record<WastageType, string> = {
  SPOILAGE: "Spoiled / expired",
  PREPARATION: "Used in kitchen prep",
  OVERPRODUCTION: "Made too much",
  OTHER: "Other waste",
};

export async function GET(request: Request) {
  const session = await requireAdminInventorySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = Math.min(
    200,
    Math.max(1, Math.floor(Number(url.searchParams.get("limit") ?? "100"))),
  );

  const prisma = getPrisma();
  const [ingredientRows, dishRows] = await Promise.all([
    prisma.wastageEntry.findMany({
      where: { menuWastageEntryId: null },
      orderBy: [{ wastedAt: "desc" }, { createdAt: "desc" }],
      take: limit,
      select: {
        id: true,
        wastedAt: true,
        wastageType: true,
        qtyBase: true,
        note: true,
        createdAt: true,
        inventoryItemId: true,
        item: { select: { name: true, baseUnit: true } },
      },
    }),
    prisma.menuWastageEntry.findMany({
      orderBy: [{ wastedAt: "desc" }, { createdAt: "desc" }],
      take: limit,
      select: {
        id: true,
        quantity: true,
        wastedAt: true,
        wastageType: true,
        note: true,
        createdAt: true,
        menuItemId: true,
        variationId: true,
        menuItem: { select: { name: true } },
        variation: { select: { name: true } },
        ingredients: {
          select: {
            qtyBase: true,
            item: { select: { name: true, baseUnit: true } },
          },
        },
      },
    }),
  ]);

  type UnifiedEntry = {
    id: string;
    kind: "INGREDIENT" | "DISH";
    wastedAt: string;
    createdAt: string;
    wastageType: WastageType;
    wastageTypeLabel: string;
    summary: string;
    note: string;
    inventoryItemId: string | null;
    qtyBase: string | null;
    menuItemId: string | null;
    variationId: string | null;
    quantity: string | null;
    ingredients: { itemName: string; baseUnit: string; qtyBase: string }[];
  };

  const entries: UnifiedEntry[] = [
    ...ingredientRows.map((e) => ({
      id: e.id,
      kind: "INGREDIENT" as const,
      wastedAt: e.wastedAt.toISOString(),
      createdAt: e.createdAt.toISOString(),
      wastageType: e.wastageType,
      wastageTypeLabel: WASTAGE_TYPE_LABELS[e.wastageType],
      summary: `${e.item.name} · ${e.qtyBase.toString()} ${e.item.baseUnit}`,
      note: e.note,
      inventoryItemId: e.inventoryItemId,
      qtyBase: e.qtyBase.toString(),
      menuItemId: null,
      variationId: null,
      quantity: null,
      ingredients: [],
    })),
    ...dishRows.map((e) => ({
      id: e.id,
      kind: "DISH" as const,
      wastedAt: e.wastedAt.toISOString(),
      createdAt: e.createdAt.toISOString(),
      wastageType: e.wastageType,
      wastageTypeLabel: WASTAGE_TYPE_LABELS[e.wastageType],
      summary: `${e.menuItem.name} · ${e.variation.name} × ${e.quantity.toString()}`,
      note: e.note,
      inventoryItemId: null,
      qtyBase: null,
      menuItemId: e.menuItemId,
      variationId: e.variationId,
      quantity: e.quantity.toString(),
      ingredients: e.ingredients.map((i) => ({
        itemName: i.item.name,
        baseUnit: i.item.baseUnit,
        qtyBase: i.qtyBase.toString(),
      })),
    })),
  ]
    .sort(
      (a, b) =>
        new Date(b.wastedAt).getTime() - new Date(a.wastedAt).getTime() ||
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .slice(0, limit);

  return NextResponse.json({ entries });
}
