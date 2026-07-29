/**
 * Applies physical stock counts from stock-count-sheet data to live DB.
 * Creates pending inventory items, updates rates, and records a bulk stock audit.
 *
 * Run: npx tsx scripts/apply-stock-count.ts
 * Dry run: npx tsx scripts/apply-stock-count.ts --dry-run
 */
import type { Prisma } from "@prisma/client";

import { d } from "../src/lib/inventory/decimal-utils";
import { ensureInventorySettings } from "../src/lib/inventory/inventory-settings";
import { recordOpeningStock, recordStockAudit } from "../src/lib/inventory/stock-ops";
import { getPrisma } from "../src/lib/prisma";

import { buildStockCountRows, readinessTab, type FlatRow } from "./generate-stock-count-html";

const SECTION_CATEGORY: Record<string, string> = {
  Sauces: "Sauces",
  "Beverages & Water": "Drinks",
  Spices: "Spices",
  Dry: "Dry",
  Vegetables: "Vegetables",
  Others: "Miscellaneous",
  "Egg & Dairy": "Dairy",
  "Chicken & Fish": "Chicken & Fish",
  "Ice Cream": "Ice Cream",
  Frozen: "Miscellaneous",
  "Mojitos & Shakes": "Shakes & Mojitos",
  "Pizza & Burgers": "Pizza & Burgers",
  "Khada Masale (Whole Spices)": "Whole Spices",
  "Disposable & Misc": "Disposable",
  "Additional Raw Stock (27 Jul)": "Miscellaneous",
  "Prep Batch Stock (27 Jul)": "Miscellaneous",
};

function inventoryCategory(fr: FlatRow): string {
  const section = fr.sourceCategories[0] ?? fr.category.split(" · ")[0] ?? "Miscellaneous";
  return SECTION_CATEGORY[section] ?? "Miscellaneous";
}

function shouldUpdateRate(fr: FlatRow, currentAvgPaise: number): boolean {
  const ratePaise = Math.round(fr.ratePaisePerBase);
  if (ratePaise <= 0) return false;
  return (
    fr.row.manualRatePaisePerBase != null ||
    fr.row.manualRateFromDbName != null ||
    currentAvgPaise <= 0
  );
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const prisma = getPrisma();
  const { flatRows, dbByName } = await buildStockCountRows(prisma);
  const ready = flatRows.filter((fr) => readinessTab(fr) === "ready");
  const pending = ready.filter((fr) => !fr.dbName);
  const existing = ready.filter((fr) => fr.dbName);
  const auditedAt = new Date("2026-07-27T12:00:00+05:30");
  const note = "Physical stock count Jul 2026";

  console.log(`Stock count apply ${dryRun ? "(DRY RUN) " : ""}— ${ready.length} ready rows`);
  console.log(`  ${pending.length} new items · ${existing.length} existing items to audit`);

  for (const fr of ready) {
    const stock = fr.row.listBase ?? 0;
    const label = fr.dbName ?? fr.row.name;
    const action = fr.dbName ? "audit" : "create+open";
    console.log(
      `  [${action}] ${label}: ${stock} ${fr.row.listUnit} (was ${fr.oldStock ?? 0}, rate ₹${(fr.ratePaisePerBase / 100).toFixed(2)}/${fr.row.listUnit})`,
    );
  }

  if (dryRun) {
    await prisma.$disconnect();
    return;
  }

  const result = await prisma.$transaction(
    async (tx) => {
      const settings = await ensureInventorySettings(tx);
      const auditLines: { inventoryItemId: string; countedBase: Prisma.Decimal }[] = [];
      let created = 0;
      let rateUpdates = 0;
      let openingRows = 0;

      for (const fr of pending) {
        if (fr.row.listBase === null) continue;

        const name = fr.row.name.trim();
        const ratePaise = Math.round(fr.ratePaisePerBase);
        let item = await tx.inventoryItem.findFirst({
          where: { name, active: true },
          select: { id: true, stockOnHandBase: true, avgCostPaisePerBase: true },
        });

        if (!item) {
          item = await tx.inventoryItem.create({
            data: {
              name,
              category: inventoryCategory(fr),
              baseUnit: fr.row.listUnit,
              purchaseUnit: fr.row.listUnit,
              baseUnitsPerPurchaseUnit: 1,
              stockOnHandBase: 0,
              minStockBase: 0,
              avgCostPaisePerBase: ratePaise,
              lastPurchasePaisePerBase: ratePaise,
              active: true,
            },
            select: { id: true, stockOnHandBase: true, avgCostPaisePerBase: true },
          });
          created++;
          console.log(`Created inventory item: ${name}`);
        } else if (shouldUpdateRate(fr, Number(item.avgCostPaisePerBase))) {
          await tx.inventoryItem.update({
            where: { id: item.id },
            data: {
              avgCostPaisePerBase: ratePaise,
              lastPurchasePaisePerBase: ratePaise,
            },
          });
          rateUpdates++;
        }

        if (fr.row.listBase > 0) {
          await recordOpeningStock(tx, {
            inventoryItemId: item.id,
            qtyBase: d(fr.row.listBase),
            occurredAt: auditedAt,
            note,
            ratePaisePerPurchaseUnit: ratePaise > 0 ? ratePaise : null,
          });
          openingRows++;
        } else {
          auditLines.push({ inventoryItemId: item.id, countedBase: d(0) });
        }
      }

      for (const fr of existing) {
        if (fr.row.listBase === null) continue;
        const dbItem = dbByName.get(fr.dbName!);
        if (!dbItem) throw new Error(`INVENTORY_ITEM_NOT_FOUND:${fr.dbName}`);

        const live = await tx.inventoryItem.findFirst({
          where: { id: dbItem.id, active: true },
          select: { id: true, avgCostPaisePerBase: true },
        });
        if (!live) throw new Error(`INVENTORY_ITEM_NOT_FOUND:${fr.dbName}`);

        if (shouldUpdateRate(fr, Number(live.avgCostPaisePerBase))) {
          const ratePaise = Math.round(fr.ratePaisePerBase);
          await tx.inventoryItem.update({
            where: { id: live.id },
            data: {
              avgCostPaisePerBase: ratePaise,
              lastPurchasePaisePerBase: ratePaise,
            },
          });
          rateUpdates++;
        }

        auditLines.push({
          inventoryItemId: live.id,
          countedBase: d(fr.row.listBase),
        });
      }

      const audit =
        auditLines.length > 0
          ? await recordStockAudit(tx, {
              auditedAt,
              note,
              allowNegativeStock: settings.allowNegativeStock,
              lines: auditLines,
            })
          : null;

      return { created, openingRows, auditLines: auditLines.length, rateUpdates, auditId: audit?.auditId ?? null };
    },
    { timeout: 120_000 },
  );

  console.log("\nApplied stock count:");
  console.log(`  ${result.created} items created`);
  console.log(`  ${result.openingRows} opening-stock entries`);
  console.log(`  ${result.auditLines} audit lines (${result.auditId ?? "no audit"})`);
  console.log(`  ${result.rateUpdates} rate updates`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
