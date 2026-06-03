-- AlterTable
ALTER TABLE "restaurant_settings" ADD COLUMN     "delivery_per_km_charge" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "free_delivery_upto_km" DOUBLE PRECISION NOT NULL DEFAULT 0;
