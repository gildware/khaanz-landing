-- CreateEnum
CREATE TYPE "InventoryBatchSourceType" AS ENUM ('OPENING_STOCK', 'PURCHASE_LINE', 'ADJUSTMENT_UP', 'AUDIT_SURPLUS');

-- CreateTable
CREATE TABLE "inventory_batches" (
    "id" TEXT NOT NULL,
    "inventory_item_id" TEXT NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL,
    "source_type" "InventoryBatchSourceType" NOT NULL,
    "source_id" VARCHAR(64) NOT NULL,
    "expiry_date" TIMESTAMP(3),
    "lot_code" VARCHAR(64) NOT NULL DEFAULT '',
    "qty_received_base" DECIMAL(24,8) NOT NULL,
    "remaining_qty_base" DECIMAL(24,8) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purchase_line_id" TEXT,

    CONSTRAINT "inventory_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_batch_consumptions" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "inventory_item_id" TEXT NOT NULL,
    "order_id" TEXT,
    "reference_type" VARCHAR(32) NOT NULL,
    "reference_id" VARCHAR(64) NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "qty_base" DECIMAL(24,8) NOT NULL,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_batch_consumptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_adjustments" (
    "id" TEXT NOT NULL,
    "inventory_item_id" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "direction" VARCHAR(8) NOT NULL,
    "qty_base" DECIMAL(24,8) NOT NULL,
    "reason" "AdjustmentReason" NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inventory_batches_purchase_line_id_key" ON "inventory_batches"("purchase_line_id");

-- CreateIndex
CREATE INDEX "inventory_batches_inventory_item_id_received_at_idx" ON "inventory_batches"("inventory_item_id", "received_at");

-- CreateIndex
CREATE INDEX "inventory_batches_expiry_date_idx" ON "inventory_batches"("expiry_date");

-- CreateIndex
CREATE INDEX "inventory_batch_consumptions_inventory_item_id_occurred_at_idx" ON "inventory_batch_consumptions"("inventory_item_id", "occurred_at");

-- CreateIndex
CREATE INDEX "inventory_batch_consumptions_order_id_idx" ON "inventory_batch_consumptions"("order_id");

-- CreateIndex
CREATE INDEX "inventory_batch_consumptions_reference_type_reference_id_idx" ON "inventory_batch_consumptions"("reference_type", "reference_id");

-- CreateIndex
CREATE INDEX "stock_adjustments_inventory_item_id_occurred_at_idx" ON "stock_adjustments"("inventory_item_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_purchase_line_id_fkey" FOREIGN KEY ("purchase_line_id") REFERENCES "purchase_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_batch_consumptions" ADD CONSTRAINT "inventory_batch_consumptions_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "inventory_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_batch_consumptions" ADD CONSTRAINT "inventory_batch_consumptions_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_batch_consumptions" ADD CONSTRAINT "inventory_batch_consumptions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
