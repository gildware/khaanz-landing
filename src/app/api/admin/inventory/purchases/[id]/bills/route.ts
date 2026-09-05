import { NextResponse } from "next/server";

import { requireAdminInventorySession } from "@/lib/admin-inventory-session";
import { parsePurchaseBills } from "@/lib/inventory/purchase-bills";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Ctx) {
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

  const bills = parsePurchaseBills(body.bills);
  const prisma = getPrisma();
  try {
    const row = await prisma.purchase.update({
      where: { id },
      data: { bills },
      select: { id: true, bills: true },
    });
    return NextResponse.json({
      id: row.id,
      bills: parsePurchaseBills(row.bills),
    });
  } catch {
    return NextResponse.json({ error: "Purchase not found" }, { status: 404 });
  }
}
