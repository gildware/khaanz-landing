import { NextResponse } from "next/server";

import { requireAdminInventorySession } from "@/lib/admin-inventory-session";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const session = await requireAdminInventorySession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const prisma = getPrisma();
  const rows = await prisma.vendorSellableMenuItem.findMany({
    where: { active: true },
    include: { menuItem: { select: { id: true, name: true } } },
    orderBy: { menuItem: { name: "asc" } },
  });
  return NextResponse.json({
    items: rows.map((r) => ({ menuItemId: r.menuItemId, name: r.menuItem.name })),
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

  const menuItemIds = Array.isArray(body.menuItemIds)
    ? body.menuItemIds.filter((x): x is string => typeof x === "string").map((s) => s.trim()).filter(Boolean)
    : [];

  const uniq = [...new Set(menuItemIds)];
  const prisma = getPrisma();

  await prisma.$transaction(async (tx) => {
    // Disable everything first (keeps history rows).
    await tx.vendorSellableMenuItem.updateMany({
      data: { active: false },
    });

    for (const id of uniq) {
      await tx.vendorSellableMenuItem.upsert({
        where: { menuItemId: id },
        create: { menuItemId: id, active: true },
        update: { active: true },
      });
    }
  });

  return NextResponse.json({ ok: true, count: uniq.length });
}

