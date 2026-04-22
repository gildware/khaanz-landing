import { NextResponse } from "next/server";

import { requireAdminInventorySession } from "@/lib/admin-inventory-session";
import { parseDecimalQty } from "@/lib/inventory/parse-quantity";
import { recordOpeningStock } from "@/lib/inventory/stock-ops";
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

  const inventoryItemId =
    typeof body.inventoryItemId === "string" ? body.inventoryItemId.trim() : "";
  if (!inventoryItemId) {
    return NextResponse.json({ error: "inventoryItemId required" }, { status: 400 });
  }
  const qty = parseDecimalQty(body.qtyBase, "qtyBase");
  if ("error" in qty) {
    return NextResponse.json({ error: qty.error }, { status: 400 });
  }
  const occurredAt =
    typeof body.occurredAt === "string" && body.occurredAt
      ? new Date(body.occurredAt)
      : new Date();
  if (Number.isNaN(occurredAt.getTime())) {
    return NextResponse.json({ error: "Invalid occurredAt" }, { status: 400 });
  }
  const note = typeof body.note === "string" ? body.note : "";

  const prisma = getPrisma();
  try {
    await prisma.$transaction((tx) =>
      recordOpeningStock(tx, {
        inventoryItemId,
        qtyBase: qty,
        occurredAt,
        note,
        createdByUserId: session.userId,
      }),
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "FAILED";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
