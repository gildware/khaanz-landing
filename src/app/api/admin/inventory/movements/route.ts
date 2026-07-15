import { NextResponse } from "next/server";

import { requireAdminInventorySession } from "@/lib/admin-inventory-session";
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
};

export async function GET(request: Request) {
  const session = await requireAdminInventorySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = Math.min(
    500,
    Math.max(1, Math.floor(Number(url.searchParams.get("limit") ?? "200"))),
  );

  const prisma = getPrisma();
  const rows = await prisma.inventoryMovement.findMany({
    orderBy: { occurredAt: "desc" },
    take: limit,
    include: {
      item: { select: { id: true, name: true, baseUnit: true } },
    },
  });

  return NextResponse.json({
    movements: rows.map((m) => ({
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
    })),
  });
}
