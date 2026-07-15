-- CreateTable
CREATE TABLE "cash_pool_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "opening_balance_paise" INTEGER NOT NULL DEFAULT 0,
    "opening_effective_at" TIMESTAMP(3) NOT NULL,
    "note" VARCHAR(500) NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_pool_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_adjustments" (
    "id" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "amount_paise" INTEGER NOT NULL,
    "note" VARCHAR(500) NOT NULL DEFAULT '',
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cash_adjustments_occurred_at_idx" ON "cash_adjustments"("occurred_at");
