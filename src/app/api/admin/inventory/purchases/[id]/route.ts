import type { Prisma, PurchasePaymentType } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireAdminInventorySession } from "@/lib/admin-inventory-session";
import {
  PurchaseDeleteBlockedError,
  deletePurchaseInTransaction,
  updatePurchaseInTransaction,
} from "@/lib/inventory/purchase-flow";
import { parsePurchaseBills } from "@/lib/inventory/purchase-bills";
import { parseDecimalQty } from "@/lib/inventory/parse-quantity";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const PAY: PurchasePaymentType[] = ["CASH", "CHEQUE", "CREDIT"];

const DELETE_BLOCK_MESSAGES: Record<string, string> = {
  PURCHASE_HAS_RETURNS:
    "This purchase has returns recorded against it. Reverse the returns before deleting.",
  PURCHASE_STOCK_CONSUMED:
    "Some of the received stock has already been used (sold, wasted, adjusted, or returned), so this purchase can no longer be deleted.",
  PURCHASE_BATCH_MISSING:
    "The stock batch for this purchase could not be found, so it cannot be safely reversed.",
};

const EDIT_BLOCK_MESSAGES: Record<string, string> = {
  PURCHASE_HAS_RETURNS:
    "This purchase has returns recorded against it. Reverse the returns before editing.",
  PURCHASE_STOCK_CONSUMED:
    "Some of the received stock has already been used (sold, wasted, adjusted, or returned), so this purchase can no longer be edited.",
  PURCHASE_BATCH_MISSING:
    "The stock batch for this purchase could not be found, so it cannot be safely edited.",
};

function isPaymentType(x: unknown): x is PurchasePaymentType {
  return typeof x === "string" && PAY.includes(x as PurchasePaymentType);
}

function parsePurchaseBody(body: Record<string, unknown>):
  | {
      ok: true;
      supplierId: string;
      purchasedAt: Date;
      paymentType: PurchasePaymentType;
      creditDays?: number | null;
      notes: string;
      bills: { url: string; fileName: string }[];
      lines: {
        inventoryItemId: string;
        qtyPurchase: Prisma.Decimal;
        ratePaisePerPurchaseUnit: number;
        expiryDate?: Date | null;
        lotCode?: string;
      }[];
    }
  | { ok: false; error: string; status: number } {
  if (!isPaymentType(body.paymentType)) {
    return { ok: false, error: "Invalid paymentType", status: 400 };
  }
  const paymentType = body.paymentType;
  const supplierId =
    typeof body.supplierId === "string" ? body.supplierId.trim() : "";
  if (!supplierId) {
    return { ok: false, error: "supplierId required", status: 400 };
  }

  const purchasedAt =
    typeof body.purchasedAt === "string" && body.purchasedAt
      ? new Date(body.purchasedAt)
      : new Date();
  if (Number.isNaN(purchasedAt.getTime())) {
    return { ok: false, error: "Invalid purchasedAt", status: 400 };
  }

  const linesRaw = body.lines;
  if (!Array.isArray(linesRaw) || linesRaw.length === 0) {
    return { ok: false, error: "lines[] required", status: 400 };
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
      return { ok: false, error: "Each line needs inventoryItemId", status: 400 };
    }
    const qty = parseDecimalQty(o.qtyPurchase, "qtyPurchase");
    if ("error" in qty) {
      return { ok: false, error: qty.error, status: 400 };
    }
    if (!qty.greaterThan(0)) {
      return { ok: false, error: "qtyPurchase must be > 0", status: 400 };
    }
    const rate = Number(o.ratePaisePerPurchaseUnit);
    if (!Number.isFinite(rate) || rate < 0) {
      return { ok: false, error: "Invalid rate", status: 400 };
    }
    let expiryDate: Date | null | undefined;
    if (o.expiryDate === null) expiryDate = null;
    else if (typeof o.expiryDate === "string" && o.expiryDate) {
      const d = new Date(o.expiryDate);
      if (Number.isNaN(d.getTime())) {
        return { ok: false, error: "Invalid expiryDate", status: 400 };
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
    return { ok: false, error: "No valid lines", status: 400 };
  }

  let creditDays: number | null | undefined;
  if (body.creditDays !== undefined && body.creditDays !== null) {
    creditDays = Math.floor(Number(body.creditDays));
    if (!Number.isFinite(creditDays) || creditDays < 0) {
      return { ok: false, error: "Invalid creditDays", status: 400 };
    }
  }

  return {
    ok: true,
    supplierId,
    purchasedAt,
    paymentType,
    creditDays,
    notes: typeof body.notes === "string" ? body.notes : "",
    bills: parsePurchaseBills(body.bills),
    lines,
  };
}

export async function GET(_request: Request, context: Ctx) {
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
    const purchase = await prisma.purchase.findUnique({
    where: { id },
    select: {
      id: true,
      batchRef: true,
      supplierId: true,
      purchasedAt: true,
      paymentType: true,
      creditDays: true,
      dueAt: true,
      totalPaise: true,
      notes: true,
      bills: true,
      createdAt: true,
      supplier: { select: { id: true, name: true, phone: true } },
      lines: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          inventoryItemId: true,
          qtyPurchase: true,
          ratePaisePerPurchaseUnit: true,
          lineTotalPaise: true,
          qtyBaseReceived: true,
          expiryDate: true,
          lotCode: true,
          item: {
            select: {
              name: true,
              category: true,
              baseUnit: true,
              purchaseUnit: true,
              baseUnitsPerPurchaseUnit: true,
            },
          },
          batch: {
            select: {
              id: true,
              remainingQtyBase: true,
              qtyReceivedBase: true,
              _count: { select: { consumptions: true } },
            },
          },
        },
      },
      returns: {
        orderBy: { returnedAt: "desc" },
        select: {
          id: true,
          returnedAt: true,
          totalCreditPaise: true,
          notes: true,
          _count: { select: { lines: true } },
        },
      },
    },
  });

  if (!purchase) {
    return NextResponse.json({ error: "Purchase not found" }, { status: 404 });
  }

  const editable =
    purchase.returns.length === 0 &&
    purchase.lines.every((l) => {
      if (!l.batch) return false;
      if (l.batch._count.consumptions > 0) return false;
      return l.batch.remainingQtyBase.equals(l.batch.qtyReceivedBase);
    });

  return NextResponse.json({
    purchase: {
      id: purchase.id,
      batchRef: purchase.batchRef,
      supplierId: purchase.supplierId,
      supplierName: purchase.supplier.name,
      supplierPhone: purchase.supplier.phone,
      purchasedAt: purchase.purchasedAt.toISOString(),
      paymentType: purchase.paymentType,
      creditDays: purchase.creditDays,
      dueAt: purchase.dueAt?.toISOString() ?? null,
      totalPaise: purchase.totalPaise,
      notes: purchase.notes,
      bills: parsePurchaseBills(purchase.bills),
      createdAt: purchase.createdAt.toISOString(),
      editable,
      lines: purchase.lines.map((l) => ({
        id: l.id,
        inventoryItemId: l.inventoryItemId,
        itemName: l.item.name,
        category: l.item.category,
        baseUnit: l.item.baseUnit,
        purchaseUnit: l.item.purchaseUnit,
        baseUnitsPerPurchaseUnit: l.item.baseUnitsPerPurchaseUnit.toString(),
        qtyPurchase: l.qtyPurchase.toString(),
        ratePaisePerPurchaseUnit: l.ratePaisePerPurchaseUnit,
        lineTotalPaise: l.lineTotalPaise,
        qtyBaseReceived: l.qtyBaseReceived.toString(),
        remainingQtyBase: l.batch?.remainingQtyBase.toString() ?? null,
        expiryDate: l.expiryDate?.toISOString() ?? null,
        lotCode: l.lotCode,
      })),
      returns: purchase.returns.map((r) => ({
        id: r.id,
        returnedAt: r.returnedAt.toISOString(),
        totalCreditPaise: r.totalCreditPaise,
        lineCount: r._count.lines,
        notes: r.notes,
      })),
    },
  });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load purchase";
    console.error("GET purchase", e);
    return NextResponse.json({ error: msg }, { status: 500 });
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

  const parsed = parsePurchaseBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  const prisma = getPrisma();
  try {
    const out = await prisma.$transaction((tx) =>
      updatePurchaseInTransaction(tx, id, {
        supplierId: parsed.supplierId,
        purchasedAt: parsed.purchasedAt,
        paymentType: parsed.paymentType,
        creditDays: parsed.creditDays,
        notes: parsed.notes,
        bills: parsed.bills,
        createdByUserId: session.userId,
        lines: parsed.lines,
      }),
    );
    return NextResponse.json(out);
  } catch (e) {
    if (e instanceof PurchaseDeleteBlockedError) {
      return NextResponse.json(
        { error: EDIT_BLOCK_MESSAGES[e.reason] ?? "Purchase cannot be edited." },
        { status: 409 },
      );
    }
    const msg = e instanceof Error ? e.message : "FAILED";
    const status =
      msg === "PURCHASE_NOT_FOUND"
        ? 404
        : msg === "SUPPLIER_NOT_FOUND" || msg === "INVENTORY_ITEM_NOT_FOUND"
          ? 400
          : 500;
    return NextResponse.json(
      {
        error:
          msg === "PURCHASE_NOT_FOUND"
            ? "Purchase not found"
            : msg === "SUPPLIER_NOT_FOUND"
              ? "Supplier not found"
              : msg === "INVENTORY_ITEM_NOT_FOUND"
                ? "Inventory item not found"
                : msg,
      },
      { status },
    );
  }
}

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
        { error: DELETE_BLOCK_MESSAGES[e.reason] ?? "Purchase cannot be deleted." },
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
