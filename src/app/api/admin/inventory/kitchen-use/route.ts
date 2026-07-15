import { NextResponse } from "next/server";

import { requireAdminInventorySession } from "@/lib/admin-inventory-session";
import { ensureInventorySettings } from "@/lib/inventory/inventory-settings";
import { parseDecimalQty } from "@/lib/inventory/parse-quantity";
import { recordKitchenUse } from "@/lib/inventory/stock-ops";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await requireAdminInventorySession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const limit = Math.min(
    500,
    Math.max(1, Math.floor(Number(url.searchParams.get("limit") ?? "100"))),
  );

  const usedAt: { gte?: Date; lt?: Date } = {};
  if (from) {
    const d = new Date(from);
    if (!Number.isNaN(d.getTime())) usedAt.gte = d;
  }
  if (to) {
    const d = new Date(to);
    if (!Number.isNaN(d.getTime())) usedAt.lt = d;
  }

  const prisma = getPrisma();
  const entries = await prisma.kitchenUseEntry.findMany({
    where: Object.keys(usedAt).length ? { usedAt } : {},
    orderBy: [{ usedAt: "desc" }, { createdAt: "desc" }],
    take: limit,
    select: {
      id: true,
      inventoryItemId: true,
      usedAt: true,
      qtyBase: true,
      costPaise: true,
      note: true,
      createdAt: true,
      item: { select: { name: true, baseUnit: true } },
    },
  });

  return NextResponse.json({
    entries: entries.map((e) => ({
      id: e.id,
      inventoryItemId: e.inventoryItemId,
      usedAt: e.usedAt.toISOString(),
      qtyBase: e.qtyBase.toString(),
      costPaise: e.costPaise,
      note: e.note,
      createdAt: e.createdAt.toISOString(),
      item: e.item,
    })),
  });
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

  const inventoryItemId =
    typeof body.inventoryItemId === "string" ? body.inventoryItemId.trim() : "";
  if (!inventoryItemId) {
    return NextResponse.json({ error: "inventoryItemId required" }, { status: 400 });
  }
  const qty = parseDecimalQty(body.qtyBase, "qtyBase");
  if ("error" in qty) {
    return NextResponse.json({ error: qty.error }, { status: 400 });
  }
  const usedAt =
    typeof body.usedAt === "string" && body.usedAt
      ? new Date(body.usedAt)
      : new Date();
  if (Number.isNaN(usedAt.getTime())) {
    return NextResponse.json({ error: "Invalid usedAt" }, { status: 400 });
  }
  const note = typeof body.note === "string" ? body.note : "";

  const prisma = getPrisma();
  try {
    const out = await prisma.$transaction(async (tx) => {
      const settings = await ensureInventorySettings(tx);
      return await recordKitchenUse(tx, {
        allowNegativeStock: settings.allowNegativeStock,
        inventoryItemId,
        qtyBase: qty,
        usedAt,
        note,
        createdByUserId: session.userId,
      });
    });
    return NextResponse.json(out);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "FAILED";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
