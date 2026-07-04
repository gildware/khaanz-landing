import { NextResponse } from "next/server";

import { requireAdminInventorySession } from "@/lib/admin-inventory-session";
import { createSupplierOpeningBalanceInTransaction } from "@/lib/inventory/supplier-opening-balance";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const session = await requireAdminInventorySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const prisma = getPrisma();
  const rows = await prisma.supplier.findMany({ orderBy: { name: "asc" } });
  const supplierIds = rows.map((s) => s.id);
  const [ledgerAgg, purchaseAgg] = await Promise.all([
    supplierIds.length > 0
      ? prisma.supplierLedgerEntry.groupBy({
          by: ["supplierId"],
          where: { supplierId: { in: supplierIds } },
          _sum: { debitPaise: true, creditPaise: true },
        })
      : [],
    supplierIds.length > 0
      ? prisma.purchase.groupBy({
          by: ["supplierId"],
          where: { supplierId: { in: supplierIds } },
          _sum: { totalPaise: true },
          _count: { id: true },
        })
      : [],
  ]);
  const balanceById = new Map(
    ledgerAgg.map((g) => [
      g.supplierId,
      (g._sum.debitPaise ?? 0) - (g._sum.creditPaise ?? 0),
    ]),
  );
  const purchasesById = new Map(
    purchaseAgg.map((g) => [
      g.supplierId,
      {
        totalPurchasesPaise: g._sum.totalPaise ?? 0,
        purchaseCount: g._count.id,
      },
    ]),
  );
  const suppliers = rows.map((s) => {
    const purchases = purchasesById.get(s.id);
    return {
      ...s,
      balancePaise: balanceById.get(s.id) ?? 0,
      purchaseCount: purchases?.purchaseCount ?? 0,
      totalPurchasesPaise: purchases?.totalPurchasesPaise ?? 0,
    };
  });
  return NextResponse.json({ suppliers });
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
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  const phone =
    typeof body.phone === "string" ? body.phone.trim().slice(0, 32) : "";
  const address =
    typeof body.address === "string" ? body.address.trim().slice(0, 4000) : "";
  let defaultCreditDays: number | null = null;
  if (body.defaultCreditDays !== undefined && body.defaultCreditDays !== null) {
    const n = Number(body.defaultCreditDays);
    if (!Number.isFinite(n) || n < 0 || n > 365) {
      return NextResponse.json(
        { error: "defaultCreditDays must be 0–365 or null" },
        { status: 400 },
      );
    }
    defaultCreditDays = Math.floor(n);
  }

  let openingBalancePaise: number | undefined;
  if (body.openingBalancePaise !== undefined && body.openingBalancePaise !== null) {
    const n = Number(body.openingBalancePaise);
    if (!Number.isFinite(n) || n < 0) {
      return NextResponse.json(
        { error: "openingBalancePaise must be a non-negative number" },
        { status: 400 },
      );
    }
    openingBalancePaise = Math.floor(n);
  }
  const openingBalanceNote =
    typeof body.openingBalanceNote === "string" ? body.openingBalanceNote : undefined;

  const prisma = getPrisma();
  try {
    const row = await prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.create({
        data: {
          name: name.slice(0, 200),
          phone,
          address,
          defaultCreditDays,
        },
      });
      if (openingBalancePaise && openingBalancePaise > 0) {
        await createSupplierOpeningBalanceInTransaction(tx, {
          supplierId: supplier.id,
          amountPaise: openingBalancePaise,
          note: openingBalanceNote,
        });
      }
      return supplier;
    });
    return NextResponse.json(row);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to create supplier";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
