CREATE TABLE IF NOT EXISTS "pos_sync_meta" (
    "id" TEXT NOT NULL,
    "menu_revision" TEXT NOT NULL DEFAULT '',
    "settings_revision" TEXT NOT NULL DEFAULT '',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_sync_meta_pkey" PRIMARY KEY ("id")
);
