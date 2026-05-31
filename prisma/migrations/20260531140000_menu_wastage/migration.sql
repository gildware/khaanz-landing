-- CreateTable
CREATE TABLE "menu_wastage_entries" (
    "id" TEXT NOT NULL,
    "menu_item_id" TEXT NOT NULL,
    "variation_id" TEXT NOT NULL,
    "quantity" DECIMAL(24,8) NOT NULL,
    "wasted_at" TIMESTAMP(3) NOT NULL,
    "wastage_type" "WastageType" NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menu_wastage_entries_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "wastage_entries" ADD COLUMN "menu_wastage_entry_id" TEXT;

-- CreateIndex
CREATE INDEX "menu_wastage_entries_menu_item_id_wasted_at_idx" ON "menu_wastage_entries"("menu_item_id", "wasted_at");

-- CreateIndex
CREATE INDEX "menu_wastage_entries_wasted_at_idx" ON "menu_wastage_entries"("wasted_at");

-- CreateIndex
CREATE INDEX "wastage_entries_menu_wastage_entry_id_idx" ON "wastage_entries"("menu_wastage_entry_id");

-- AddForeignKey
ALTER TABLE "wastage_entries" ADD CONSTRAINT "wastage_entries_menu_wastage_entry_id_fkey" FOREIGN KEY ("menu_wastage_entry_id") REFERENCES "menu_wastage_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_wastage_entries" ADD CONSTRAINT "menu_wastage_entries_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_wastage_entries" ADD CONSTRAINT "menu_wastage_entries_variation_id_fkey" FOREIGN KEY ("variation_id") REFERENCES "menu_item_variations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
