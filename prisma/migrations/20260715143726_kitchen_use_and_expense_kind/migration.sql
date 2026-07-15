-- CreateEnum
CREATE TYPE "ExpenseKind" AS ENUM ('OPERATING', 'CAPITAL');

-- AlterEnum
ALTER TYPE "InventoryMovementType" ADD VALUE 'KITCHEN_USE';

-- AlterTable
ALTER TABLE "expense_entries" ADD COLUMN "kind" "ExpenseKind" NOT NULL DEFAULT 'OPERATING';

-- CreateTable
CREATE TABLE "kitchen_use_entries" (
    "id" TEXT NOT NULL,
    "inventory_item_id" TEXT NOT NULL,
    "used_at" TIMESTAMP(3) NOT NULL,
    "qty_base" DECIMAL(24,8) NOT NULL,
    "cost_paise" INTEGER NOT NULL,
    "note" VARCHAR(500) NOT NULL DEFAULT '',
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kitchen_use_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kitchen_use_entries_inventory_item_id_used_at_idx" ON "kitchen_use_entries"("inventory_item_id", "used_at");

-- CreateIndex
CREATE INDEX "kitchen_use_entries_used_at_idx" ON "kitchen_use_entries"("used_at");

-- CreateIndex
CREATE INDEX "expense_entries_kind_occurred_at_idx" ON "expense_entries"("kind", "occurred_at");

-- AddForeignKey
ALTER TABLE "kitchen_use_entries" ADD CONSTRAINT "kitchen_use_entries_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
