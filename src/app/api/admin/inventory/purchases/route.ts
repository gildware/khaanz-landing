import type { Prisma, PurchasePaymentType } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireAdminInventorySession } from "@/lib/admin-inventory-session";
import { createPurchaseInTransaction } from "@/lib/inventory/purchase-flow";
import { parseDecimalQty } from "@/lib/inventory/parse-quantity";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

const PAY: PurchasePaymentType[] = ["CASH", "CHEQUE", "CREDIT"];

function isPaymentType(x: unknown): x is PurchasePaymentType {
  return typeof x === "string" && PAY.includes(x as PurchasePaymentType);
}

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

  if (!isPaymentType(body.paymentType)) {
    return NextResponse.json({ error: "Invalid paymentType" }, { status: 400 });
  }
  const paymentType = body.paymentType;
  const supplierId =
    typeof body.supplierId === "string" ? body.supplierId.trim() : "";
  if (!supplierId) {
    return NextResponse.json({ error: "supplierId required" }, { status: 400 });
  }

  const purchasedAt =
    typeof body.purchasedAt === "string" && body.purchasedAt
      ? new Date(body.purchasedAt)
      : new Date();
  if (Number.isNaN(purchasedAt.getTime())) {
    return NextResponse.json({ error: "Invalid purchasedAt" }, { status: 400 });
  }

  const linesRaw = body.lines;
  if (!Array.isArray(linesRaw) || linesRaw.length === 0) {
    return NextResponse.json({ error: "lines[] required" }, { status: 400 });
  }

  const lines: {
    inventoryItemId: string;
    qtyPurchase: Prisma.Decimal;
    ratePaisePerPurchaseUnit: number;
    expiryDate?: Date | null;
    lotCode?: string;
  }[] = [];

  for (const raw of linesRaw) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const itemId =
      typeof o.inventoryItemId === "string" ? o.inventoryItemId.trim() : "";
    if (!itemId) {
      return NextResponse.json({ error: "Each line needs inventoryItemId" }, { status: 400 });
    }
    const qty = parseDecimalQty(o.qtyPurchase, "qtyPurchase");
    if ("error" in qty) {
      return NextResponse.json({ error: qty.error }, { status: 400 });
    }
    if (!qty.greaterThan(0)) {
      return NextResponse.json({ error: "qtyPurchase must be > 0" }, { status: 400 });
    }
    const rate = Number(o.ratePaisePerPurchaseUnit);
    if (!Number.isFinite(rate) || rate < 0) {
      return NextResponse.json({ error: "Invalid rate" }, { status: 400 });
    }
    let expiryDate: Date | null | undefined;
    if (o.expiryDate === null) expiryDate = null;
    else if (typeof o.expiryDate === "string" && o.expiryDate) {
      const d = new Date(o.expiryDate);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ error: "Invalid expiryDate" }, { status: 400 });
      }
      expiryDate = d;
    }
    const lotCode = typeof o.lotCode === "string" ? o.lotCode : undefined;
    lines.push({
      inventoryItemId: itemId,
      qtyPurchase: qty,
      ratePaisePerPurchaseUnit: Math.floor(rate),
      expiryDate,
      lotCode,
    });
  }

  if (lines.length === 0) {
    return NextResponse.json({ error: "No valid lines" }, { status: 400 });
  }

  let creditDays: number | null | undefined;
  if (body.creditDays !== undefined && body.creditDays !== null) {
    creditDays = Math.floor(Number(body.creditDays));
    if (!Number.isFinite(creditDays) || creditDays < 0) {
      return NextResponse.json({ error: "Invalid creditDays" }, { status: 400 });
    }
  }

  const notes = typeof body.notes === "string" ? body.notes : "";

  const prisma = getPrisma();
  try {
    const out = await prisma.$transaction((tx) =>
      createPurchaseInTransaction(tx, {
        supplierId,
        purchasedAt,
        paymentType,
        creditDays,
        notes,
        createdByUserId: session.userId,
        lines,
      }),
    );
    return NextResponse.json(out);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "FAILED";
    const status =
      msg === "SUPPLIER_NOT_FOUND" || msg === "INVENTORY_ITEM_NOT_FOUND"
        ? 400
        : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
