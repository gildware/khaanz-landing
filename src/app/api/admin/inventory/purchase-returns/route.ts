import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireAdminInventorySession } from "@/lib/admin-inventory-session";
import { createPurchaseReturnInTransaction } from "@/lib/inventory/purchase-return-flow";
import { parseDecimalQty } from "@/lib/inventory/parse-quantity";
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

  const supplierId =
    typeof body.supplierId === "string" ? body.supplierId.trim() : "";
  if (!supplierId) {
    return NextResponse.json({ error: "supplierId required" }, { status: 400 });
  }
  const purchaseId =
    typeof body.purchaseId === "string" && body.purchaseId.trim()
      ? body.purchaseId.trim()
      : null;
  const returnedAt =
    typeof body.returnedAt === "string" && body.returnedAt
      ? new Date(body.returnedAt)
      : new Date();
  if (Number.isNaN(returnedAt.getTime())) {
    return NextResponse.json({ error: "Invalid returnedAt" }, { status: 400 });
  }

  const linesRaw = body.lines;
  if (!Array.isArray(linesRaw) || linesRaw.length === 0) {
    return NextResponse.json({ error: "lines[] required" }, { status: 400 });
  }

  const lines: {
    inventoryItemId: string;
    inventoryBatchId: string;
    qtyPurchase: Prisma.Decimal;
    creditPaise: number;
  }[] = [];

  for (const raw of linesRaw) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const inventoryItemId =
      typeof o.inventoryItemId === "string" ? o.inventoryItemId.trim() : "";
    if (!inventoryItemId) {
      return NextResponse.json({ error: "inventoryItemId required" }, { status: 400 });
    }
    const inventoryBatchId =
      typeof o.inventoryBatchId === "string" ? o.inventoryBatchId.trim() : "";
    if (!inventoryBatchId) {
      return NextResponse.json({ error: "inventoryBatchId required" }, { status: 400 });
    }
    const qty = parseDecimalQty(o.qtyPurchase, "qtyPurchase");
    if ("error" in qty) {
      return NextResponse.json({ error: qty.error }, { status: 400 });
    }
    const creditPaise = Number(o.creditPaise);
    if (!Number.isFinite(creditPaise)) {
      return NextResponse.json({ error: "creditPaise invalid" }, { status: 400 });
    }
    lines.push({
      inventoryItemId,
      inventoryBatchId,
      qtyPurchase: qty,
      creditPaise: Math.floor(creditPaise),
    });
  }

  const notes = typeof body.notes === "string" ? body.notes : "";

  const prisma = getPrisma();
  try {
    const out = await prisma.$transaction((tx) =>
      createPurchaseReturnInTransaction(tx, {
        supplierId,
        purchaseId,
        returnedAt,
        notes,
        createdByUserId: session.userId,
        lines,
      }),
    );
    return NextResponse.json(out);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "FAILED";
    const status = msg.endsWith("_NOT_FOUND") ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
