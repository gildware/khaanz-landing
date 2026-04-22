-- CreateEnum
CREATE TYPE "InventoryCostingMethod" AS ENUM ('WEIGHTED_AVERAGE', 'LATEST_PURCHASE');

-- CreateEnum
CREATE TYPE "PurchasePaymentType" AS ENUM ('CASH', 'CHEQUE', 'CREDIT');

-- CreateEnum
CREATE TYPE "SupplierLedgerKind" AS ENUM ('PURCHASE_DEBIT', 'PAYMENT_CREDIT', 'RETURN_CREDIT');

-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('OPENING_STOCK', 'PURCHASE_RECEIPT', 'PURCHASE_RETURN', 'POS_OR_WEB_SALE', 'ORDER_CANCEL_RESTORE', 'ADJUSTMENT_UP', 'ADJUSTMENT_DOWN', 'AUDIT_SURPLUS', 'AUDIT_SHORTAGE', 'WASTAGE');

-- CreateEnum
CREATE TYPE "AdjustmentReason" AS ENUM ('DAMAGE', 'CORRECTION', 'THEFT', 'AUDIT_MISMATCH', 'OTHER');

-- CreateEnum
CREATE TYPE "WastageType" AS ENUM ('SPOILAGE', 'PREPARATION', 'OVERPRODUCTION', 'OTHER');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "inventory_deducted_at" TIMESTAMP(3),
ADD COLUMN     "inventory_restored_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "inventory_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "costing_method" "InventoryCostingMethod" NOT NULL DEFAULT 'WEIGHTED_AVERAGE',
    "restore_stock_on_cancel" BOOLEAN NOT NULL DEFAULT true,
    "allow_negative_stock" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '',
    "base_unit" VARCHAR(32) NOT NULL,
    "purchase_unit" VARCHAR(32) NOT NULL,
    "base_units_per_purchase_unit" DECIMAL(24,8) NOT NULL,
    "stock_on_hand_base" DECIMAL(24,8) NOT NULL DEFAULT 0,
    "min_stock_base" DECIMAL(24,8) NOT NULL DEFAULT 0,
    "avg_cost_paise_per_base" DECIMAL(24,6) NOT NULL DEFAULT 0,
    "last_purchase_paise_per_base" DECIMAL(24,6) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" VARCHAR(32) NOT NULL DEFAULT '',
    "email" VARCHAR(120) NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "default_credit_days" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_ledger_entries" (
    "id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" "SupplierLedgerKind" NOT NULL,
    "debit_paise" INTEGER NOT NULL DEFAULT 0,
    "credit_paise" INTEGER NOT NULL DEFAULT 0,
    "reference_type" VARCHAR(32) NOT NULL,
    "reference_id" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "supplier_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchases" (
    "id" TEXT NOT NULL,
    "batch_ref" VARCHAR(40) NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "purchased_at" TIMESTAMP(3) NOT NULL,
    "payment_type" "PurchasePaymentType" NOT NULL,
    "credit_days" INTEGER,
    "due_at" TIMESTAMP(3),
    "total_paise" INTEGER NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_lines" (
    "id" TEXT NOT NULL,
    "purchase_id" TEXT NOT NULL,
    "inventory_item_id" TEXT NOT NULL,
    "qty_purchase" DECIMAL(24,8) NOT NULL,
    "rate_paise_per_purchase_unit" INTEGER NOT NULL,
    "line_total_paise" INTEGER NOT NULL,
    "qty_base_received" DECIMAL(24,8) NOT NULL,
    "expiry_date" TIMESTAMP(3),
    "lot_code" VARCHAR(64) NOT NULL DEFAULT '',

    CONSTRAINT "purchase_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_returns" (
    "id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "purchase_id" TEXT,
    "returned_at" TIMESTAMP(3) NOT NULL,
    "total_credit_paise" INTEGER NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_return_lines" (
    "id" TEXT NOT NULL,
    "return_id" TEXT NOT NULL,
    "inventory_item_id" TEXT NOT NULL,
    "qty_purchase" DECIMAL(24,8) NOT NULL,
    "qty_base" DECIMAL(24,8) NOT NULL,
    "credit_paise" INTEGER NOT NULL,

    CONSTRAINT "purchase_return_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_payments" (
    "id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "paid_at" TIMESTAMP(3) NOT NULL,
    "amount_paise" INTEGER NOT NULL,
    "method" VARCHAR(32) NOT NULL,
    "reference" VARCHAR(120) NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_versions" (
    "id" TEXT NOT NULL,
    "menu_item_id" TEXT NOT NULL,
    "variation_id" VARCHAR(64),
    "effective_from" TIMESTAMP(3) NOT NULL,
    "label" VARCHAR(120) NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recipe_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_ingredients" (
    "id" TEXT NOT NULL,
    "recipe_version_id" TEXT NOT NULL,
    "inventory_item_id" TEXT NOT NULL,
    "qty_base" DECIMAL(24,8) NOT NULL,

    CONSTRAINT "recipe_ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" TEXT NOT NULL,
    "inventory_item_id" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" "InventoryMovementType" NOT NULL,
    "qty_delta_base" DECIMAL(24,8) NOT NULL,
    "reference_type" VARCHAR(32) NOT NULL DEFAULT '',
    "reference_id" TEXT NOT NULL DEFAULT '',
    "order_id" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "created_by_user_id" TEXT,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wastage_entries" (
    "id" TEXT NOT NULL,
    "inventory_item_id" TEXT NOT NULL,
    "wasted_at" TIMESTAMP(3) NOT NULL,
    "qty_base" DECIMAL(24,8) NOT NULL,
    "wastage_type" "WastageType" NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wastage_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_audits" (
    "id" TEXT NOT NULL,
    "audited_at" TIMESTAMP(3) NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_audit_lines" (
    "id" TEXT NOT NULL,
    "stock_audit_id" TEXT NOT NULL,
    "inventory_item_id" TEXT NOT NULL,
    "counted_base" DECIMAL(24,8) NOT NULL,
    "system_base_snapshot" DECIMAL(24,8) NOT NULL,
    "variance_base" DECIMAL(24,8) NOT NULL,

    CONSTRAINT "stock_audit_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_counter_day" (
    "day_key" TEXT NOT NULL,
    "last_seq" INTEGER NOT NULL,

    CONSTRAINT "purchase_counter_day_pkey" PRIMARY KEY ("day_key")
);

-- CreateIndex
CREATE INDEX "inventory_items_name_idx" ON "inventory_items"("name");

-- CreateIndex
CREATE INDEX "supplier_ledger_entries_supplier_id_occurred_at_idx" ON "supplier_ledger_entries"("supplier_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "purchases_batch_ref_key" ON "purchases"("batch_ref");

-- CreateIndex
CREATE INDEX "purchases_supplier_id_purchased_at_idx" ON "purchases"("supplier_id", "purchased_at");

-- CreateIndex
CREATE INDEX "purchase_lines_purchase_id_idx" ON "purchase_lines"("purchase_id");

-- CreateIndex
CREATE INDEX "purchase_lines_inventory_item_id_idx" ON "purchase_lines"("inventory_item_id");

-- CreateIndex
CREATE INDEX "purchase_returns_supplier_id_idx" ON "purchase_returns"("supplier_id");

-- CreateIndex
CREATE INDEX "purchase_return_lines_return_id_idx" ON "purchase_return_lines"("return_id");

-- CreateIndex
CREATE INDEX "supplier_payments_supplier_id_paid_at_idx" ON "supplier_payments"("supplier_id", "paid_at");

-- CreateIndex
CREATE INDEX "recipe_versions_menu_item_id_effective_from_idx" ON "recipe_versions"("menu_item_id", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "recipe_ingredients_recipe_version_id_inventory_item_id_key" ON "recipe_ingredients"("recipe_version_id", "inventory_item_id");

-- CreateIndex
CREATE INDEX "inventory_movements_inventory_item_id_occurred_at_idx" ON "inventory_movements"("inventory_item_id", "occurred_at");

-- CreateIndex
CREATE INDEX "inventory_movements_order_id_idx" ON "inventory_movements"("order_id");

-- CreateIndex
CREATE INDEX "wastage_entries_inventory_item_id_wasted_at_idx" ON "wastage_entries"("inventory_item_id", "wasted_at");

-- CreateIndex
CREATE INDEX "stock_audit_lines_stock_audit_id_idx" ON "stock_audit_lines"("stock_audit_id");

-- AddForeignKey
ALTER TABLE "supplier_ledger_entries" ADD CONSTRAINT "supplier_ledger_entries_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_returns" ADD CONSTRAINT "purchase_returns_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return_lines" ADD CONSTRAINT "purchase_return_lines_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "purchase_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_return_lines" ADD CONSTRAINT "purchase_return_lines_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_versions" ADD CONSTRAINT "recipe_versions_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_recipe_version_id_fkey" FOREIGN KEY ("recipe_version_id") REFERENCES "recipe_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wastage_entries" ADD CONSTRAINT "wastage_entries_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_audit_lines" ADD CONSTRAINT "stock_audit_lines_stock_audit_id_fkey" FOREIGN KEY ("stock_audit_id") REFERENCES "stock_audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_audit_lines" ADD CONSTRAINT "stock_audit_lines_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
