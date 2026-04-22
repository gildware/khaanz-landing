-- CreateEnum
CREATE TYPE "EmployeeDocumentKind" AS ENUM ('ID_PROOF', 'ADDRESS_PROOF', 'CONTRACT', 'OTHER');

-- CreateEnum
CREATE TYPE "AttendanceKind" AS ENUM ('WORKED', 'LEAVE', 'ABSENT', 'WORKED_ON_LEAVE');

-- CreateEnum
CREATE TYPE "AdvanceMethod" AS ENUM ('CASH', 'RECHARGE', 'OTHER');

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(32) NOT NULL DEFAULT '',
    "name" VARCHAR(120) NOT NULL,
    "phone" VARCHAR(32) NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "joined_at" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "monthly_salary_paise" INTEGER NOT NULL,
    "daily_rate_paise" INTEGER NOT NULL,
    "paid_leaves_per_month" INTEGER NOT NULL DEFAULT 4,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_documents" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "kind" "EmployeeDocumentKind" NOT NULL,
    "title" VARCHAR(120) NOT NULL DEFAULT '',
    "file_url" VARCHAR(500) NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_days" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "day_key" VARCHAR(10) NOT NULL,
    "kind" "AttendanceKind" NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_advances" (
    "id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "amount_paise" INTEGER NOT NULL,
    "method" "AdvanceMethod" NOT NULL,
    "reference" VARCHAR(120) NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_advances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_runs" (
    "id" TEXT NOT NULL,
    "month_key" VARCHAR(7) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_user_id" TEXT,

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_employee_lines" (
    "id" TEXT NOT NULL,
    "payroll_run_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "monthly_salary_paise" INTEGER NOT NULL,
    "daily_rate_paise" INTEGER NOT NULL,
    "paid_leaves_allowed" INTEGER NOT NULL,
    "worked_days" INTEGER NOT NULL,
    "leave_days" INTEGER NOT NULL,
    "absent_days" INTEGER NOT NULL,
    "worked_on_leave_days" INTEGER NOT NULL,
    "extras_paise" INTEGER NOT NULL,
    "deductions_paise" INTEGER NOT NULL,
    "advances_paise" INTEGER NOT NULL,
    "net_pay_paise" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_employee_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employees_active_name_idx" ON "employees"("active", "name");

-- CreateIndex
CREATE INDEX "employees_code_idx" ON "employees"("code");

-- CreateIndex
CREATE INDEX "employee_documents_employee_id_kind_idx" ON "employee_documents"("employee_id", "kind");

-- CreateIndex
CREATE INDEX "attendance_days_day_key_idx" ON "attendance_days"("day_key");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_days_employee_id_day_key_key" ON "attendance_days"("employee_id", "day_key");

-- CreateIndex
CREATE INDEX "employee_advances_employee_id_occurred_at_idx" ON "employee_advances"("employee_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_month_key_key" ON "payroll_runs"("month_key");

-- CreateIndex
CREATE INDEX "payroll_employee_lines_employee_id_idx" ON "payroll_employee_lines"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_employee_lines_payroll_run_id_employee_id_key" ON "payroll_employee_lines"("payroll_run_id", "employee_id");

-- AddForeignKey
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_days" ADD CONSTRAINT "attendance_days_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_advances" ADD CONSTRAINT "employee_advances_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_employee_lines" ADD CONSTRAINT "payroll_employee_lines_payroll_run_id_fkey" FOREIGN KEY ("payroll_run_id") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_employee_lines" ADD CONSTRAINT "payroll_employee_lines_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
