-- OTP challenges for phone login
CREATE TABLE "otp_challenges" (
    "id" TEXT NOT NULL,
    "phone_digits" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_challenges_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "otp_challenges_phone_digits_expires_at_idx" ON "otp_challenges"("phone_digits", "expires_at");

-- Replace OrderStatus enum with customer-facing workflow labels
CREATE TYPE "OrderStatus_new" AS ENUM ('PENDING', 'ACCEPTED', 'PREPARING', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED');

ALTER TABLE "orders" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "orders"
  ALTER COLUMN "status" TYPE "OrderStatus_new"
  USING (
    CASE "status"::text
      WHEN 'PENDING' THEN 'PENDING'::"OrderStatus_new"
      WHEN 'CONFIRMED' THEN 'ACCEPTED'::"OrderStatus_new"
      WHEN 'PREPARING' THEN 'PREPARING'::"OrderStatus_new"
      WHEN 'READY' THEN 'PREPARING'::"OrderStatus_new"
      WHEN 'OUT_FOR_DELIVERY' THEN 'OUT_FOR_DELIVERY'::"OrderStatus_new"
      WHEN 'COMPLETED' THEN 'DELIVERED'::"OrderStatus_new"
      WHEN 'CANCELLED' THEN 'CANCELLED'::"OrderStatus_new"
      ELSE 'PENDING'::"OrderStatus_new"
    END
  );

DROP TYPE "OrderStatus";

ALTER TYPE "OrderStatus_new" RENAME TO "OrderStatus";

ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'PENDING'::"OrderStatus";
