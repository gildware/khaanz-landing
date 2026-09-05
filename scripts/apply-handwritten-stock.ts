/**
 * Apply 1 Sep 2026 opening stock (notebook + zero unlisted) then net Sept ops.
 * Also: cash pool ₹69,100 from 1 Sep; Royal Rabdi @ 25 cost ₹23.
 *
 * Dry run: npx tsx scripts/apply-handwritten-stock.ts --dry-run
 * Apply:   npx tsx scripts/apply-handwritten-stock.ts
 */
import type { InventoryMovementType, Prisma } from "@prisma/client";

import { d } from "../src/lib/inventory/decimal-utils";
import { itemUnitCostPaisePerBase } from "../src/lib/inventory/inventory-costing";
import { ensureInventorySettings } from "../src/lib/inventory/inventory-settings";
import { recordStockAudit } from "../src/lib/inventory/stock-ops";
import { parseIstDateInput } from "../src/lib/ist-dates";
import { getPrisma } from "../src/lib/prisma";

import { LINES } from "./generate-handwritten-stock-html";

const OPENING_DAY = "2026-09-01";
const CASH_OPENING_PAISE = 6_910_000; // ₹69,100
const AUDIT_NOTE =
  "Physical count 1 Sep 2026 (notebook). Unlisted items 0. Live qty = opening + Sept purchases/sales/kitchen/wastage/etc.";
const SEPT_OPS_EXCLUDE: InventoryMovementType[] = [
  "OPENING_STOCK",
  "AUDIT_SURPLUS",
  "AUDIT_SHORTAGE",
];

type OpeningAgg = {
  name: string;
  openingBase: number;
  unit: string;
  isNew: boolean;
  category: string;
  ratePaisePerBase: number | null;
  rateFromDbName?: string;
};

function buildOpenings(): Map<string, OpeningAgg> {
  const byName = new Map<string, OpeningAgg>();
  const asks = LINES.filter((l) => l.confidence === "ask");
  if (asks.length > 0) {
    throw new Error(`Unresolved ask lines: ${asks.map((l) => l.writtenName).join(", ")}`);
  }

  for (const l of LINES) {
    if (l.confidence === "skip") continue;
    if (l.guessBase == null) {
      throw new Error(`Mapped line missing qty: ${l.writtenName}`);
    }
    if (l.confidence === "mapped") {
      if (!l.dbName) throw new Error(`Mapped line missing dbName: ${l.writtenName}`);
      const prev = byName.get(l.dbName);
      if (prev) {
        prev.openingBase += l.guessBase;
      } else {
        byName.set(l.dbName, {
          name: l.dbName,
          openingBase: l.guessBase,
          unit: l.guessUnit,
          isNew: false,
          category: "",
          ratePaisePerBase: l.manualRatePaisePerBase ?? null,
          rateFromDbName: l.rateFromDbName,
        });
      }
      continue;
    }
    if (l.confidence === "no-db") {
      const name = l.createName?.trim();
      if (!name) throw new Error(`New item missing createName: ${l.writtenName}`);
      if (byName.has(name)) throw new Error(`Duplicate new item name: ${name}`);
      byName.set(name, {
        name,
        openingBase: l.guessBase,
        unit: l.guessUnit,
        isNew: true,
        category: l.createCategory?.trim() || "Miscellaneous",
        ratePaisePerBase: l.manualRatePaisePerBase ?? null,
        rateFromDbName: l.rateFromDbName,
      });
    }
  }
  return byName;
}

function fmtQty(n: number): string {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 4 });
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const prisma = getPrisma();
  const openings = buildOpenings();
  const sept1 = parseIstDateInput(OPENING_DAY);
  if (!sept1) throw new Error("Bad opening date");
  const auditedAt = new Date();

  const [settings, dbItems, septSums] = await Promise.all([
    ensureInventorySettings(prisma),
    prisma.inventoryItem.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        category: true,
        baseUnit: true,
        stockOnHandBase: true,
        avgCostPaisePerBase: true,
        lastPurchasePaisePerBase: true,
      },
    }),
    prisma.inventoryMovement.groupBy({
      by: ["inventoryItemId"],
      where: {
        occurredAt: { gte: sept1 },
        type: { notIn: SEPT_OPS_EXCLUDE },
      },
      _sum: { qtyDeltaBase: true },
    }),
  ]);

  const byName = new Map(dbItems.map((i) => [i.name, i]));
  const septByItemId = new Map(
    septSums.map((s) => [s.inventoryItemId, Number(s._sum.qtyDeltaBase ?? 0)]),
  );

  function rateFor(agg: OpeningAgg): number {
    if (agg.ratePaisePerBase && agg.ratePaisePerBase > 0) return agg.ratePaisePerBase;
    if (agg.rateFromDbName) {
      const ref = byName.get(agg.rateFromDbName);
      if (ref) {
        const r = Number(itemUnitCostPaisePerBase(ref, settings.costingMethod));
        if (r > 0) return r;
      }
    }
    const existing = byName.get(agg.name);
    if (existing) {
      const r = Number(itemUnitCostPaisePerBase(existing, settings.costingMethod));
      if (r > 0) return r;
    }
    return 0;
  }

  type PlanRow = {
    name: string;
    id: string | null;
    create: boolean;
    opening: number;
    septNet: number;
    target: number;
    current: number;
    unit: string;
    rate: number;
    category: string;
  };

  const plan: PlanRow[] = [];
  const seenIds = new Set<string>();

  for (const agg of openings.values()) {
    const existing = byName.get(agg.name);
    if (agg.isNew && existing) {
      throw new Error(`New item already exists: ${agg.name}`);
    }
    if (!agg.isNew && !existing) {
      throw new Error(`Mapped DB item missing: ${agg.name}`);
    }
    const septNet = existing ? (septByItemId.get(existing.id) ?? 0) : 0;
    plan.push({
      name: agg.name,
      id: existing?.id ?? null,
      create: agg.isNew,
      opening: agg.openingBase,
      septNet,
      target: agg.openingBase + septNet,
      current: existing ? Number(existing.stockOnHandBase) : 0,
      unit: existing?.baseUnit ?? agg.unit,
      rate: rateFor(agg),
      category: agg.category || existing?.category || "",
    });
    if (existing) seenIds.add(existing.id);
  }

  for (const item of dbItems) {
    if (seenIds.has(item.id)) continue;
    const septNet = septByItemId.get(item.id) ?? 0;
    plan.push({
      name: item.name,
      id: item.id,
      create: false,
      opening: 0,
      septNet,
      target: septNet,
      current: Number(item.stockOnHandBase),
      unit: item.baseUnit,
      rate: Number(itemUnitCostPaisePerBase(item, settings.costingMethod)),
      category: item.category,
    });
  }

  plan.sort((a, b) => a.name.localeCompare(b.name));

  const toCreate = plan.filter((p) => p.create);
  const changing = plan.filter((p) => Math.abs(p.target - p.current) > 0.0000001);
  console.log(
    `Handwritten stock apply ${dryRun ? "(DRY RUN) " : ""}— ${plan.length} active items`,
  );
  console.log(`  opening date ${OPENING_DAY} IST · audit clock ${auditedAt.toISOString()}`);
  console.log(`  create ${toCreate.length} · qty changes ${changing.length}`);
  console.log(`  cash opening ₹${(CASH_OPENING_PAISE / 100).toLocaleString("en-IN")} from ${OPENING_DAY}`);
  console.log(`  Royal Rabdi @ 25 cost → ₹23`);
  for (const p of toCreate) {
    console.log(
      `  [create] ${p.name}: opening ${fmtQty(p.opening)} ${p.unit} → live ${fmtQty(p.target)} ${p.unit} @ ₹${(p.rate / 100).toFixed(2)}`,
    );
  }
  for (const p of changing.filter((x) => !x.create).slice(0, 30)) {
    console.log(
      `  [set] ${p.name}: ${fmtQty(p.current)} → ${fmtQty(p.target)} ${p.unit} (open ${fmtQty(p.opening)} + sept ${fmtQty(p.septNet)})`,
    );
  }
  if (changing.filter((x) => !x.create).length > 30) {
    console.log(`  … ${changing.filter((x) => !x.create).length - 30} more qty changes`);
  }

  if (dryRun) {
    await prisma.$disconnect();
    return;
  }

  const result = await prisma.$transaction(
    async (tx) => {
      let created = 0;
      const idByName = new Map(dbItems.map((i) => [i.name, i.id]));

      for (const p of toCreate) {
        const agg = openings.get(p.name)!;
        const rate = p.rate;
        const row = await tx.inventoryItem.create({
          data: {
            name: p.name,
            category: p.category,
            baseUnit: p.unit,
            purchaseUnit: p.unit,
            baseUnitsPerPurchaseUnit: 1,
            stockOnHandBase: 0,
            minStockBase: 0,
            avgCostPaisePerBase: rate,
            lastPurchasePaisePerBase: rate,
            active: true,
          },
          select: { id: true },
        });
        idByName.set(p.name, row.id);
        created++;
      }

      const rabdi = await tx.inventoryItem.findFirst({
        where: { name: "Royal Rabdi @ 25", active: true },
        select: { id: true },
      });
      if (rabdi) {
        await tx.inventoryItem.update({
          where: { id: rabdi.id },
          data: { avgCostPaisePerBase: 2300, lastPurchasePaisePerBase: 2300 },
        });
      }

      const auditLines: { inventoryItemId: string; countedBase: Prisma.Decimal }[] = [];
      for (const p of plan) {
        const id = p.id ?? idByName.get(p.name);
        if (!id) throw new Error(`Missing id for ${p.name}`);
        auditLines.push({ inventoryItemId: id, countedBase: d(p.target) });
      }

      const invSettings = await ensureInventorySettings(tx);
      const audit = await recordStockAudit(tx, {
        auditedAt,
        note: AUDIT_NOTE,
        allowNegativeStock: invSettings.allowNegativeStock,
        lines: auditLines,
      });

      await tx.cashPoolSettings.upsert({
        where: { id: "default" },
        create: {
          id: "default",
          openingBalancePaise: CASH_OPENING_PAISE,
          openingEffectiveAt: sept1,
          note: "Available money as of 1 Sep 2026",
        },
        update: {
          openingBalancePaise: CASH_OPENING_PAISE,
          openingEffectiveAt: sept1,
          note: "Available money as of 1 Sep 2026",
        },
      });

      return { created, auditId: audit.auditId, auditLines: auditLines.length };
    },
    { timeout: 300_000 },
  );

  console.log("\nApplied:");
  console.log(`  ${result.created} items created`);
  console.log(`  ${result.auditLines} audit lines (${result.auditId})`);
  console.log(`  cash opening ₹69,100 from ${OPENING_DAY}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
