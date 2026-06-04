import { NextResponse } from "next/server";

import { requireAdminInventorySession } from "@/lib/admin-inventory-session";
import {
  createSupplierOpeningBalanceInTransaction,
  deleteSupplierOpeningBalanceInTransaction,
} from "@/lib/inventory/supplier-opening-balance";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Ctx) {
  const session = await requireAdminInventorySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: supplierId } = await context.params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const amountPaise = Number(body.amountPaise);
  if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
    return NextResponse.json(
      { error: "amountPaise must be a positive number" },
      { status: 400 },
    );
  }

  const occurredAt =
    typeof body.occurredAt === "string" && body.occurredAt
      ? new Date(body.occurredAt)
      : new Date();
  if (Number.isNaN(occurredAt.getTime())) {
    return NextResponse.json({ error: "Invalid occurredAt" }, { status: 400 });
  }

  const note = typeof body.note === "string" ? body.note : undefined;

  const prisma = getPrisma();
  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
  if (!supplier) {
    return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      await createSupplierOpeningBalanceInTransaction(tx, {
        supplierId,
        amountPaise: Math.floor(amountPaise),
        occurredAt,
        note,
      });
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to save opening balance";
    const status = msg.includes("already recorded") ? 409 : 400;
    return NextResponse.json({ error: msg }, { status });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, context: Ctx) {
  const session = await requireAdminInventorySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: supplierId } = await context.params;
  const prisma = getPrisma();

  const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
  if (!supplier) {
    return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      await deleteSupplierOpeningBalanceInTransaction(tx, supplierId);
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to remove opening balance";
    const status = msg.includes("No opening balance") ? 404 : 400;
    return NextResponse.json({ error: msg }, { status });
  }

  return NextResponse.json({ ok: true });
}
