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
  return NextResponse.json({ suppliers: rows });
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
