import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { AttendanceKind } from "@prisma/client";

import { ADMIN_TOKEN_COOKIE, verifyAdminToken } from "@/lib/admin-auth";
import { getPrisma } from "@/lib/prisma";
import { computePayroll, buildPayrollAttendance } from "@/lib/payroll/payroll-calc";
import {
  dayKeysInclusive,
  fullMonthPeriod,
  isDayKey,
  monthKeyFromDayKey,
  periodStartEndExclusive,
} from "@/lib/payroll/payroll-utils";

export const runtime = "nodejs";

function isMonthKey(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}$/.test(s);
}

type PayrollPeriodInput = {
  monthKey: string;
  startDayKey: string;
  endDayKey: string;
};

function parsePayrollPeriod(body: Record<string, unknown>): PayrollPeriodInput | { error: string } {
  const monthKey = body.monthKey;
  if (!isMonthKey(monthKey)) {
    return { error: "monthKey is required (YYYY-MM)." };
  }

  const startDayKeyRaw = body.startDayKey;
  const endDayKeyRaw = body.endDayKey;
  const hasStart = startDayKeyRaw !== undefined && startDayKeyRaw !== null && startDayKeyRaw !== "";
  const hasEnd = endDayKeyRaw !== undefined && endDayKeyRaw !== null && endDayKeyRaw !== "";

  if (!hasStart && !hasEnd) {
    return fullMonthPeriod(monthKey);
  }

  if (!hasStart || !hasEnd) {
    return { error: "Both startDayKey and endDayKey are required for a day-range payroll run." };
  }
  if (!isDayKey(startDayKeyRaw) || !isDayKey(endDayKeyRaw)) {
    return { error: "startDayKey and endDayKey must be YYYY-MM-DD." };
  }
  if (endDayKeyRaw < startDayKeyRaw) {
    return { error: "endDayKey must be on or after startDayKey." };
  }
  if (monthKeyFromDayKey(startDayKeyRaw) !== monthKey || monthKeyFromDayKey(endDayKeyRaw) !== monthKey) {
    return { error: "Day range must fall within the selected month." };
  }

  return { monthKey, startDayKey: startDayKeyRaw, endDayKey: endDayKeyRaw };
}

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const session = await verifyAdminToken(
    cookieStore.get(ADMIN_TOKEN_COOKIE)?.value,
  );
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const monthKey = searchParams.get("monthKey");
  const startDayKey = searchParams.get("startDayKey");
  const endDayKey = searchParams.get("endDayKey");

  const prisma = getPrisma();
  if (monthKey && isMonthKey(monthKey)) {
    const period =
      startDayKey && endDayKey && isDayKey(startDayKey) && isDayKey(endDayKey)
        ? { monthKey, startDayKey, endDayKey }
        : fullMonthPeriod(monthKey);

    const run = await prisma.payrollRun.findUnique({
      where: {
        monthKey_startDayKey_endDayKey: period,
      },
      include: {
        lines: {
          include: { employee: { select: { name: true, code: true, active: true } } },
          orderBy: [{ employee: { name: "asc" } }],
        },
      },
    });
    return NextResponse.json({ run });
  }

  const runs = await prisma.payrollRun.findMany({
    orderBy: [{ monthKey: "desc" }, { startDayKey: "desc" }],
    select: {
      id: true,
      monthKey: true,
      startDayKey: true,
      endDayKey: true,
      createdAt: true,
    },
    take: 48,
  });
  return NextResponse.json({ runs });
}

async function buildPayrollRun(
  period: PayrollPeriodInput,
  createdById: string | null,
) {
  const prisma = getPrisma();
  const { start, endExclusive } = periodStartEndExclusive(period.startDayKey, period.endDayKey);
  const dayKeys = dayKeysInclusive(period.startDayKey, period.endDayKey);

  const employees = await prisma.employee.findMany({
    where: { active: true },
    select: {
      id: true,
      name: true,
      code: true,
      monthlySalaryPaise: true,
      dailyRatePaise: true,
      paidLeavesPerMonth: true,
    },
    orderBy: [{ name: "asc" }],
  });

  if (employees.length === 0) {
    throw new Error("No active employees. Add employees before running payroll.");
  }

  const [attendance, advances] = await Promise.all([
    prisma.attendanceDay.findMany({
      where: {
        dayKey: { in: dayKeys },
        employeeId: { in: employees.map((e) => e.id) },
      },
      select: { employeeId: true, kind: true, dayKey: true },
    }),
    prisma.employeeAdvance.findMany({
      where: {
        occurredAt: { gte: start, lt: endExclusive },
        employeeId: { in: employees.map((e) => e.id) },
      },
      select: { employeeId: true, amountPaise: true },
    }),
  ]);

  const attendanceByEmp = new Map<string, { dayKey: string; kind: AttendanceKind }[]>();
  for (const a of attendance) {
    const arr = attendanceByEmp.get(a.employeeId) ?? [];
    arr.push({ dayKey: a.dayKey, kind: a.kind });
    attendanceByEmp.set(a.employeeId, arr);
  }
  const advancesByEmp = new Map<string, number>();
  for (const ad of advances) {
    advancesByEmp.set(ad.employeeId, (advancesByEmp.get(ad.employeeId) ?? 0) + ad.amountPaise);
  }

  const periodRange = { startDayKey: period.startDayKey, endDayKey: period.endDayKey };
  const lines = employees.map((e) => {
    const computed = computePayroll({
      monthKey: period.monthKey,
      startDayKey: period.startDayKey,
      endDayKey: period.endDayKey,
      monthlySalaryPaise: e.monthlySalaryPaise,
      dailyRatePaise: e.dailyRatePaise,
      paidLeavesAllowed: e.paidLeavesPerMonth,
      attendance: buildPayrollAttendance(
        period.monthKey,
        attendanceByEmp.get(e.id) ?? [],
        periodRange,
      ),
      advancesPaise: advancesByEmp.get(e.id) ?? 0,
    });
    return {
      employeeId: e.id,
      monthlySalaryPaise: e.monthlySalaryPaise,
      dailyRatePaise: e.dailyRatePaise,
      paidLeavesAllowed: e.paidLeavesPerMonth,
      totalDays: computed.totalDays,
      workedDays: computed.presentDays + computed.workedOnLeaveDays,
      halfLeaveDays: computed.halfLeaveDays,
      leaveDays: computed.fullLeaveDays,
      absentDays: 0,
      workedOnLeaveDays: computed.workedOnLeaveDays,
      extrasPaise: computed.extrasPaise,
      deductionsPaise: computed.deductionsPaise,
      advancesPaise: computed.advancesPaise,
      netPayPaise: computed.netPayPaise,
    };
  });

  return prisma.$transaction(async (tx) => {
    const run = await tx.payrollRun.create({
      data: {
        monthKey: period.monthKey,
        startDayKey: period.startDayKey,
        endDayKey: period.endDayKey,
        createdById,
      },
      select: { id: true },
    });

    await tx.payrollEmployeeLine.createMany({
      data: lines.map((line) => ({ ...line, payrollRunId: run.id })),
    });

    return run;
  });
}

async function isIncompletePayrollRun(
  prisma: ReturnType<typeof getPrisma>,
  period: PayrollPeriodInput,
): Promise<boolean> {
  const run = await prisma.payrollRun.findUnique({
    where: {
      monthKey_startDayKey_endDayKey: period,
    },
    select: { _count: { select: { lines: true } } },
  });
  return Boolean(run && run._count.lines === 0);
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const session = await verifyAdminToken(
    cookieStore.get(ADMIN_TOKEN_COOKIE)?.value,
  );
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const o = body as Record<string, unknown>;
  const parsed = parsePayrollPeriod(o);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const regenerate = o.regenerate === true;

  const prisma = getPrisma();
  const existing = await prisma.payrollRun.findUnique({
    where: { monthKey_startDayKey_endDayKey: parsed },
  });
  const incomplete = existing ? await isIncompletePayrollRun(prisma, parsed) : false;

  if (existing && !regenerate && !incomplete) {
    return NextResponse.json(
      { error: "Payroll for this period already exists. Use regenerate to replace it." },
      { status: 409 },
    );
  }

  if (existing && (regenerate || incomplete)) {
    await prisma.payrollRun.delete({
      where: { monthKey_startDayKey_endDayKey: parsed },
    });
  }

  try {
    await buildPayrollRun(parsed, session.userId);
  } catch (e) {
    console.error("Payroll run failed:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Payroll run failed." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    monthKey: parsed.monthKey,
    startDayKey: parsed.startDayKey,
    endDayKey: parsed.endDayKey,
    regenerated: Boolean(existing),
    repaired: incomplete,
  });
}
