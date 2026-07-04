import type { AttendanceKind } from "@prisma/client";

import { dayKeyFromMonthDay, daysInMonthFromKey } from "@/lib/payroll/payroll-utils";

export type AttendanceRow = {
  kind: AttendanceKind;
};

export type PayrollInputs = {
  monthKey: string;
  monthlySalaryPaise: number;
  dailyRatePaise: number;
  paidLeavesAllowed: number;
  attendance: AttendanceRow[];
  advancesPaise: number;
};

export type PayrollComputed = {
  totalDays: number;
  presentDays: number;
  halfLeaveDays: number;
  fullLeaveDays: number;
  leaveDaysTotal: number;
  workedDaysTotal: number;
  extraLeaveDays: number;
  excessLeaveDays: number;
  /** @deprecated use presentDays */
  workedDays: number;
  /** @deprecated use fullLeaveDays */
  leaveDays: number;
  absentDays: number;
  workedOnLeaveDays: number;
  /** @deprecated use extraLeaveDays */
  unusedLeaveDays: number;
  /** @deprecated use excessLeaveDays */
  excessLeaveDays: number;
  /** @deprecated */
  effectiveWorkedDays: number;
  /** @deprecated */
  applicablePaidLeaves: number;
  extrasPaise: number;
  deductionsPaise: number;
  advancesPaise: number;
  netPayPaise: number;
};

/** Unmarked days default to present when computing payroll. */
export function buildPayrollAttendance(
  monthKey: string,
  records: { dayKey: string; kind: AttendanceKind }[],
): AttendanceRow[] {
  const byDay = new Map(records.map((r) => [r.dayKey, r.kind]));
  const days = daysInMonthFromKey(monthKey);
  const attendance: AttendanceRow[] = [];
  for (let d = 1; d <= days; d++) {
    attendance.push({
      kind: byDay.get(dayKeyFromMonthDay(monthKey, d)) ?? "WORKED",
    });
  }
  return attendance;
}

export function countLeaveDaysTotal(
  fullLeaveDays: number,
  halfLeaveDays: number,
): number {
  return fullLeaveDays + halfLeaveDays * 0.5;
}

export function countWorkedDaysTotal(
  presentDays: number,
  halfLeaveDays: number,
): number {
  return presentDays + halfLeaveDays * 0.5;
}

export function formatLeaveDays(days: number): string {
  if (days === 0) return "0";
  if (Number.isInteger(days)) return String(days);
  const whole = Math.floor(days);
  return whole > 0 ? `${whole}.5` : "0.5";
}

export function computePayroll(i: PayrollInputs): PayrollComputed {
  const totalDays = daysInMonthFromKey(i.monthKey);

  const presentDays = i.attendance.filter((a) => a.kind === "WORKED").length;
  const fullLeaveDays =
    i.attendance.filter((a) => a.kind === "LEAVE").length +
    i.attendance.filter((a) => a.kind === "ABSENT").length;
  const halfLeaveDays = i.attendance.filter(
    (a) => a.kind === "HALF_DAY_LEAVE",
  ).length;
  const workedOnLeaveDays = i.attendance.filter(
    (a) => a.kind === "WORKED_ON_LEAVE",
  ).length;

  const leaveDaysTotal = countLeaveDaysTotal(fullLeaveDays, halfLeaveDays);
  const workedDaysTotal =
    countWorkedDaysTotal(presentDays + workedOnLeaveDays, halfLeaveDays);

  const extraLeaveDays = Math.max(0, i.paidLeavesAllowed - leaveDaysTotal);
  const excessLeaveDays = Math.max(0, leaveDaysTotal - i.paidLeavesAllowed);

  const extrasPaise = Math.round(extraLeaveDays * i.dailyRatePaise);
  const deductionsPaise = Math.round(excessLeaveDays * i.dailyRatePaise);

  const netPayPaise =
    i.monthlySalaryPaise + extrasPaise - deductionsPaise - i.advancesPaise;

  return {
    totalDays,
    presentDays,
    halfLeaveDays,
    fullLeaveDays,
    leaveDaysTotal,
    workedDaysTotal,
    extraLeaveDays,
    excessLeaveDays,
    workedDays: presentDays + workedOnLeaveDays,
    leaveDays: fullLeaveDays,
    absentDays: 0,
    workedOnLeaveDays,
    unusedLeaveDays: extraLeaveDays,
    effectiveWorkedDays: Math.floor(workedDaysTotal),
    applicablePaidLeaves: i.paidLeavesAllowed,
    extrasPaise,
    deductionsPaise,
    advancesPaise: i.advancesPaise,
    netPayPaise,
  };
}
