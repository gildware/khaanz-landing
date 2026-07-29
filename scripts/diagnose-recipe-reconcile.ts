/**
 * Explains why the recipe reconcile preview shows differences.
 *
 * Splits each per-ingredient delta into two causes:
 *   A) effective-dating — current recipe differs from the one live at sale time
 *   B) drift — what was actually deducted differs from the recipe live at sale time
 *
 * Run: npx tsx scripts/diagnose-recipe-reconcile.ts
 */
import type { Prisma } from "@prisma/client";

import { migrateCartLine } from "../src/lib/cart-line";
import { createMenuConsumptionCache } from "../src/lib/inventory/consumption-cache";
import { D0, d } from "../src/lib/inventory/decimal-utils";
import { planOrderConsumption } from "../src/lib/inventory/plan-order-consumption";
import { getPrisma } from "../src/lib/prisma";
import type { CartLine } from "../src/types/menu";

function add(
  map: Map<string, Prisma.Decimal>,
  key: string,
  qty: Prisma.Decimal,
): void {
  map.set(key, (map.get(key) ?? D0).add(qty));
}

async function main() {
  const prisma = getPrisma();
  const now = new Date();

  const orders = await prisma.order.findMany({
    where: {
      inventoryDeductedAt: { not: null },
      inventoryRestoredAt: null,
      status: { not: "CANCELLED" },
    },
    select: {
      id: true,
      orderRef: true,
      createdAt: true,
      lines: { orderBy: { sortIndex: "asc" }, select: { payload: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Orders in scope: ${orders.length}`);
  if (orders.length > 0) {
    console.log(
      `Date range: ${orders[0].createdAt.toISOString()} → ${orders[orders.length - 1].createdAt.toISOString()}`,
    );
  }

  const shouldNow = new Map<string, Prisma.Decimal>();
  const shouldThen = new Map<string, Prisma.Decimal>();
  const cache = createMenuConsumptionCache();

  // Orders whose as-of-now plan differs from their as-of-sale-time plan.
  const datingOrders: { ref: string; at: Date }[] = [];

  for (const o of orders) {
    const lines = o.lines.map((l) =>
      migrateCartLine(l.payload as unknown as CartLine),
    );
    const nowPlan = await planOrderConsumption(prisma, { lines }, now, cache);
    const thenPlan = await planOrderConsumption(
      prisma,
      { lines },
      o.createdAt,
      cache,
    );

    for (const [id, qty] of nowPlan) add(shouldNow, id, qty);
    for (const [id, qty] of thenPlan) add(shouldThen, id, qty);

    let differs = nowPlan.size !== thenPlan.size;
    if (!differs) {
      for (const [id, qty] of nowPlan) {
        if (!(thenPlan.get(id) ?? D0).equals(qty)) {
          differs = true;
          break;
        }
      }
    }
    if (differs) {
      datingOrders.push({ ref: o.orderRef ?? o.id, at: o.createdAt });
    }
  }

  const deducted = new Map<string, Prisma.Decimal>();
  const consRows = await prisma.inventoryBatchConsumption.groupBy({
    by: ["inventoryItemId"],
    where: {
      orderId: { in: orders.map((o) => o.id) },
      referenceType: "order",
    },
    _sum: { qtyBase: true },
  });
  for (const r of consRows) {
    deducted.set(r.inventoryItemId, r._sum.qtyBase ?? D0);
  }

  const prior = new Map<string, Prisma.Decimal>();
  const priorRows = await prisma.inventoryMovement.findMany({
    where: { referenceType: "recipe_reconcile" },
    select: { inventoryItemId: true, qtyDeltaBase: true },
  });
  for (const r of priorRows) add(prior, r.inventoryItemId, r.qtyDeltaBase);

  const ids = new Set([
    ...deducted.keys(),
    ...shouldNow.keys(),
    ...shouldThen.keys(),
  ]);
  const items = await prisma.inventoryItem.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, name: true, baseUnit: true, active: true },
  });
  const meta = new Map(items.map((i) => [i.id, i]));

  type Row = {
    name: string;
    unit: string;
    active: boolean;
    deducted: Prisma.Decimal;
    then: Prisma.Decimal;
    now: Prisma.Decimal;
    prior: Prisma.Decimal;
    total: Prisma.Decimal;
    dating: Prisma.Decimal;
    drift: Prisma.Decimal;
  };

  const rows: Row[] = [];
  for (const id of ids) {
    const dd = deducted.get(id) ?? D0;
    const th = shouldThen.get(id) ?? D0;
    const nw = shouldNow.get(id) ?? D0;
    const pr = prior.get(id) ?? D0;
    const effective = dd.sub(pr);
    const total = effective.sub(nw);
    if (total.abs().lessThan(d("0.01"))) continue;
    const m = meta.get(id);
    rows.push({
      name: m?.name ?? id,
      unit: m?.baseUnit ?? "",
      active: m?.active ?? false,
      deducted: dd,
      then: th,
      now: nw,
      prior: pr,
      total,
      dating: th.sub(nw),
      drift: effective.sub(th),
    });
  }

  rows.sort((a, b) => Number(b.total.abs().sub(a.total.abs()).toString()));

  console.log(
    `\nOrders whose plan changed between sale time and now: ${datingOrders.length}`,
  );
  for (const o of datingOrders.slice(0, 10)) {
    console.log(`  ${o.ref}  ${o.at.toISOString()}`);
  }
  if (datingOrders.length > 10) {
    console.log(`  … +${datingOrders.length - 10} more`);
  }

  console.log(`\nIngredients with a non-zero delta: ${rows.length}\n`);
  console.log(
    [
      "ingredient".padEnd(34),
      "deducted".padStart(12),
      "then".padStart(12),
      "now".padStart(12),
      "TOTAL".padStart(12),
      "dating".padStart(12),
      "drift".padStart(12),
      "active",
    ].join(" "),
  );
  for (const r of rows) {
    console.log(
      [
        `${r.name} (${r.unit})`.slice(0, 34).padEnd(34),
        r.deducted.toFixed(2).padStart(12),
        r.then.toFixed(2).padStart(12),
        r.now.toFixed(2).padStart(12),
        r.total.toFixed(2).padStart(12),
        r.dating.toFixed(2).padStart(12),
        r.drift.toFixed(2).padStart(12),
        r.active ? "yes" : "NO",
      ].join(" "),
    );
  }

  const sum = (pick: (r: Row) => Prisma.Decimal) =>
    rows.reduce((acc, r) => acc.add(pick(r).abs()), D0);
  console.log(
    `\nTotal |dating| = ${sum((r) => r.dating).toFixed(2)}   Total |drift| = ${sum((r) => r.drift).toFixed(2)}`,
  );
  const inactive = rows.filter((r) => !r.active);
  if (inactive.length > 0) {
    console.log(
      `\nWARNING: ${inactive.length} inactive ingredient(s) would fail on apply: ${inactive
        .map((r) => r.name)
        .join(", ")}`,
    );
  }

  await prisma.$disconnect();
}

void main();
