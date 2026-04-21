-- AlterTable
ALTER TABLE "restaurant_settings" ADD COLUMN "bill_header" TEXT NOT NULL DEFAULT '';
ALTER TABLE "restaurant_settings" ADD COLUMN "bill_footer" TEXT NOT NULL DEFAULT '';
ALTER TABLE "restaurant_settings" ADD COLUMN "payment_methods_json" JSONB NOT NULL DEFAULT '[{"id":"cash","name":"Cash"},{"id":"upi","name":"UPI"},{"id":"mpay","name":"Mpay"}]'::jsonb;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN "payment_method" TEXT NOT NULL DEFAULT '';
