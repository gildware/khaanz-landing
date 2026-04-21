-- Human-readable order references (Swiggy/Zomato style) + daily counter (IST)
CREATE TABLE "order_counter_day" (
    "day_key" TEXT NOT NULL,
    "last_seq" INTEGER NOT NULL,

    CONSTRAINT "order_counter_day_pkey" PRIMARY KEY ("day_key")
);

ALTER TABLE "orders" ADD COLUMN "order_ref" TEXT;

CREATE UNIQUE INDEX "orders_order_ref_key" ON "orders"("order_ref");
