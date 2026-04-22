import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireAdminInventorySession } from "@/lib/admin-inventory-session";
import { d } from "@/lib/inventory/decimal-utils";
import { getPrisma } from "@/lib/prisma";
import { createVendorSaleInTransaction } from "@/lib/vendors/vendor-sale-flow";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requireAdminInventorySession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const take = Math.min(200, Math.max(1, Number(url.searchParams.get("take") ?? "50")));

  const prisma = getPrisma();
  const sales = await prisma.vendorSale.findMany({
    orderBy: { soldAt: "desc" },
    take,
    include: {
      vendor: { select: { id: true, name: true } },
      lines: { include: { menuItem: { select: { id: true, name: true } } } },
    },
  });

  return NextResponse.json({
    sales: sales.map((s) => ({
      id: s.id,
      vendorId: s.vendorId,
      vendorName: s.vendor.name,
      soldAt: s.soldAt.toISOString(),
      paymentType: s.paymentType,
      dueAt: s.dueAt?.toISOString() ?? null,
      totalPaise: s.totalPaise,
      notes: s.notes,
      lines: s.lines.map((l) => ({
        id: l.id,
        menuItemId: l.menuItemId,
        menuItemName: l.menuItem.name,
        variationId: l.variationId,
        quantity: l.quantity.toString(),
        ratePaisePerUnit: l.ratePaisePerUnit,
        lineTotalPaise: l.lineTotalPaise,
      })),
    })),
  });
}

export async function POST(request: Request) {
  const session = await requireAdminInventorySession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const vendorId = typeof body.vendorId === "string" ? body.vendorId.trim() : "";
  if (!vendorId) return NextResponse.json({ error: "vendorId required" }, { status: 400 });

  const paymentType =
    body.paymentType === "CASH" || body.paymentType === "CREDIT"
      ? (body.paymentType as "CASH" | "CREDIT")
      : "CREDIT";

  const soldAt =
    typeof body.soldAt === "string" && body.soldAt ? new Date(body.soldAt) : new Date();
  if (Number.isNaN(soldAt.getTime())) {
    return NextResponse.json({ error: "Invalid soldAt" }, { status: 400 });
  }

  let creditDays: number | null | undefined = undefined;
  if (body.creditDays !== undefined && body.creditDays !== null && body.creditDays !== "") {
    const n = Number(body.creditDays);
    if (!Number.isFinite(n) || n < 0 || n > 365) {
      return NextResponse.json(
        { error: "creditDays must be 0–365 or null" },
        { status: 400 },
      );
    }
    creditDays = Math.floor(n);
  }

  const notes = typeof body.notes === "string" ? body.notes.trim() : "";

  const linesRaw = Array.isArray(body.lines) ? body.lines : [];
  const lines: {
    menuItemId: string;
    variationId: string;
    quantity: Prisma.Decimal;
    ratePaisePerUnit: number;
  }[] =
    [];

  for (const x of linesRaw) {
    if (!x || typeof x !== "object") continue;
    const obj = x as Record<string, unknown>;
    const menuItemId =
      typeof obj.menuItemId === "string" ? obj.menuItemId.trim() : "";
    const variationId =
      typeof obj.variationId === "string" ? obj.variationId.trim() : "";
    const qtyStr = typeof obj.quantity === "string" ? obj.quantity.trim() : "";
    const rate = Number(obj.ratePaisePerUnit);
    if (!menuItemId) continue;
    if (!variationId) continue;
    if (!qtyStr) continue;
    if (!Number.isFinite(rate) || rate < 0) continue;
    lines.push({
      menuItemId,
      variationId,
      quantity: d(qtyStr),
      ratePaisePerUnit: Math.floor(rate),
    });
  }

  const prisma = getPrisma();
  try {
    const out = await prisma.$transaction((tx) =>
      createVendorSaleInTransaction(tx, {
        vendorId,
        soldAt,
        paymentType,
        creditDays: paymentType === "CREDIT" ? (creditDays ?? null) : null,
        notes,
        createdByUserId: session.userId,
        lines,
      }),
    );
    return NextResponse.json(out);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "FAILED";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

