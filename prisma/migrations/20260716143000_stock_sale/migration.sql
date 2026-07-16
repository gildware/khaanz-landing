-- AlterEnum
ALTER TYPE "InventoryMovementType" ADD VALUE 'STOCK_SALE';

-- CreateTable
CREATE TABLE "stock_sale_entries" (
    "id" TEXT NOT NULL,
    "inventory_item_id" TEXT NOT NULL,
    "sold_at" TIMESTAMP(3) NOT NULL,
    "qty_base" DECIMAL(24,8) NOT NULL,
    "rate_paise_per_base" DECIMAL(24,6) NOT NULL,
    "total_paise" INTEGER NOT NULL,
    "cost_paise" INTEGER NOT NULL,
    "buyer_name" VARCHAR(200) NOT NULL DEFAULT '',
    "note" VARCHAR(500) NOT NULL DEFAULT '',
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_sale_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_sale_entries_inventory_item_id_sold_at_idx" ON "stock_sale_entries"("inventory_item_id", "sold_at");

-- CreateIndex
CREATE INDEX "stock_sale_entries_sold_at_idx" ON "stock_sale_entries"("sold_at");

-- AddForeignKey
ALTER TABLE "stock_sale_entries" ADD CONSTRAINT "stock_sale_entries_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
