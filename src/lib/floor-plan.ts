import { Prisma } from "@prisma/client";

import { getPrisma } from "@/lib/prisma";
import {
  DEFAULT_RESTAURANT_SETTINGS,
  normalizeHHMM,
  normalizeWhatsAppPhone,
} from "@/lib/settings-repository";
import type { FloorPlanPayload, FloorPlanTable } from "@/types/floor-plan";

function clampPct(n: number, max = 100): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(max, Math.max(0, n));
}

function normalizeTable(row: unknown): FloorPlanTable | null {
  if (!row || typeof row !== "object") return null;
  const o = row as Record<string, unknown>;
  const id =
    typeof o.id === "string" && o.id.trim() ? o.id.trim().slice(0, 64) : "";
  const label =
    typeof o.label === "string" ? o.label.trim().slice(0, 48) : "";
  if (!id || !label) return null;
  const xPct = clampPct(Number(o.xPct));
  const yPct = clampPct(Number(o.yPct));
  let widthPct = Number(o.widthPct);
  let heightPct = Number(o.heightPct);
  if (!Number.isFinite(widthPct) || widthPct <= 0) widthPct = 11;
  if (!Number.isFinite(heightPct) || heightPct <= 0) heightPct = 9;
  widthPct = clampPct(widthPct, 40);
  heightPct = clampPct(heightPct, 40);
  return { id, label, xPct, yPct, widthPct, heightPct };
}

export function parseFloorPlanJson(raw: unknown): FloorPlanPayload {
  if (!raw || typeof raw !== "object") return { tables: [] };
  const t = (raw as Record<string, unknown>).tables;
  if (!Array.isArray(t)) return { tables: [] };
  const tables: FloorPlanTable[] = [];
  const seen = new Set<string>();
  for (const row of t) {
    const n = normalizeTable(row);
    if (!n || seen.has(n.id)) continue;
    seen.add(n.id);
    tables.push({
      ...n,
      xPct: clampPct(n.xPct, 100 - n.widthPct),
      yPct: clampPct(n.yPct, 100 - n.heightPct),
    });
  }
  return { tables };
}

export function normalizeFloorPlanPayload(input: FloorPlanPayload): FloorPlanPayload {
  return parseFloorPlanJson({ tables: input.tables });
}

export async function readFloorPlan(): Promise<FloorPlanPayload> {
  const prisma = getPrisma();
  /** Raw read so floor plan works even if `prisma generate` predates `floorPlanJson` on the client. */
  const rows = await prisma.$queryRaw<{ floor_plan_json: unknown }[]>`
    SELECT "floor_plan_json" AS "floor_plan_json"
    FROM "restaurant_settings"
    WHERE "id" = ${"default"}
    LIMIT 1
  `;
  return parseFloorPlanJson(rows[0]?.floor_plan_json);
}

export async function writeFloorPlan(payload: FloorPlanPayload): Promise<void> {
  const prisma = getPrisma();
  const normalized = normalizeFloorPlanPayload(payload);
  const jsonStr = JSON.stringify(normalized);

  const existing = await prisma.restaurantSettings.findUnique({
    where: { id: "default" },
    select: { id: true },
  });

  if (!existing) {
    const d = DEFAULT_RESTAURANT_SETTINGS;
    await prisma.restaurantSettings.create({
      data: {
        id: "default",
        displayName: d.displayName,
        logoUrl: d.logoUrl,
        whatsappPhoneE164: normalizeWhatsAppPhone(d.whatsappPhoneE164),
        pickupStart: normalizeHHMM(d.pickup.start),
        pickupEnd: normalizeHHMM(d.pickup.end),
        deliveryStart: normalizeHHMM(d.delivery.start),
        deliveryEnd: normalizeHHMM(d.delivery.end),
        billHeader: d.billHeader,
        billFooter: d.billFooter,
        paymentMethodsJson: d.paymentMethods as unknown as Prisma.InputJsonValue,
      },
    });
  }

  /** Raw update: avoids Prisma client missing `floorPlanJson` after schema drift without `generate`. */
  await prisma.$executeRawUnsafe(
    `UPDATE "restaurant_settings" SET "floor_plan_json" = $1::jsonb WHERE "id" = 'default'`,
    jsonStr,
  );
}
