-- Restaurant origin for delivery distance (admin-configurable; env vars remain fallback).
ALTER TABLE "restaurant_settings"
ADD COLUMN "restaurant_latitude" DOUBLE PRECISION,
ADD COLUMN "restaurant_longitude" DOUBLE PRECISION;
