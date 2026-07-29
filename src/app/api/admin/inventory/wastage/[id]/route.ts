import { NextResponse } from "next/server";

import { requireAdminInventorySession } from "@/lib/admin-inventory-session";
import { ensureInventorySettings } from "@/lib/inventory/inventory-settings";
import { parseDecimalQty } from "@/lib/inventory/parse-quantity";
import {
  deleteIngredientWastage,
  updateIngredientWastage,
} from "@/lib/inventory/stock-ops";
import {
  isFutureWastedAt,
  isWastageType,
  resolveWastedAt,
} from "@/lib/inventory/wastage-parse";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

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
    await prisma.$transaction(async (tx) => {
      await deleteIngredientWastage(tx, id);
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "FAILED";
    const status =
      msg === "WASTAGE_NOT_FOUND"
        ? 404
        : msg === "DISH_WASTAGE_CHILD"
          ? 422
          : 400;
    return NextResponse.json(
      {
        error:
          msg === "DISH_WASTAGE_CHILD"
            ? "Delete the prepared dish wastage entry instead"
            : msg,
      },
      { status },
    );
  }
}

export async function PATCH(request: Request, context: Ctx) {
  const session = await requireAdminInventorySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
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
      return await updateIngredientWastage(tx, id, {
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
    const status =
      msg === "WASTAGE_NOT_FOUND"
        ? 404
        : msg === "DISH_WASTAGE_CHILD"
          ? 422
          : 400;
    return NextResponse.json(
      {
        error:
          msg === "DISH_WASTAGE_CHILD"
            ? "Edit the prepared dish wastage entry instead"
            : msg,
      },
      { status },
    );
  }
}
