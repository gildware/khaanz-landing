-- AlterTable
ALTER TABLE "personal_use_entries" ADD COLUMN "menu_item_id" TEXT,
ADD COLUMN "variation_id" TEXT;

-- CreateIndex
CREATE INDEX "personal_use_entries_menu_item_id_occurred_at_idx" ON "personal_use_entries"("menu_item_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "personal_use_entries" ADD CONSTRAINT "personal_use_entries_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_use_entries" ADD CONSTRAINT "personal_use_entries_variation_id_fkey" FOREIGN KEY ("variation_id") REFERENCES "menu_item_variations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
