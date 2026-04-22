-- AlterTable
ALTER TABLE "purchase_return_lines" ADD COLUMN     "inventory_batch_id" TEXT;

-- CreateIndex
CREATE INDEX "purchase_return_lines_inventory_batch_id_idx" ON "purchase_return_lines"("inventory_batch_id");

-- AddForeignKey
ALTER TABLE "purchase_return_lines" ADD CONSTRAINT "purchase_return_lines_inventory_batch_id_fkey" FOREIGN KEY ("inventory_batch_id") REFERENCES "inventory_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
