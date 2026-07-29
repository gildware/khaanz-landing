-- AlterTable
ALTER TABLE "inventory_items" ADD COLUMN "yield_source_item_id" TEXT,
ADD COLUMN "yield_percent" DECIMAL(5,2);

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_yield_source_item_id_fkey" FOREIGN KEY ("yield_source_item_id") REFERENCES "inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "inventory_items_yield_source_item_id_idx" ON "inventory_items"("yield_source_item_id");
