import { NextResponse } from "next/server";

import { requireAdminInventorySession } from "@/lib/admin-inventory-session";
import {
  PurchaseDeleteBlockedError,
  deletePurchaseInTransaction,
} from "@/lib/inventory/purchase-flow";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const BLOCK_MESSAGES: Record<string, string> = {
  PURCHASE_HAS_RETURNS:
    "This purchase has returns recorded against it. Reverse the returns before deleting.",
  PURCHASE_STOCK_CONSUMED:
    "Some of the received stock has already been used (sold, wasted, adjusted, or returned), so this purchase can no longer be deleted.",
  PURCHASE_BATCH_MISSING:
    "The stock batch for this purchase could not be found, so it cannot be safely reversed.",
};

export async function DELETE(_request: Request, context: Ctx) {
  const session = await requireAdminInventorySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const prisma = getPrisma();
  try {
    await prisma.$transaction((tx) => deletePurchaseInTransaction(tx, id));
    return NextResponse.json({ ok: true, deleted: true });
  } catch (e) {
    if (e instanceof PurchaseDeleteBlockedError) {
      return NextResponse.json(
        { error: BLOCK_MESSAGES[e.reason] ?? "Purchase cannot be deleted." },
        { status: 409 },
      );
    }
    const msg = e instanceof Error ? e.message : "FAILED";
    const status = msg === "PURCHASE_NOT_FOUND" ? 404 : 500;
    return NextResponse.json(
      { error: msg === "PURCHASE_NOT_FOUND" ? "Purchase not found" : msg },
      { status },
    );
  }
}
