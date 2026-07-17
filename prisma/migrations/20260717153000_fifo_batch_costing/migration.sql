-- AlterEnum: add FIFO costing method
ALTER TYPE "InventoryCostingMethod" ADD VALUE IF NOT EXISTS 'FIFO';

-- Batch layer unit cost (paise per base unit)
ALTER TABLE "inventory_batches"
  ADD COLUMN IF NOT EXISTS "unit_cost_paise_per_base" DECIMAL(24,6) NOT NULL DEFAULT 0;

-- Snapshot COGS on each consumption allocation
ALTER TABLE "inventory_batch_consumptions"
  ADD COLUMN IF NOT EXISTS "cost_paise" INTEGER NOT NULL DEFAULT 0;

-- Backfill purchase-backed batches from purchase line rate
UPDATE "inventory_batches" AS b
SET "unit_cost_paise_per_base" = ROUND(
  (pl."line_total_paise"::numeric / NULLIF(pl."qty_base_received", 0)),
  6
)
FROM "purchase_lines" AS pl
WHERE b."purchase_line_id" = pl."id"
  AND pl."qty_base_received" > 0
  AND b."unit_cost_paise_per_base" = 0;

-- Backfill remaining batches from item moving-average cost
UPDATE "inventory_batches" AS b
SET "unit_cost_paise_per_base" = i."avg_cost_paise_per_base"
FROM "inventory_items" AS i
WHERE b."inventory_item_id" = i."id"
  AND b."unit_cost_paise_per_base" = 0
  AND i."avg_cost_paise_per_base" > 0;
