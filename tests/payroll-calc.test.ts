import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPayrollAttendance,
  computePayroll,
  formatLeaveDays,
} from "../src/lib/payroll/payroll-calc";

const base = {
  monthKey: "2026-07",
  monthlySalaryPaise: 1800000,
  dailyRatePaise: 60000,
  paidLeavesAllowed: 4,
  advancesPaise: 0,
};

function fullMonthPresent() {
  return buildPayrollAttendance("2026-07", []);
}

test("full month present earns four extra leave days pay", () => {
  const r = computePayroll({ ...base, attendance: fullMonthPresent() });
  assert.equal(r.leaveDaysTotal, 0);
  assert.equal(r.extraLeaveDays, 4);
  assert.equal(r.excessLeaveDays, 0);
  assert.equal(r.extrasPaise, 4 * 60000);
  assert.equal(r.deductionsPaise, 0);
  assert.equal(r.netPayPaise, 1800000 + 4 * 60000);
});

test("leave days reduce extra pay one-for-one", () => {
  const cases = [
    { leaves: 1, extra: 3 },
    { leaves: 2, extra: 2 },
    { leaves: 3, extra: 1 },
    { leaves: 4, extra: 0 },
  ];
  for (const c of cases) {
    const attendance = buildPayrollAttendance(
      "2026-07",
      Array.from({ length: c.leaves }, (_, i) => ({
        dayKey: `2026-07-${String(i + 1).padStart(2, "0")}`,
        kind: "LEAVE" as const,
      })),
    );
    const r = computePayroll({ ...base, attendance });
    assert.equal(r.leaveDaysTotal, c.leaves);
    assert.equal(r.extraLeaveDays, c.extra);
    assert.equal(r.excessLeaveDays, 0);
    assert.equal(r.extrasPaise, c.extra * 60000);
  }
});

test("leave beyond allowance deducts extra days", () => {
  const cases = [
    { leaves: 5, deductionDays: 1 },
    { leaves: 6, deductionDays: 2 },
  ];
  for (const c of cases) {
    const attendance = buildPayrollAttendance(
      "2026-07",
      Array.from({ length: c.leaves }, (_, i) => ({
        dayKey: `2026-07-${String(i + 1).padStart(2, "0")}`,
        kind: "LEAVE" as const,
      })),
    );
    const r = computePayroll({ ...base, attendance });
    assert.equal(r.extraLeaveDays, 0);
    assert.equal(r.excessLeaveDays, c.deductionDays);
    assert.equal(r.deductionsPaise, c.deductionDays * 60000);
  }
});

test("half day leave counts as 0.5 leave and 0.5 worked", () => {
  const attendance = buildPayrollAttendance("2026-07", [
    { dayKey: "2026-07-01", kind: "HALF_DAY_LEAVE" },
    { dayKey: "2026-07-02", kind: "HALF_DAY_LEAVE" },
  ]);
  const r = computePayroll({ ...base, attendance });
  assert.equal(r.halfLeaveDays, 2);
  assert.equal(r.leaveDaysTotal, 1);
  assert.equal(r.workedDaysTotal, 30);
  assert.equal(r.extraLeaveDays, 3);
});

test("formatLeaveDays renders halves", () => {
  assert.equal(formatLeaveDays(3), "3");
  assert.equal(formatLeaveDays(3.5), "3.5");
  assert.equal(formatLeaveDays(0.5), "0.5");
});

test("unmarked days default to present", () => {
  const attendance = buildPayrollAttendance("2026-07", [
    { dayKey: "2026-07-01", kind: "LEAVE" },
  ]);
  assert.equal(attendance.length, 31);
  assert.equal(attendance[0]?.kind, "LEAVE");
  assert.equal(attendance[1]?.kind, "WORKED");
});
