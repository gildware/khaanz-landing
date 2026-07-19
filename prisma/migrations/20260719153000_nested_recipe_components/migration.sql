-- Nested recipes: yield on recipe versions + optional menu-item component lines

ALTER TABLE "recipe_versions"
  ADD COLUMN IF NOT EXISTS "yield_qty" DECIMAL(24,8) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "yield_unit" VARCHAR(32) NOT NULL DEFAULT '';

-- Drop inventory-only uniqueness (component lines have null inventory_item_id)
ALTER TABLE "recipe_ingredients"
  DROP CONSTRAINT IF EXISTS "recipe_ingredients_recipe_version_id_inventory_item_id_key";

ALTER TABLE "recipe_ingredients"
  ALTER COLUMN "inventory_item_id" DROP NOT NULL;

ALTER TABLE "recipe_ingredients"
  ADD COLUMN IF NOT EXISTS "component_menu_item_id" TEXT,
  ADD COLUMN IF NOT EXISTS "component_variation_id" VARCHAR(64);

ALTER TABLE "recipe_ingredients"
  ADD CONSTRAINT "recipe_ingredients_component_menu_item_id_fkey"
  FOREIGN KEY ("component_menu_item_id") REFERENCES "menu_items"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "recipe_ingredients_recipe_version_id_idx"
  ON "recipe_ingredients"("recipe_version_id");

CREATE INDEX IF NOT EXISTS "recipe_ingredients_inventory_item_id_idx"
  ON "recipe_ingredients"("inventory_item_id");

CREATE INDEX IF NOT EXISTS "recipe_ingredients_component_menu_item_id_idx"
  ON "recipe_ingredients"("component_menu_item_id");

-- Exactly one of inventory item or nested menu item
ALTER TABLE "recipe_ingredients"
  DROP CONSTRAINT IF EXISTS "recipe_ingredients_line_kind_check";

ALTER TABLE "recipe_ingredients"
  ADD CONSTRAINT "recipe_ingredients_line_kind_check"
  CHECK (
    (
      "inventory_item_id" IS NOT NULL
      AND "component_menu_item_id" IS NULL
      AND "component_variation_id" IS NULL
    )
    OR (
      "inventory_item_id" IS NULL
      AND "component_menu_item_id" IS NOT NULL
    )
  );
