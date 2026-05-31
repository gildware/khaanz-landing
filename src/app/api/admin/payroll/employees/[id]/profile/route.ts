import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { AttendanceKind } from "@prisma/client";

import { ADMIN_TOKEN_COOKIE, verifyAdminToken } from "@/lib/admin-auth";
import { computePayroll } from "@/lib/payroll/payroll-calc";
import { monthKeyFromDate, monthStartEnd } from "@/lib/payroll/payroll-utils";
import { getPrisma } from "@/lib/prisma";

export const runtime = "nodejs";

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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const cookieStore = await cookies();
  const session = await verifyAdminToken(
    cookieStore.get(ADMIN_TOKEN_COOKIE)?.value,
  );
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const prisma = getPrisma();

  const employee = await prisma.employee.findUnique({
    where: { id },
    include: {
      documents: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!employee) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const currentMonthKey = monthKeyFromDate(new Date());
  const { startDayKey, endDayKey } = monthDayKeyRange(currentMonthKey);
  const { start: monthStart, endExclusive: monthEnd } = monthStartEnd(currentMonthKey);

  const [payrollLines, advances, currentAttendance, currentMonthAdvances] =
    await Promise.all([
      prisma.payrollEmployeeLine.findMany({
        where: { employeeId: id },
        include: {
          payrollRun: { select: { monthKey: true, createdAt: true } },
        },
        orderBy: [{ payrollRun: { monthKey: "desc" } }],
        take: 24,
      }),
      prisma.employeeAdvance.findMany({
        where: { employeeId: id },
        orderBy: [{ occurredAt: "desc" }],
        take: 100,
        select: {
          id: true,
          occurredAt: true,
          amountPaise: true,
          method: true,
          reference: true,
          note: true,
        },
      }),
      prisma.attendanceDay.findMany({
        where: {
          employeeId: id,
          dayKey: { gte: startDayKey, lt: endDayKey },
        },
        orderBy: [{ dayKey: "asc" }],
        select: { dayKey: true, kind: true },
      }),
      prisma.employeeAdvance.findMany({
        where: {
          employeeId: id,
          occurredAt: { gte: monthStart, lt: monthEnd },
        },
        select: { amountPaise: true },
      }),
    ]);

  const leaveHistory = await prisma.attendanceDay.findMany({
    where: {
      employeeId: id,
      kind: { in: ["LEAVE", "ABSENT", "WORKED_ON_LEAVE"] },
    },
    orderBy: [{ dayKey: "desc" }],
    take: 60,
    select: { dayKey: true, kind: true },
  });

  const totalNetPaidPaise = payrollLines.reduce((s, l) => s + l.netPayPaise, 0);
  const totalAdvancesPaise = advances.reduce((s, a) => s + a.amountPaise, 0);
  const currentMonthAdvancesPaise = currentMonthAdvances.reduce(
    (s, a) => s + a.amountPaise,
    0,
  );

  const currentMonthComputed = computePayroll({
    monthlySalaryPaise: employee.monthlySalaryPaise,
    dailyRatePaise: employee.dailyRatePaise,
    paidLeavesAllowed: employee.paidLeavesPerMonth,
    attendance: currentAttendance.map((a) => ({ kind: a.kind as AttendanceKind })),
    advancesPaise: currentMonthAdvancesPaise,
  });

  const currentMonthPayrollLine = payrollLines.find(
    (l) => l.payrollRun.monthKey === currentMonthKey,
  );

  return NextResponse.json({
    employee: {
      id: employee.id,
      code: employee.code,
      name: employee.name,
      phone: employee.phone,
      address: employee.address,
      active: employee.active,
      monthlySalaryPaise: employee.monthlySalaryPaise,
      dailyRatePaise: employee.dailyRatePaise,
      paidLeavesPerMonth: employee.paidLeavesPerMonth,
      joinedAt: employee.joinedAt?.toISOString() ?? null,
      createdAt: employee.createdAt.toISOString(),
    },
    documents: employee.documents.map((d) => ({
      id: d.id,
      kind: d.kind,
      title: d.title,
      fileUrl: d.fileUrl,
      note: d.note,
      createdAt: d.createdAt.toISOString(),
    })),
    summary: {
      totalNetPaidPaise,
      totalAdvancesPaise,
      payrollMonthsCount: payrollLines.length,
      currentMonthKey,
      currentMonth: {
        hasPayrollRun: Boolean(currentMonthPayrollLine),
        netPayPaise: currentMonthPayrollLine?.netPayPaise ?? currentMonthComputed.netPayPaise,
        projected: !currentMonthPayrollLine,
        workedDays: currentMonthComputed.workedDays,
        leaveDays: currentMonthComputed.leaveDays,
        absentDays: currentMonthComputed.absentDays,
        workedOnLeaveDays: currentMonthComputed.workedOnLeaveDays,
        paidLeavesAllowed: employee.paidLeavesPerMonth,
        unpaidLeaveDays: Math.max(
          0,
          currentMonthComputed.leaveDays - employee.paidLeavesPerMonth,
        ),
        extrasPaise: currentMonthComputed.extrasPaise,
        deductionsPaise: currentMonthComputed.deductionsPaise,
        advancesPaise: currentMonthAdvancesPaise,
      },
    },
    payrollHistory: payrollLines.map((l) => ({
      id: l.id,
      monthKey: l.payrollRun.monthKey,
      runCreatedAt: l.payrollRun.createdAt.toISOString(),
      monthlySalaryPaise: l.monthlySalaryPaise,
      dailyRatePaise: l.dailyRatePaise,
      paidLeavesAllowed: l.paidLeavesAllowed,
      workedDays: l.workedDays,
      leaveDays: l.leaveDays,
      absentDays: l.absentDays,
      workedOnLeaveDays: l.workedOnLeaveDays,
      extrasPaise: l.extrasPaise,
      deductionsPaise: l.deductionsPaise,
      advancesPaise: l.advancesPaise,
      netPayPaise: l.netPayPaise,
    })),
    advances,
    leaveHistory,
    currentMonthAttendance: currentAttendance,
  });
}
