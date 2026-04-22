import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireAdminInventorySession } from "@/lib/admin-inventory-session";
import { ensureInventorySettings } from "@/lib/inventory/inventory-settings";
import { parseDecimalQty } from "@/lib/inventory/parse-quantity";
import { recordStockAudit } from "@/lib/inventory/stock-ops";
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

  const auditedAt =
    typeof body.auditedAt === "string" && body.auditedAt
      ? new Date(body.auditedAt)
      : new Date();
  if (Number.isNaN(auditedAt.getTime())) {
    return NextResponse.json({ error: "Invalid auditedAt" }, { status: 400 });
  }
  const linesRaw = body.lines;
  if (!Array.isArray(linesRaw) || linesRaw.length === 0) {
    return NextResponse.json({ error: "lines[] required" }, { status: 400 });
  }

  const lines: { inventoryItemId: string; countedBase: Prisma.Decimal }[] = [];
  for (const raw of linesRaw) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const inventoryItemId =
      typeof o.inventoryItemId === "string" ? o.inventoryItemId.trim() : "";
    if (!inventoryItemId) {
      return NextResponse.json({ error: "inventoryItemId required" }, { status: 400 });
    }
    const counted = parseDecimalQty(o.countedBase, "countedBase");
    if ("error" in counted) {
      return NextResponse.json({ error: counted.error }, { status: 400 });
    }
    lines.push({ inventoryItemId, countedBase: counted });
  }

  const note = typeof body.note === "string" ? body.note : "";

  const prisma = getPrisma();
  try {
    const out = await prisma.$transaction(async (tx) => {
      const settings = await ensureInventorySettings(tx);
      return await recordStockAudit(tx, {
        auditedAt,
        note,
        createdByUserId: session.userId,
        allowNegativeStock: settings.allowNegativeStock,
        lines,
      });
    });
    return NextResponse.json(out);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "FAILED";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
