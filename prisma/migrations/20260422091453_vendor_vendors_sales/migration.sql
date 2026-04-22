-- CreateEnum
CREATE TYPE "VendorSalePaymentType" AS ENUM ('CASH', 'CREDIT');

-- CreateEnum
CREATE TYPE "VendorLedgerKind" AS ENUM ('SALE_DEBIT', 'PAYMENT_CREDIT');

-- AlterEnum
ALTER TYPE "InventoryMovementType" ADD VALUE 'VENDOR_SALE';

-- CreateTable
CREATE TABLE "vendors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" VARCHAR(32) NOT NULL DEFAULT '',
    "email" VARCHAR(120) NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "default_credit_days" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_sales" (
    "id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "sold_at" TIMESTAMP(3) NOT NULL,
    "payment_type" "VendorSalePaymentType" NOT NULL,
    "credit_days" INTEGER,
    "due_at" TIMESTAMP(3),
    "total_paise" INTEGER NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_sale_lines" (
    "id" TEXT NOT NULL,
    "vendor_sale_id" TEXT NOT NULL,
    "inventory_item_id" TEXT NOT NULL,
    "qty_base" DECIMAL(24,8) NOT NULL,
    "rate_paise_per_base" INTEGER NOT NULL,
    "line_total_paise" INTEGER NOT NULL,

    CONSTRAINT "vendor_sale_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_payments" (
    "id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "paid_at" TIMESTAMP(3) NOT NULL,
    "amount_paise" INTEGER NOT NULL,
    "method" VARCHAR(32) NOT NULL,
    "reference" VARCHAR(120) NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_ledger_entries" (
    "id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" "VendorLedgerKind" NOT NULL,
    "debit_paise" INTEGER NOT NULL DEFAULT 0,
    "credit_paise" INTEGER NOT NULL DEFAULT 0,
    "reference_type" VARCHAR(32) NOT NULL,
    "reference_id" VARCHAR(64) NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "vendor_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vendor_sales_vendor_id_sold_at_idx" ON "vendor_sales"("vendor_id", "sold_at");

-- CreateIndex
CREATE INDEX "vendor_sale_lines_vendor_sale_id_idx" ON "vendor_sale_lines"("vendor_sale_id");

-- CreateIndex
CREATE INDEX "vendor_sale_lines_inventory_item_id_idx" ON "vendor_sale_lines"("inventory_item_id");

-- CreateIndex
CREATE INDEX "vendor_payments_vendor_id_paid_at_idx" ON "vendor_payments"("vendor_id", "paid_at");

-- CreateIndex
CREATE INDEX "vendor_ledger_entries_vendor_id_occurred_at_idx" ON "vendor_ledger_entries"("vendor_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "vendor_sales" ADD CONSTRAINT "vendor_sales_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_sale_lines" ADD CONSTRAINT "vendor_sale_lines_vendor_sale_id_fkey" FOREIGN KEY ("vendor_sale_id") REFERENCES "vendor_sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_sale_lines" ADD CONSTRAINT "vendor_sale_lines_inventory_item_id_fkey" FOREIGN KEY ("inventory_item_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_payments" ADD CONSTRAINT "vendor_payments_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_ledger_entries" ADD CONSTRAINT "vendor_ledger_entries_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
