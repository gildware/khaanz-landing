import { NextResponse } from "next/server";

import { requireAdminInventorySession } from "@/lib/admin-inventory-session";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requireAdminInventorySession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const days = Math.max(0, Math.floor(Number(url.searchParams.get("days") ?? "7")));
  const now = new Date();
  const cutoff = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const prisma = getPrisma();
  const rows = await prisma.inventoryBatch.findMany({
    where: {
      remainingQtyBase: { gt: 0 },
      expiryDate: { not: null },
    },
    orderBy: [{ expiryDate: "asc" }, { receivedAt: "asc" }],
    take: 500,
    select: {
      id: true,
      inventoryItemId: true,
      expiryDate: true,
      receivedAt: true,
      lotCode: true,
      remainingQtyBase: true,
      item: { select: { name: true, baseUnit: true } },
    },
  });

  const expired = rows
    .filter((r) => r.expiryDate && r.expiryDate.getTime() < now.getTime())
    .map((r) => ({
      batchId: r.id,
      inventoryItemId: r.inventoryItemId,
      itemName: r.item.name,
      baseUnit: r.item.baseUnit,
      expiryDate: r.expiryDate!.toISOString(),
      receivedAt: r.receivedAt.toISOString(),
      lotCode: r.lotCode,
      remainingQtyBase: r.remainingQtyBase.toString(),
    }));

  const nearExpiry = rows
    .filter(
      (r) =>
        r.expiryDate &&
        r.expiryDate.getTime() >= now.getTime() &&
        r.expiryDate.getTime() <= cutoff.getTime(),
    )
    .map((r) => ({
      batchId: r.id,
      inventoryItemId: r.inventoryItemId,
      itemName: r.item.name,
      baseUnit: r.item.baseUnit,
      expiryDate: r.expiryDate!.toISOString(),
      receivedAt: r.receivedAt.toISOString(),
      lotCode: r.lotCode,
      remainingQtyBase: r.remainingQtyBase.toString(),
    }));

  return NextResponse.json({ days, expired, nearExpiry });
}

