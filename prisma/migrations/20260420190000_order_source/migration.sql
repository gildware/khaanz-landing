-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('website', 'pos');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN "order_source" "OrderSource" NOT NULL DEFAULT 'website';
