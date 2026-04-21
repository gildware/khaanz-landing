-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "dine_in_table" VARCHAR(80) NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "restaurant_settings" ADD COLUMN     "floor_plan_json" JSONB NOT NULL DEFAULT '{"tables":[]}';
