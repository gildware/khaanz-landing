import { NextResponse } from "next/server";

import { requireAdminInventorySession } from "@/lib/admin-inventory-session";
import { ensureInventorySettings } from "@/lib/inventory/inventory-settings";
import { parseDecimalQty } from "@/lib/inventory/parse-quantity";
import { recordWastage } from "@/lib/inventory/stock-ops";
import {
  isFutureWastedAt,
  isWastageType,
  resolveWastedAt,
} from "@/lib/inventory/wastage-parse";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await requireAdminInventorySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isWastageType(body.wastageType)) {
    return NextResponse.json({ error: "Invalid wastageType" }, { status: 400 });
  }
  const wastageType = body.wastageType;
  const inventoryItemId =
    typeof body.inventoryItemId === "string" ? body.inventoryItemId.trim() : "";
  if (!inventoryItemId) {
    return NextResponse.json({ error: "inventoryItemId required" }, { status: 400 });
  }
  const qty = parseDecimalQty(body.qtyBase, "qtyBase");
  if ("error" in qty) {
    return NextResponse.json({ error: qty.error }, { status: 400 });
  }
  const wastedAt = resolveWastedAt(body.wastedAt);
  if (!wastedAt) {
    return NextResponse.json({ error: "Invalid wastedAt" }, { status: 400 });
  }
  if (isFutureWastedAt(wastedAt)) {
    return NextResponse.json(
      { error: "Waste date can’t be in the future" },
      { status: 400 },
    );
  }
  const note = typeof body.note === "string" ? body.note : "";

  const prisma = getPrisma();
  try {
    const out = await prisma.$transaction(async (tx) => {
      const settings = await ensureInventorySettings(tx);
      return await recordWastage(tx, {
        allowNegativeStock: settings.allowNegativeStock,
        inventoryItemId,
        qtyBase: qty,
        wastedAt,
        wastageType,
        note,
        createdByUserId: session.userId,
      });
    });
    return NextResponse.json(out);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "FAILED";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
