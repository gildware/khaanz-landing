-- Add day-range columns for partial-month payroll runs.
ALTER TABLE "payroll_runs" ADD COLUMN "start_day_key" VARCHAR(10);
ALTER TABLE "payroll_runs" ADD COLUMN "end_day_key" VARCHAR(10);

-- Backfill existing runs as full calendar months.
UPDATE "payroll_runs"
SET
  "start_day_key" = "month_key" || '-01',
  "end_day_key" = to_char(
    (date_trunc('month', to_date("month_key" || '-01', 'YYYY-MM-DD')) + interval '1 month - 1 day')::date,
    'YYYY-MM-DD'
  );

ALTER TABLE "payroll_runs" ALTER COLUMN "start_day_key" SET NOT NULL;
ALTER TABLE "payroll_runs" ALTER COLUMN "end_day_key" SET NOT NULL;

DROP INDEX "payroll_runs_month_key_key";

CREATE UNIQUE INDEX "payroll_runs_month_key_start_day_key_end_day_key_key"
  ON "payroll_runs"("month_key", "start_day_key", "end_day_key");

CREATE INDEX "payroll_runs_month_key_idx" ON "payroll_runs"("month_key");
