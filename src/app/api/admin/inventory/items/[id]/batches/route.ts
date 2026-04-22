import { NextResponse } from "next/server";

import { requireAdminInventorySession } from "@/lib/admin-inventory-session";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await requireAdminInventorySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: "Missing item id" }, { status: 400 });

  const prisma = getPrisma();
  const item = await prisma.inventoryItem.findUnique({
    where: { id },
    select: { id: true, name: true, baseUnit: true, active: true },
  });
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  const batches = await prisma.inventoryBatch.findMany({
    where: { inventoryItemId: id },
    orderBy: [{ receivedAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      receivedAt: true,
      expiryDate: true,
      lotCode: true,
      sourceType: true,
      sourceId: true,
      qtyReceivedBase: true,
      remainingQtyBase: true,
      purchaseLineId: true,
    },
  });

  return NextResponse.json({
    item,
    batches: batches.map((b) => ({
      id: b.id,
      receivedAt: b.receivedAt.toISOString(),
      expiryDate: b.expiryDate?.toISOString() ?? null,
      lotCode: b.lotCode,
      sourceType: b.sourceType,
      sourceId: b.sourceId,
      qtyReceivedBase: b.qtyReceivedBase.toString(),
      remainingQtyBase: b.remainingQtyBase.toString(),
      purchaseLineId: b.purchaseLineId,
    })),
  });
}

