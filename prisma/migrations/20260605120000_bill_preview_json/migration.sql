ALTER TABLE "restaurant_settings" ADD COLUMN IF NOT EXISTS "bill_preview_json" JSONB NOT NULL DEFAULT '{}';
