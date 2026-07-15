import type { AttendanceKind, PrismaClient } from "@prisma/client";

import { dayKeyFromMonthDay, daysInMonthFromKey } from "@/lib/payroll/payroll-utils";
import {
  employeeJoinDayKey,
  filterDayKeysFromReportingStart,
} from "@/lib/reports/reporting-start";

/** Labor fraction of a day for P&L accrual (matches payroll attendance kinds). */
function attendanceDayFraction(kind: AttendanceKind): number {
  switch (kind) {
    case "WORKED":
    case "WORKED_ON_LEAVE":
      return 1;
    case "HALF_DAY_LEAVE":
      return 0.5;
    case "LEAVE":
    case "ABSENT":
      return 0;
    default:
      return 1;
  }
}

/**
 * Day salary expense for active staff: Σ (dailyRate × attendance fraction).
 * Unmarked days default to WORKED (same as payroll).
 * Days before REPORTING_START_DATE and before each employee's joinedAt are zero.
 */
export async function computeDaySalariesPaise(
  prisma: PrismaClient,
  dayKey: string,
): Promise<{
  salariesPaise: number;
  activeStaffCount: number;
  chargedStaffCount: number;
}> {
  const byDay = await computeSalariesByDayPaise(prisma, [dayKey]);
  return (
    byDay.get(dayKey) ?? {
      salariesPaise: 0,
      activeStaffCount: 0,
      chargedStaffCount: 0,
    }
  );
}

/**
 * Batch daily salary accruals for many day keys (one employee + attendance load).
 * Unmarked days default to WORKED.
 * Skips days before REPORTING_START_DATE and before each employee's joinedAt.
 */
export async function computeSalariesByDayPaise(
  prisma: PrismaClient,
  dayKeys: string[],
): Promise<
  Map<
    string,
    {
      salariesPaise: number;
      activeStaffCount: number;
      chargedStaffCount: number;
    }
  >
> {
  const uniqueKeys = [...new Set(dayKeys)].filter(Boolean);
  const accrueKeys = filterDayKeysFromReportingStart(uniqueKeys);
  const accrueSet = new Set(accrueKeys);
  const result = new Map<
    string,
    {
      salariesPaise: number;
      activeStaffCount: number;
      chargedStaffCount: number;
    }
  >();

  for (const key of uniqueKeys) {
    result.set(key, {
      salariesPaise: 0,
      activeStaffCount: 0,
      chargedStaffCount: 0,
    });
  }

  if (accrueKeys.length === 0) return result;

  const employees = await prisma.employee.findMany({
    where: { active: true },
    select: {
      id: true,
      dailyRatePaise: true,
      joinedAt: true,
      attendance: {
        where: { dayKey: { in: accrueKeys } },
        select: { dayKey: true, kind: true },
      },
    },
  });

  for (const key of accrueKeys) {
    const row = result.get(key)!;
    row.activeStaffCount = employees.length;
  }

  for (const employee of employees) {
    const joinKey = employeeJoinDayKey(employee.joinedAt);
    const byDay = new Map(employee.attendance.map((a) => [a.dayKey, a.kind]));
    for (const key of accrueKeys) {
      if (!accrueSet.has(key)) continue;
      if (joinKey && key < joinKey) continue;
      const kind = byDay.get(key) ?? "WORKED";
      const fraction = attendanceDayFraction(kind);
      if (fraction <= 0) continue;
      const row = result.get(key)!;
      row.chargedStaffCount += 1;
      row.salariesPaise += Math.round(employee.dailyRatePaise * fraction);
    }
  }

  return result;
}

/** All day keys in a YYYY-MM month. */
export function dayKeysInMonth(monthKey: string): string[] {
  const days = daysInMonthFromKey(monthKey);
  return Array.from({ length: days }, (_, i) => dayKeyFromMonthDay(monthKey, i + 1));
}
