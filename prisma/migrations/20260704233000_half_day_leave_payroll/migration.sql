-- AlterEnum
ALTER TYPE "AttendanceKind" ADD VALUE 'HALF_DAY_LEAVE';

-- AlterTable
ALTER TABLE "payroll_employee_lines" ADD COLUMN "total_days" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "payroll_employee_lines" ADD COLUMN "half_leave_days" INTEGER NOT NULL DEFAULT 0;
