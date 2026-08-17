-- AlterTable
ALTER TABLE "menu_items" ADD COLUMN "recommended_sort_order" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "menu_combos" ADD COLUMN "recommended_sort_order" INTEGER NOT NULL DEFAULT 0;
