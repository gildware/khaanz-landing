-- Staff permissions + order audit trail
CREATE TYPE "UserRole_new" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'STAFF');

ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users"
  ALTER COLUMN "role" TYPE "UserRole_new"
  USING ("role"::text::"UserRole_new");
DROP TYPE "UserRole";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'ADMIN'::"UserRole";

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "permissions" JSONB NOT NULL DEFAULT '[]';

ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "created_by_user_id" TEXT;

CREATE INDEX IF NOT EXISTS "orders_created_by_user_id_idx"
  ON "orders"("created_by_user_id");

CREATE TYPE "OrderEventAction" AS ENUM ('CREATED', 'STATUS_CHANGED', 'EDITED');
CREATE TYPE "OrderEventActorType" AS ENUM ('USER', 'CUSTOMER', 'POS_SYNC', 'SYSTEM');

CREATE TABLE IF NOT EXISTS "order_events" (
  "id" TEXT NOT NULL,
  "order_id" TEXT NOT NULL,
  "action" "OrderEventAction" NOT NULL,
  "actor_type" "OrderEventActorType" NOT NULL,
  "actor_user_id" TEXT,
  "actor_label" VARCHAR(160) NOT NULL DEFAULT '',
  "summary" VARCHAR(500) NOT NULL,
  "before_json" JSONB,
  "after_json" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "order_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "order_events_order_id_created_at_idx"
  ON "order_events"("order_id", "created_at");
CREATE INDEX IF NOT EXISTS "order_events_actor_user_id_idx"
  ON "order_events"("actor_user_id");

ALTER TABLE "order_events"
  ADD CONSTRAINT "order_events_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_events"
  ADD CONSTRAINT "order_events_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing admin accounts keep full module access
UPDATE "users"
SET "permissions" = '["dashboard","reports","online_orders","orders","inventory","wastage","vendors","expenses","floor_plan","pos","menu","home_layout","payroll","settings","staff"]'::jsonb
WHERE "role" IN ('SUPER_ADMIN', 'ADMIN')
  AND (
    "permissions" IS NULL
    OR "permissions"::text = '[]'
    OR "permissions"::text = 'null'
  );
