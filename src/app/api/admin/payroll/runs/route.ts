import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { AttendanceKind } from "@prisma/client";

import { ADMIN_TOKEN_COOKIE, verifyAdminToken } from "@/lib/admin-auth";
import { getPrisma } from "@/lib/prisma";
import { computePayroll, buildPayrollAttendance } from "@/lib/payroll/payroll-calc";
import { monthStartEnd } from "@/lib/payroll/payroll-utils";

export const runtime = "nodejs";

function isMonthKey(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}$/.test(s);
}

function monthDayKeyRange(monthKey: string): { startDayKey: string; endDayKey: string } {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!m) throw new Error("Invalid month key");
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const startDayKey = `${m[1]}-${m[2]}-01`;
  const next = new Date(Date.UTC(y, mo + 1, 1));
  const endY = next.getUTCFullYear();
  const endM = String(next.getUTCMonth() + 1).padStart(2, "0");
  const endDayKey = `${endY}-${endM}-01`;
  return { startDayKey, endDayKey };
}

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const session = await verifyAdminToken(
    cookieStore.get(ADMIN_TOKEN_COOKIE)?.value,
  );
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const monthKey = searchParams.get("monthKey");

  const prisma = getPrisma();
  if (monthKey && isMonthKey(monthKey)) {
    const run = await prisma.payrollRun.findUnique({
      where: { monthKey },
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
    orderBy: [{ monthKey: "desc" }],
    select: { id: true, monthKey: true, createdAt: true },
    take: 24,
  });
  return NextResponse.json({ runs });
}

async function buildPayrollRun(monthKey: string, createdById: string | null) {
  const prisma = getPrisma();
  const { start, endExclusive } = monthStartEnd(monthKey);
  const { startDayKey, endDayKey } = monthDayKeyRange(monthKey);

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
        dayKey: { gte: startDayKey, lt: endDayKey },
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

  const lines = employees.map((e) => {
    const computed = computePayroll({
      monthKey,
      monthlySalaryPaise: e.monthlySalaryPaise,
      dailyRatePaise: e.dailyRatePaise,
      paidLeavesAllowed: e.paidLeavesPerMonth,
      attendance: buildPayrollAttendance(monthKey, attendanceByEmp.get(e.id) ?? []),
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
      data: { monthKey, createdById },
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
  monthKey: string,
): Promise<boolean> {
  const run = await prisma.payrollRun.findUnique({
    where: { monthKey },
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
  const monthKey = o.monthKey;
  if (!isMonthKey(monthKey)) {
    return NextResponse.json({ error: "monthKey is required (YYYY-MM)." }, { status: 400 });
  }
  const regenerate = o.regenerate === true;

  const prisma = getPrisma();
  const existing = await prisma.payrollRun.findUnique({ where: { monthKey } });
  const incomplete = existing ? await isIncompletePayrollRun(prisma, monthKey) : false;

  if (existing && !regenerate && !incomplete) {
    return NextResponse.json(
      { error: "Payroll for this month already exists. Use regenerate to replace it." },
      { status: 409 },
    );
  }

  if (existing && (regenerate || incomplete)) {
    await prisma.payrollRun.delete({ where: { monthKey } });
  }

  try {
    await buildPayrollRun(monthKey, session.userId);
  } catch (e) {
    console.error("Payroll run failed:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Payroll run failed." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    monthKey,
    regenerated: Boolean(existing),
    repaired: incomplete,
  });
}

