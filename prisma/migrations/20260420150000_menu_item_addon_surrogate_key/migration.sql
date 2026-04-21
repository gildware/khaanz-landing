-- Addon ids from the menu JSON (e.g. ia-extra-mint) repeat across items; PK must be per-row.
DROP TABLE IF EXISTS "menu_item_addons";

CREATE TABLE "menu_item_addons" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "addon_key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "menu_item_addons_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "menu_item_addons_item_id_addon_key_key" ON "menu_item_addons"("item_id", "addon_key");

CREATE INDEX "menu_item_addons_item_id_idx" ON "menu_item_addons"("item_id");

ALTER TABLE "menu_item_addons" ADD CONSTRAINT "menu_item_addons_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
