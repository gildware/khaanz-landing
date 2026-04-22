/*
  Warnings:

  - You are about to drop the column `inventory_item_id` on the `vendor_sale_lines` table. All the data in the column will be lost.
  - You are about to drop the column `qty_base` on the `vendor_sale_lines` table. All the data in the column will be lost.
  - You are about to drop the column `rate_paise_per_base` on the `vendor_sale_lines` table. All the data in the column will be lost.
  - Added the required column `menu_item_id` to the `vendor_sale_lines` table without a default value. This is not possible if the table is not empty.
  - Added the required column `quantity` to the `vendor_sale_lines` table without a default value. This is not possible if the table is not empty.
  - Added the required column `rate_paise_per_unit` to the `vendor_sale_lines` table without a default value. This is not possible if the table is not empty.
  - Added the required column `variation_id` to the `vendor_sale_lines` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "vendor_sale_lines" DROP CONSTRAINT "vendor_sale_lines_inventory_item_id_fkey";

-- DropIndex
DROP INDEX "vendor_sale_lines_inventory_item_id_idx";

-- AlterTable
ALTER TABLE "vendor_sale_lines" DROP COLUMN "inventory_item_id",
DROP COLUMN "qty_base",
DROP COLUMN "rate_paise_per_base",
ADD COLUMN     "menu_item_id" TEXT NOT NULL,
ADD COLUMN     "quantity" DECIMAL(24,8) NOT NULL,
ADD COLUMN     "rate_paise_per_unit" INTEGER NOT NULL,
ADD COLUMN     "variation_id" VARCHAR(64) NOT NULL;

-- CreateTable
CREATE TABLE "vendor_sellable_menu_items" (
    "id" TEXT NOT NULL,
    "menu_item_id" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_sellable_menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vendor_sellable_menu_items_menu_item_id_key" ON "vendor_sellable_menu_items"("menu_item_id");

-- CreateIndex
CREATE INDEX "vendor_sellable_menu_items_active_idx" ON "vendor_sellable_menu_items"("active");

-- CreateIndex
CREATE INDEX "vendor_sale_lines_menu_item_id_idx" ON "vendor_sale_lines"("menu_item_id");

-- AddForeignKey
ALTER TABLE "vendor_sale_lines" ADD CONSTRAINT "vendor_sale_lines_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_sellable_menu_items" ADD CONSTRAINT "vendor_sellable_menu_items_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
