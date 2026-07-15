import type { PrismaClient } from "@prisma/client";

import {
  formatIstDateInput,
  istDateLabel,
  istDayKey,
  istStartOfNextMonth,
  parseIstDateInput,
} from "@/lib/ist-dates";
import { dayKeysInMonth } from "@/lib/reports/day-salaries";

export type CashDayMovement = {
  salesCollectedPaise: number;
  vendorCollectionsPaise: number;
  expensesPaise: number;
  personalCashPaise: number;
  supplierPaymentsPaise: number;
  advancesPaise: number;
  adjustmentsPaise: number;
};

export type CashDayRow = CashDayMovement & {
  date: string;
  label: string;
  isFuture: boolean;
  /** True when this IST day is before the configured opening effective date. */
  beforeOpening: boolean;
  openingPaise: number;
  netChangePaise: number;
  closingPaise: number;
};

export type CashPoolOpening = {
  openingBalancePaise: number;
  openingEffectiveAt: Date;
  note: string;
};

export function emptyMovement(): CashDayMovement {
  return {
    salesCollectedPaise: 0,
    vendorCollectionsPaise: 0,
    expensesPaise: 0,
    personalCashPaise: 0,
    supplierPaymentsPaise: 0,
    advancesPaise: 0,
    adjustmentsPaise: 0,
  };
}

export function netChangeFromMovement(m: CashDayMovement): number {
  return (
    m.salesCollectedPaise +
    m.vendorCollectionsPaise +
    m.adjustmentsPaise -
    m.expensesPaise -
    m.personalCashPaise -
    m.supplierPaymentsPaise -
    m.advancesPaise
  );
}

function addMovement(target: CashDayMovement, delta: Partial<CashDayMovement>) {
  if (delta.salesCollectedPaise) target.salesCollectedPaise += delta.salesCollectedPaise;
  if (delta.vendorCollectionsPaise) {
    target.vendorCollectionsPaise += delta.vendorCollectionsPaise;
  }
  if (delta.expensesPaise) target.expensesPaise += delta.expensesPaise;
  if (delta.personalCashPaise) target.personalCashPaise += delta.personalCashPaise;
  if (delta.supplierPaymentsPaise) {
    target.supplierPaymentsPaise += delta.supplierPaymentsPaise;
  }
  if (delta.advancesPaise) target.advancesPaise += delta.advancesPaise;
  if (delta.adjustmentsPaise) target.adjustmentsPaise += delta.adjustmentsPaise;
}

function monthLabel(monthKey: string): string {
  const from = parseIstDateInput(`${monthKey}-01`)!;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    month: "long",
    year: "numeric",
  }).format(from);
}

export async function ensureCashPoolSettings(
  prisma: PrismaClient,
): Promise<CashPoolOpening> {
  const existing = await prisma.cashPoolSettings.findUnique({
    where: { id: "default" },
  });
  if (existing) {
    return {
      openingBalancePaise: existing.openingBalancePaise,
      openingEffectiveAt: existing.openingEffectiveAt,
      note: existing.note,
    };
  }

  // Default: opening 0 as of today IST midnight so we don't invent history.
  const openingEffectiveAt = parseIstDateInput(formatIstDateInput(new Date()))!;
  const created = await prisma.cashPoolSettings.create({
    data: {
      id: "default",
      openingBalancePaise: 0,
      openingEffectiveAt,
      note: "",
    },
  });
  return {
    openingBalancePaise: created.openingBalancePaise,
    openingEffectiveAt: created.openingEffectiveAt,
    note: created.note,
  };
}

/**
 * Aggregate money-pool movements in [from, toExclusive).
 * Only counts events on/after openingEffectiveAt.
 */
export async function sumCashMovementsInRange(
  prisma: PrismaClient,
  from: Date,
  toExclusive: Date,
  openingEffectiveAt: Date,
): Promise<CashDayMovement> {
  const rangeStart = from > openingEffectiveAt ? from : openingEffectiveAt;
  const out = emptyMovement();
  if (!(rangeStart < toExclusive)) return out;

  const [
    orders,
    vendorPayments,
    expenses,
    personalCash,
    supplierPayments,
    advances,
    adjustments,
  ] = await Promise.all([
    prisma.order.findMany({
      where: {
        createdAt: { gte: rangeStart, lt: toExclusive },
        status: { not: "CANCELLED" },
        paymentMethod: { not: "" },
      },
      select: { totalMinor: true },
    }),
    prisma.vendorPayment.findMany({
      where: { paidAt: { gte: rangeStart, lt: toExclusive } },
      select: { amountPaise: true },
    }),
    prisma.expenseEntry.findMany({
      where: { occurredAt: { gte: rangeStart, lt: toExclusive } },
      select: { amountPaise: true },
    }),
    prisma.personalUseEntry.findMany({
      where: {
        occurredAt: { gte: rangeStart, lt: toExclusive },
        kind: "CASH",
      },
      select: { cashAmountPaise: true },
    }),
    prisma.supplierPayment.findMany({
      where: { paidAt: { gte: rangeStart, lt: toExclusive } },
      select: { amountPaise: true },
    }),
    prisma.employeeAdvance.findMany({
      where: {
        occurredAt: { gte: rangeStart, lt: toExclusive },
        method: { in: ["CASH", "RECHARGE"] },
      },
      select: { amountPaise: true },
    }),
    prisma.cashAdjustment.findMany({
      where: { occurredAt: { gte: rangeStart, lt: toExclusive } },
      select: { amountPaise: true },
    }),
  ]);

  for (const o of orders) out.salesCollectedPaise += o.totalMinor;
  for (const p of vendorPayments) out.vendorCollectionsPaise += p.amountPaise;
  for (const e of expenses) out.expensesPaise += e.amountPaise;
  for (const p of personalCash) out.personalCashPaise += p.cashAmountPaise;
  for (const p of supplierPayments) out.supplierPaymentsPaise += p.amountPaise;
  for (const a of advances) out.advancesPaise += a.amountPaise;
  for (const a of adjustments) out.adjustmentsPaise += a.amountPaise;

  return out;
}

/** Balance just before `asOf` (exclusive): opening + movements in [effective, asOf). */
export async function cashBalanceBefore(
  prisma: PrismaClient,
  asOf: Date,
  opening: CashPoolOpening,
): Promise<number> {
  if (!(asOf > opening.openingEffectiveAt)) {
    return opening.openingBalancePaise;
  }
  const prior = await sumCashMovementsInRange(
    prisma,
    opening.openingEffectiveAt,
    asOf,
    opening.openingEffectiveAt,
  );
  return opening.openingBalancePaise + netChangeFromMovement(prior);
}

export async function buildCashDailyTable(
  prisma: PrismaClient,
  monthKey: string,
  now: Date = new Date(),
): Promise<{
  monthKey: string;
  label: string;
  today: string;
  opening: CashPoolOpening;
  monthOpeningPaise: number;
  balanceTodayPaise: number;
  days: CashDayRow[];
  totals: CashDayMovement & { netChangePaise: number; closingPaise: number };
}> {
  const opening = await ensureCashPoolSettings(prisma);
  const from = parseIstDateInput(`${monthKey}-01`)!;
  const toExclusive = istStartOfNextMonth(from);
  const todayKey = formatIstDateInput(now);
  const effectiveKey = formatIstDateInput(opening.openingEffectiveAt);
  const dayKeys = dayKeysInMonth(monthKey);

  const movementsByDate = new Map<string, CashDayMovement>();
  for (const date of dayKeys) {
    movementsByDate.set(date, emptyMovement());
  }

  const rangeStart =
    from > opening.openingEffectiveAt ? from : opening.openingEffectiveAt;

  if (rangeStart < toExclusive) {
    const [
      orders,
      vendorPayments,
      expenses,
      personalCash,
      supplierPayments,
      advances,
      adjustments,
    ] = await Promise.all([
      prisma.order.findMany({
        where: {
          createdAt: { gte: rangeStart, lt: toExclusive },
          status: { not: "CANCELLED" },
          paymentMethod: { not: "" },
        },
        select: { createdAt: true, totalMinor: true },
      }),
      prisma.vendorPayment.findMany({
        where: { paidAt: { gte: rangeStart, lt: toExclusive } },
        select: { paidAt: true, amountPaise: true },
      }),
      prisma.expenseEntry.findMany({
        where: { occurredAt: { gte: rangeStart, lt: toExclusive } },
        select: { occurredAt: true, amountPaise: true },
      }),
      prisma.personalUseEntry.findMany({
        where: {
          occurredAt: { gte: rangeStart, lt: toExclusive },
          kind: "CASH",
        },
        select: { occurredAt: true, cashAmountPaise: true },
      }),
      prisma.supplierPayment.findMany({
        where: { paidAt: { gte: rangeStart, lt: toExclusive } },
        select: { paidAt: true, amountPaise: true },
      }),
      prisma.employeeAdvance.findMany({
        where: {
          occurredAt: { gte: rangeStart, lt: toExclusive },
          method: { in: ["CASH", "RECHARGE"] },
        },
        select: { occurredAt: true, amountPaise: true },
      }),
      prisma.cashAdjustment.findMany({
        where: { occurredAt: { gte: rangeStart, lt: toExclusive } },
        select: { occurredAt: true, amountPaise: true },
      }),
    ]);

    for (const o of orders) {
      const key = istDayKey(o.createdAt);
      const row = movementsByDate.get(key);
      if (row) addMovement(row, { salesCollectedPaise: o.totalMinor });
    }
    for (const p of vendorPayments) {
      const key = istDayKey(p.paidAt);
      const row = movementsByDate.get(key);
      if (row) addMovement(row, { vendorCollectionsPaise: p.amountPaise });
    }
    for (const e of expenses) {
      const key = istDayKey(e.occurredAt);
      const row = movementsByDate.get(key);
      if (row) addMovement(row, { expensesPaise: e.amountPaise });
    }
    for (const p of personalCash) {
      const key = istDayKey(p.occurredAt);
      const row = movementsByDate.get(key);
      if (row) addMovement(row, { personalCashPaise: p.cashAmountPaise });
    }
    for (const p of supplierPayments) {
      const key = istDayKey(p.paidAt);
      const row = movementsByDate.get(key);
      if (row) addMovement(row, { supplierPaymentsPaise: p.amountPaise });
    }
    for (const a of advances) {
      const key = istDayKey(a.occurredAt);
      const row = movementsByDate.get(key);
      if (row) addMovement(row, { advancesPaise: a.amountPaise });
    }
    for (const a of adjustments) {
      const key = istDayKey(a.occurredAt);
      const row = movementsByDate.get(key);
      if (row) addMovement(row, { adjustmentsPaise: a.amountPaise });
    }
  }

  const trackFrom =
    from > opening.openingEffectiveAt ? from : opening.openingEffectiveAt;
  const monthOpeningPaise =
    trackFrom < toExclusive
      ? await cashBalanceBefore(prisma, trackFrom, opening)
      : opening.openingBalancePaise;

  const days: CashDayRow[] = [];
  let running: number | null =
    from >= opening.openingEffectiveAt ? monthOpeningPaise : null;
  const totals = emptyMovement();

  for (const date of dayKeys) {
    const isFuture = date > todayKey;
    const beforeOpening = date < effectiveKey;
    const dayStart = parseIstDateInput(date)!;
    const m =
      beforeOpening || isFuture
        ? emptyMovement()
        : (movementsByDate.get(date) ?? emptyMovement());

    if (beforeOpening) {
      days.push({
        date,
        label: istDateLabel(dayStart),
        isFuture,
        beforeOpening: true,
        openingPaise: 0,
        ...emptyMovement(),
        netChangePaise: 0,
        closingPaise: 0,
      });
      continue;
    }

    if (running === null) running = opening.openingBalancePaise;
    const openingPaise = running;
    const net = isFuture ? 0 : netChangeFromMovement(m);
    const closingPaise = isFuture ? openingPaise : openingPaise + net;

    if (!isFuture) {
      addMovement(totals, m);
      running = closingPaise;
    }

    days.push({
      date,
      label: istDateLabel(dayStart),
      isFuture,
      beforeOpening: false,
      openingPaise,
      ...m,
      netChangePaise: net,
      closingPaise,
    });
  }

  const todayStart = parseIstDateInput(todayKey)!;
  const tomorrow = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const balanceTodayPaise = await cashBalanceBefore(prisma, tomorrow, opening);

  const lastPast = [...days]
    .reverse()
    .find((d) => !d.isFuture && !d.beforeOpening);
  const closingPaise = lastPast?.closingPaise ?? monthOpeningPaise;

  return {
    monthKey,
    label: monthLabel(monthKey),
    today: todayKey,
    opening,
    monthOpeningPaise,
    balanceTodayPaise,
    days,
    totals: {
      ...totals,
      netChangePaise: netChangeFromMovement(totals),
      closingPaise,
    },
  };
}
