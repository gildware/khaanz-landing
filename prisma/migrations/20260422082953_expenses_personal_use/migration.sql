-- CreateEnum
CREATE TYPE "ExpenseCategoryGroup" AS ENUM ('RAW_MATERIAL', 'BILLS', 'OTHER');

-- CreateEnum
CREATE TYPE "PersonalUseKind" AS ENUM ('CASH', 'STOCK', 'ORDER', 'OTHER');

-- CreateTable
CREATE TABLE "expense_categories" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "group" "ExpenseCategoryGroup" NOT NULL DEFAULT 'OTHER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_entries" (
    "id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "amount_paise" INTEGER NOT NULL,
    "note" VARCHAR(500) NOT NULL DEFAULT '',
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personal_use_entries" (
    "id" TEXT NOT NULL,
    "kind" "PersonalUseKind" NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "cash_amount_paise" INTEGER NOT NULL DEFAULT 0,
    "inventory_item_id" TEXT,
    "qty_base" DECIMAL(24,8),
    "order_id" TEXT,
    "note" VARCHAR(500) NOT NULL DEFAULT '',
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "personal_use_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "expense_categories_name_key" ON "expense_categories"("name");

-- CreateIndex
CREATE INDEX "expense_categories_active_name_idx" ON "expense_categories"("active", "name");

-- CreateIndex
CREATE INDEX "expense_entries_occurred_at_idx" ON "expense_entries"("occurred_at");

-- CreateIndex
CREATE INDEX "expense_entries_category_id_occurred_at_idx" ON "expense_entries"("category_id", "occurred_at");

-- CreateIndex
CREATE INDEX "personal_use_entries_occurred_at_idx" ON "personal_use_entries"("occurred_at");

-- CreateIndex
CREATE INDEX "personal_use_entries_kind_occurred_at_idx" ON "personal_use_entries"("kind", "occurred_at");

-- CreateIndex
CREATE INDEX "personal_use_entries_inventory_item_id_occurred_at_idx" ON "personal_use_entries"("inventory_item_id", "occurred_at");

-- CreateIndex
CREATE INDEX "personal_use_entries_order_id_idx" ON "personal_use_entries"("order_id");

-- AddForeignKey
ALTER TABLE "expense_entries" ADD CONSTRAINT "expense_entries_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_use_entries" ADD CONSTRAINT "personal_use_entries_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_use_entries" ADD CONSTRAINT "personal_use_entries_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
