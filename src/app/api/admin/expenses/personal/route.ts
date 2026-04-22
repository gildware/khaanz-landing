import { NextResponse } from "next/server";

import { ensureInventorySettings } from "@/lib/inventory/inventory-settings";
import { parseDecimalQty } from "@/lib/inventory/parse-quantity";
import { recordOpeningOrAdjustment } from "@/lib/inventory/stock-ops";
import { requireAdminSession } from "@/lib/admin-session";
import { getPrisma } from "@/lib/prisma";
import type { PersonalUseKind } from "@prisma/client";

export const runtime = "nodejs";

const KINDS: PersonalUseKind[] = ["CASH", "STOCK", "ORDER", "OTHER"];
function isKind(x: unknown): x is PersonalUseKind {
  return typeof x === "string" && KINDS.includes(x as PersonalUseKind);
}

function parseIntPaise(x: unknown, field: string): { ok: true; value: number } | { ok: false; error: string } {
  const n = typeof x === "number" ? x : typeof x === "string" ? Number(x) : NaN;
  if (!Number.isFinite(n)) return { ok: false, error: `${field} must be a number` };
  const v = Math.trunc(n);
  if (v < 0) return { ok: false, error: `${field} must be >= 0` };
  return { ok: true, value: v };
}

export async function GET(request: Request) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const kind = url.searchParams.get("kind");

  const occurredAt: { gte?: Date; lt?: Date } = {};
  if (from) {
    const d = new Date(from);
    if (!Number.isNaN(d.getTime())) occurredAt.gte = d;
  }
  if (to) {
    const d = new Date(to);
    if (!Number.isNaN(d.getTime())) occurredAt.lt = d;
  }

  const prisma = getPrisma();
  const entries = await prisma.personalUseEntry.findMany({
    where: {
      ...(Object.keys(occurredAt).length ? { occurredAt } : {}),
      ...(isKind(kind) ? { kind } : {}),
    },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    take: 200,
    select: {
      id: true,
      kind: true,
      occurredAt: true,
      cashAmountPaise: true,
      inventoryItemId: true,
      qtyBase: true,
      orderId: true,
      note: true,
      createdAt: true,
      item: { select: { name: true, baseUnit: true } },
      order: { select: { orderRef: true, totalMinor: true, createdAt: true } },
    },
  });
  return NextResponse.json({ entries });
}

export async function POST(request: Request) {
  const session = await requireAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const kind: PersonalUseKind = isKind(body.kind) ? body.kind : "OTHER";
  const occurredAt =
    typeof body.occurredAt === "string" && body.occurredAt
      ? new Date(body.occurredAt)
      : new Date();
  if (Number.isNaN(occurredAt.getTime())) {
    return NextResponse.json({ error: "Invalid occurredAt" }, { status: 400 });
  }

  const note = typeof body.note === "string" ? body.note : "";

  const prisma = getPrisma();
  try {
    const result = await prisma.$transaction(async (tx) => {
      if (kind === "CASH") {
        const amt = parseIntPaise(body.cashAmountPaise, "cashAmountPaise");
        if (!amt.ok) throw new Error(amt.error);
        if (amt.value <= 0) throw new Error("cashAmountPaise must be > 0");
        const row = await tx.personalUseEntry.create({
          data: {
            kind,
            occurredAt,
            cashAmountPaise: amt.value,
            note: note.slice(0, 500),
            createdById: session.userId,
          },
          select: {
            id: true,
            kind: true,
            occurredAt: true,
            cashAmountPaise: true,
            inventoryItemId: true,
            qtyBase: true,
            orderId: true,
            note: true,
            createdAt: true,
          },
        });
        return row;
      }

      if (kind === "STOCK") {
        const inventoryItemId =
          typeof body.inventoryItemId === "string" ? body.inventoryItemId.trim() : "";
        if (!inventoryItemId) throw new Error("inventoryItemId required");
        const qty = parseDecimalQty(body.qtyBase, "qtyBase");
        if ("error" in qty) throw new Error(qty.error);
        if (!qty.greaterThan(0)) throw new Error("qtyBase must be > 0");

        const row = await tx.personalUseEntry.create({
          data: {
            kind,
            occurredAt,
            inventoryItemId,
            qtyBase: qty,
            note: note.slice(0, 500),
            createdById: session.userId,
          },
          select: {
            id: true,
            kind: true,
            occurredAt: true,
            cashAmountPaise: true,
            inventoryItemId: true,
            qtyBase: true,
            orderId: true,
            note: true,
            createdAt: true,
          },
        });

        const settings = await ensureInventorySettings(tx);
        await recordOpeningOrAdjustment(tx, {
          allowNegativeStock: settings.allowNegativeStock,
          inventoryItemId,
          qtyDeltaBase: qty,
          direction: "down",
          reason: "OTHER",
          note: `PERSONAL_USE:${note}`.slice(0, 500),
          occurredAt,
          createdByUserId: session.userId,
          referenceType: "personal_use",
          referenceId: row.id,
        });

        return row;
      }

      if (kind === "ORDER") {
        const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
        if (!orderId) throw new Error("orderId required");

        const row = await tx.personalUseEntry.create({
          data: {
            kind,
            occurredAt,
            orderId,
            note: note.slice(0, 500),
            createdById: session.userId,
          },
          select: {
            id: true,
            kind: true,
            occurredAt: true,
            cashAmountPaise: true,
            inventoryItemId: true,
            qtyBase: true,
            orderId: true,
            note: true,
            createdAt: true,
          },
        });
        return row;
      }

      const row = await tx.personalUseEntry.create({
        data: {
          kind,
          occurredAt,
          note: note.slice(0, 500),
          createdById: session.userId,
        },
        select: {
          id: true,
          kind: true,
          occurredAt: true,
          cashAmountPaise: true,
          inventoryItemId: true,
          qtyBase: true,
          orderId: true,
          note: true,
          createdAt: true,
        },
      });
      return row;
    });

    return NextResponse.json({ entry: result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Create failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

