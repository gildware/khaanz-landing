-- AlterTable
ALTER TABLE "categories" ADD COLUMN "not_for_sale" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "menu_items" ADD COLUMN "not_for_sale" BOOLEAN NOT NULL DEFAULT false;
