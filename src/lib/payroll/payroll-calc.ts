import type { AttendanceKind } from "@prisma/client";

export type AttendanceRow = {
  kind: AttendanceKind;
};

export type PayrollInputs = {
  monthlySalaryPaise: number;
  dailyRatePaise: number;
  paidLeavesAllowed: number;
  attendance: AttendanceRow[];
  advancesPaise: number;
};

export type PayrollComputed = {
  workedDays: number;
  leaveDays: number;
  absentDays: number;
  workedOnLeaveDays: number;
  extrasPaise: number;
  deductionsPaise: number;
  advancesPaise: number;
  netPayPaise: number;
};

export function computePayroll(i: PayrollInputs): PayrollComputed {
  const workedDays = i.attendance.filter((a) => a.kind === "WORKED").length;
  const leaveDays = i.attendance.filter((a) => a.kind === "LEAVE").length;
  const absentDays = i.attendance.filter((a) => a.kind === "ABSENT").length;
  const workedOnLeaveDays = i.attendance.filter(
    (a) => a.kind === "WORKED_ON_LEAVE",
  ).length;

  const unpaidLeaveDays = Math.max(0, leaveDays - i.paidLeavesAllowed);
  const unpaidDays = absentDays + unpaidLeaveDays;

  const extrasPaise = workedOnLeaveDays * i.dailyRatePaise;
  const deductionsPaise = unpaidDays * i.dailyRatePaise;

  // Policy:
  // - Monthly salary is the base for the month.
  // - Up to N leaves are paid (no deduction).
  // - Work on a leave day earns extra daily pay.
  // - Any advances are deducted from the month's payout.
  const netPayPaise =
    i.monthlySalaryPaise + extrasPaise - deductionsPaise - i.advancesPaise;

  return {
    workedDays,
    leaveDays,
    absentDays,
    workedOnLeaveDays,
    extrasPaise,
    deductionsPaise,
    advancesPaise: i.advancesPaise,
    netPayPaise,
  };
}

