import { NextResponse } from "next/server";

import { ensureInventorySettings } from "@/lib/inventory/inventory-settings";
import { parseDecimalQty } from "@/lib/inventory/parse-quantity";
import {
  resolveRecipeVersion,
  scaleRecipe,
} from "@/lib/inventory/recipe-resolve";
import { recordOpeningOrAdjustment } from "@/lib/inventory/stock-ops";
import { requireAdminSession } from "@/lib/admin-session";
import { getPrisma } from "@/lib/prisma";
import type { PersonalUseKind, Prisma } from "@prisma/client";

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

type StockLineInput = { inventoryItemId: string; qtyBase: Prisma.Decimal };
type OrderLineInput = {
  menuItemId: string;
  variationId: string;
  quantity: Prisma.Decimal;
};

function parseStockLines(body: Record<string, unknown>): StockLineInput[] {
  const raw = Array.isArray(body.stockLines) ? body.stockLines : null;
  if (raw) {
    const lines: StockLineInput[] = [];
    for (const x of raw) {
      if (!x || typeof x !== "object") continue;
      const obj = x as Record<string, unknown>;
      const inventoryItemId =
        typeof obj.inventoryItemId === "string" ? obj.inventoryItemId.trim() : "";
      if (!inventoryItemId) continue;
      const qty = parseDecimalQty(obj.qtyBase, "qtyBase");
      if ("error" in qty) throw new Error(qty.error);
      if (!qty.greaterThan(0)) throw new Error("qtyBase must be > 0");
      lines.push({ inventoryItemId, qtyBase: qty });
    }
    return lines;
  }

  const inventoryItemId =
    typeof body.inventoryItemId === "string" ? body.inventoryItemId.trim() : "";
  if (!inventoryItemId) return [];
  const qty = parseDecimalQty(body.qtyBase, "qtyBase");
  if ("error" in qty) throw new Error(qty.error);
  if (!qty.greaterThan(0)) throw new Error("qtyBase must be > 0");
  return [{ inventoryItemId, qtyBase: qty }];
}

function parseOrderLines(body: Record<string, unknown>): OrderLineInput[] {
  const raw = Array.isArray(body.orderLines) ? body.orderLines : null;
  if (raw) {
    const lines: OrderLineInput[] = [];
    for (const x of raw) {
      if (!x || typeof x !== "object") continue;
      const obj = x as Record<string, unknown>;
      const menuItemId = typeof obj.menuItemId === "string" ? obj.menuItemId.trim() : "";
      const variationId =
        typeof obj.variationId === "string" ? obj.variationId.trim() : "";
      if (!menuItemId || !variationId) continue;
      const qty = parseDecimalQty(obj.quantity ?? obj.qtyBase, "quantity");
      if ("error" in qty) throw new Error(qty.error);
      if (!qty.greaterThan(0)) throw new Error("quantity must be > 0");
      lines.push({ menuItemId, variationId, quantity: qty });
    }
    return lines;
  }

  const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
  if (orderId) return [];
  return [];
}

const entrySelect = {
  id: true,
  kind: true,
  occurredAt: true,
  cashAmountPaise: true,
  inventoryItemId: true,
  qtyBase: true,
  menuItemId: true,
  variationId: true,
  orderId: true,
  note: true,
  createdAt: true,
  item: { select: { name: true, baseUnit: true } },
  menuItem: { select: { name: true } },
  variation: { select: { name: true } },
  order: { select: { orderRef: true, totalMinor: true, createdAt: true } },
} as const;

async function applyOrderLineRecipeDeduction(
  tx: Prisma.TransactionClient,
  input: {
    personalUseEntryId: string;
    menuItemId: string;
    variationId: string;
    quantity: Prisma.Decimal;
    occurredAt: Date;
    note: string;
    createdByUserId: string;
    allowNegativeStock: boolean;
  },
): Promise<void> {
  const recipe = await resolveRecipeVersion(
    tx,
    input.menuItemId,
    input.variationId,
    input.occurredAt,
  );
  if (!recipe) return;

  const consumption = scaleRecipe(recipe, input.quantity);
  for (const [inventoryItemId, qtyBase] of consumption) {
    if (!qtyBase.greaterThan(0)) continue;
    await recordOpeningOrAdjustment(tx, {
      allowNegativeStock: input.allowNegativeStock,
      inventoryItemId,
      qtyDeltaBase: qtyBase,
      direction: "down",
      reason: "OTHER",
      note: `PERSONAL_USE:${input.note}`.slice(0, 500),
      occurredAt: input.occurredAt,
      createdByUserId: input.createdByUserId,
      referenceType: "personal_use",
      referenceId: input.personalUseEntryId,
    });
  }
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
    select: entrySelect,
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
          select: entrySelect,
        });
        return { entry: row };
      }

      if (kind === "STOCK") {
        const stockLines = parseStockLines(body);
        if (stockLines.length === 0) {
          throw new Error("At least one stock line is required");
        }

        const settings = await ensureInventorySettings(tx);
        const rows = [];
        for (const line of stockLines) {
          const row = await tx.personalUseEntry.create({
            data: {
              kind,
              occurredAt,
              inventoryItemId: line.inventoryItemId,
              qtyBase: line.qtyBase,
              note: note.slice(0, 500),
              createdById: session.userId,
            },
            select: entrySelect,
          });

          await recordOpeningOrAdjustment(tx, {
            allowNegativeStock: settings.allowNegativeStock,
            inventoryItemId: line.inventoryItemId,
            qtyDeltaBase: line.qtyBase,
            direction: "down",
            reason: "OTHER",
            note: `PERSONAL_USE:${note}`.slice(0, 500),
            occurredAt,
            createdByUserId: session.userId,
            referenceType: "personal_use",
            referenceId: row.id,
          });

          rows.push(row);
        }

        return rows.length === 1 ? { entry: rows[0] } : { entries: rows };
      }

      if (kind === "ORDER") {
        const orderLines = parseOrderLines(body);
        if (orderLines.length > 0) {
          const settings = await ensureInventorySettings(tx);
          const rows = [];
          for (const line of orderLines) {
            const row = await tx.personalUseEntry.create({
              data: {
                kind,
                occurredAt,
                menuItemId: line.menuItemId,
                variationId: line.variationId,
                qtyBase: line.quantity,
                note: note.slice(0, 500),
                createdById: session.userId,
              },
              select: entrySelect,
            });

            await applyOrderLineRecipeDeduction(tx, {
              personalUseEntryId: row.id,
              menuItemId: line.menuItemId,
              variationId: line.variationId,
              quantity: line.quantity,
              occurredAt,
              note,
              createdByUserId: session.userId,
              allowNegativeStock: settings.allowNegativeStock,
            });

            rows.push(row);
          }

          return rows.length === 1 ? { entry: rows[0] } : { entries: rows };
        }

        const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
        if (!orderId) throw new Error("At least one menu item line or orderId is required");

        const row = await tx.personalUseEntry.create({
          data: {
            kind,
            occurredAt,
            orderId,
            note: note.slice(0, 500),
            createdById: session.userId,
          },
          select: entrySelect,
        });
        return { entry: row };
      }

      const row = await tx.personalUseEntry.create({
        data: {
          kind,
          occurredAt,
          note: note.slice(0, 500),
          createdById: session.userId,
        },
        select: entrySelect,
      });
      return { entry: row };
    });

    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Create failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
