import { NextResponse } from "next/server";

import { ensureInventorySettings } from "@/lib/inventory/inventory-settings";
import { D0 } from "@/lib/inventory/decimal-utils";
import { recordOpeningOrAdjustment } from "@/lib/inventory/stock-ops";
import { requireAdminSession } from "@/lib/admin-session";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const prisma = getPrisma();
  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.personalUseEntry.findUnique({
        where: { id },
        select: {
          id: true,
          kind: true,
          inventoryItemId: true,
          qtyBase: true,
          note: true,
        },
      });
      if (!existing) throw new Error("NOT_FOUND");

      const movements = await tx.inventoryMovement.findMany({
        where: { referenceType: "personal_use", referenceId: id },
        select: {
          inventoryItemId: true,
          qtyDeltaBase: true,
        },
      });

      if (movements.length > 0) {
        const settings = await ensureInventorySettings(tx);
        for (const m of movements) {
          if (!m.qtyDeltaBase.lessThan(D0)) continue;
          await recordOpeningOrAdjustment(tx, {
            allowNegativeStock: settings.allowNegativeStock,
            inventoryItemId: m.inventoryItemId,
            qtyDeltaBase: m.qtyDeltaBase.abs(),
            direction: "up",
            reason: "OTHER",
            note: `REVERSE_PERSONAL_USE:${existing.note}`.slice(0, 500),
            occurredAt: new Date(),
            createdByUserId: session.userId,
            referenceType: "personal_use_rev",
            referenceId: id,
          });
        }
      } else if (
        existing.kind === "STOCK" &&
        existing.inventoryItemId &&
        existing.qtyBase &&
        existing.qtyBase.greaterThan(D0)
      ) {
        // Fallback if movements were missing but the entry still records stock.
        const settings = await ensureInventorySettings(tx);
        await recordOpeningOrAdjustment(tx, {
          allowNegativeStock: settings.allowNegativeStock,
          inventoryItemId: existing.inventoryItemId,
          qtyDeltaBase: existing.qtyBase,
          direction: "up",
          reason: "OTHER",
          note: `REVERSE_PERSONAL_USE:${existing.note}`.slice(0, 500),
          occurredAt: new Date(),
          createdByUserId: session.userId,
          referenceType: "personal_use_rev",
          referenceId: id,
        });
      }

      await tx.personalUseEntry.delete({ where: { id } });
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Delete failed";
    if (msg === "NOT_FOUND") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
