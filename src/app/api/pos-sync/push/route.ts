import { randomUUID } from "crypto";

import { NextResponse } from "next/server";

import { readFloorPlan } from "@/lib/floor-plan";
import { httpResponseForOrderPersistError } from "@/lib/order-persist-errors";
import { persistPosOrderToDatabase } from "@/lib/persist-order-db";
import { parseOrderCreateBody } from "@/lib/parse-order-create-body";
import { findOccupyingOrderForTable } from "@/lib/pos-occupied-tables";
import { getPrisma } from "@/lib/prisma";
import { readRestaurantSettings } from "@/lib/settings-repository";

export const runtime = "nodejs";

function requireSyncKey(req: Request): string | null {
  const expected = (process.env.POS_SYNC_KEY || "").trim();
  if (!expected) return null;
  const got = (req.headers.get("x-pos-sync-key") || "").trim();
  if (!got || got !== expected) return null;
  return got;
}

function parseClientOrderId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (s.length !== 36) return null;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      s,
    )
  ) {
    return null;
  }
  return s;
}

type PersistSyncResult =
  | { ok: true }
  | { ok: false; retry: boolean; error: string };

async function persistPosOrderPayload(payload: unknown): Promise<PersistSyncResult> {
  if (!payload || typeof payload !== "object") {
    return { ok: false, retry: false, error: "Invalid event payload" };
  }

  const rec = payload as Record<string, unknown>;
  const body = rec.body;
  if (!body || typeof body !== "object") {
    return { ok: false, retry: false, error: "Missing order body" };
  }

  const parsed = parseOrderCreateBody(body, { posMode: true });
  if ("error" in parsed) {
    return { ok: false, retry: false, error: parsed.error };
  }

  const bodyRec = body as Record<string, unknown>;
  const rawPm =
    typeof bodyRec.paymentMethodKey === "string"
      ? bodyRec.paymentMethodKey.trim().slice(0, 64)
      : "";

  const [settings, floorPlan] = await Promise.all([
    readRestaurantSettings(),
    readFloorPlan(),
  ]);

  const allowed = new Set(settings.paymentMethods.map((p) => p.id));
  let paymentMethodKey = "";
  if (rawPm) {
    if (!allowed.has(rawPm)) {
      return {
        ok: false,
        retry: false,
        error: "Invalid payment method. Refresh settings and try again.",
      };
    }
    paymentMethodKey = rawPm;
  }

  let dineInTable = "";
  if (parsed.fulfillment === "dine_in" && floorPlan.tables.length > 0) {
    const tableId =
      typeof bodyRec.tableId === "string" ? bodyRec.tableId.trim().slice(0, 64) : "";
    const t = floorPlan.tables.find((x) => x.id === tableId);
    if (!t) {
      return {
        ok: false,
        retry: false,
        error: "Choose a table for dine-in (floor plan is configured).",
      };
    }
    dineInTable = t.label.trim().slice(0, 80);
    const occupying = await findOccupyingOrderForTable(getPrisma(), dineInTable);
    if (occupying) {
      return {
        ok: false,
        retry: false,
        error: `Table ${dineInTable} is occupied (${occupying.orderRef ?? "open order"}). Clear the table or update that order.`,
      };
    }
  }

  const clientOrderId =
    parseClientOrderId(rec.clientOrderId) ?? parseClientOrderId(bodyRec.clientOrderId);

  if (clientOrderId) {
    const prisma = getPrisma();
    const existing = await prisma.order.findUnique({
      where: { id: clientOrderId },
      select: { orderRef: true },
    });
    if (existing?.orderRef) {
      return { ok: true };
    }
  }

  const orderId = clientOrderId ?? randomUUID();

  try {
    await persistPosOrderToDatabase(orderId, parsed, {
      paymentMethodKey,
      dineInTable,
      adminUserId: null,
    });
    return { ok: true };
  } catch (e) {
    console.error("POS sync order persist failed:", e);
    const { error } = httpResponseForOrderPersistError(e);
    return { ok: false, retry: true, error };
  }
}

export async function POST(req: Request) {
  if (!requireSyncKey(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const body = json && typeof json === "object" ? (json as Record<string, unknown>) : {};
  const events = Array.isArray(body.events) ? body.events : [];

  const acceptedEventIds: string[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const e of events) {
    if (!e || typeof e !== "object") continue;
    const rec = e as Record<string, unknown>;
    const id = typeof rec.id === "string" ? rec.id.trim() : "";
    if (!id) continue;

    const type = typeof rec.type === "string" ? rec.type.trim() : "";
    if (type === "pos.orderPayload") {
      const result = await persistPosOrderPayload(rec.payload);
      if (result.ok) {
        acceptedEventIds.push(id);
      } else if (!result.retry) {
        // Drop permanently invalid payloads so the device outbox does not retry forever.
        acceptedEventIds.push(id);
        failed.push({ id, error: result.error });
      } else {
        failed.push({ id, error: result.error });
      }
      continue;
    }

    acceptedEventIds.push(id);
  }

  return NextResponse.json({ ok: true, acceptedEventIds, failed });
}
