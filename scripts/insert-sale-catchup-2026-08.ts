/**
 * Backdate cash open-item POS orders so daily sales match notebook actuals
 * on days where POS is short. Open items do not deduct inventory.
 * Days where POS is already higher are skipped.
 *
 * Run: npx tsx scripts/insert-sale-catchup-2026-08.ts
 */
import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";

import { persistPosOrderToDatabase } from "../src/lib/persist-order-db";
import { POS_ANONYMOUS_PHONE_DIGITS } from "../src/lib/phone-digits";
import { readRestaurantSettings } from "../src/lib/settings-repository";
import type { OrderCreateParsed } from "../src/lib/parse-order-create-body";
import type { CartOpenLine } from "../src/types/menu";

const NOTEBOOK_ACTUAL: { date: string; actualRupees: number }[] = [
  { date: "2026-08-01", actualRupees: 33090 },
  { date: "2026-08-02", actualRupees: 29937 },
  { date: "2026-08-03", actualRupees: 23599 },
  { date: "2026-08-04", actualRupees: 30403 },
  { date: "2026-08-05", actualRupees: 25488 },
  { date: "2026-08-06", actualRupees: 22330 },
  { date: "2026-08-07", actualRupees: 33429 },
  { date: "2026-08-08", actualRupees: 22959 },
  { date: "2026-08-09", actualRupees: 29410 },
  { date: "2026-08-10", actualRupees: 30261 },
  { date: "2026-08-11", actualRupees: 28685 },
  { date: "2026-08-12", actualRupees: 21653 },
  { date: "2026-08-13", actualRupees: 28643 },
  { date: "2026-08-14", actualRupees: 25654 },
  { date: "2026-08-15", actualRupees: 43769 },
  { date: "2026-08-16", actualRupees: 36504 },
  { date: "2026-08-17", actualRupees: 25109 },
];

const CATCHUP_MARK = "sale catch-up (actual − POS)";

function catchupNote(date: string): string {
  const day = Number(date.slice(8, 10));
  return `Handwritten notebook ${day}/8 — ${CATCHUP_MARK}`;
}

function dayRange(date: string): { from: Date; to: Date } {
  const from = new Date(`${date}T00:00:00+05:30`);
  return { from, to: new Date(from.getTime() + 24 * 60 * 60 * 1000) };
}

async function posTotalRupees(
  prisma: PrismaClient,
  date: string,
): Promise<{ n: number; rupees: number }> {
  const { from, to } = dayRange(date);
  const orders = await prisma.order.findMany({
    where: { createdAt: { gte: from, lt: to }, status: { not: "CANCELLED" } },
    select: { totalMinor: true },
  });
  return {
    n: orders.length,
    rupees: orders.reduce((s, o) => s + o.totalMinor, 0) / 100,
  };
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const settings = await readRestaurantSettings();
    const paymentMethodKey =
      settings.paymentMethods.find((p) => p.id === "cash")?.id ??
      settings.paymentMethods[0]?.id;
    if (!paymentMethodKey) throw new Error("No payment methods configured.");

    const admin =
      (await prisma.user.findFirst({
        where: { email: "manager@khaanz.in" },
        select: { id: true, email: true },
      })) ??
      (await prisma.user.findFirst({
        orderBy: { createdAt: "asc" },
        select: { id: true, email: true },
      }));

    const inserted: unknown[] = [];
    const skipped: unknown[] = [];

    for (const row of NOTEBOOK_ACTUAL) {
      const { from, to } = dayRange(row.date);
      const existingCatchup = await prisma.order.findFirst({
        where: {
          createdAt: { gte: from, lt: to },
          notes: { contains: CATCHUP_MARK },
        },
        select: { orderRef: true, totalMinor: true },
      });
      if (existingCatchup) {
        skipped.push({
          date: row.date,
          reason: "already inserted",
          orderRef: existingCatchup.orderRef,
          amountRupees: existingCatchup.totalMinor / 100,
        });
        continue;
      }

      const pos = await posTotalRupees(prisma, row.date);
      const gap = Math.round((row.actualRupees - pos.rupees) * 100) / 100;
      if (gap <= 0) {
        skipped.push({
          date: row.date,
          reason: "POS already at or above notebook",
          posRupees: pos.rupees,
          actualRupees: row.actualRupees,
          gapRupees: gap,
        });
        continue;
      }

      const line: CartOpenLine = {
        kind: "open",
        lineId: randomUUID(),
        name: "Notebook sale catch-up",
        quantity: 1,
        unitPrice: gap,
      };
      const parsed: OrderCreateParsed = {
        customerName: "Guest",
        phone: POS_ANONYMOUS_PHONE_DIGITS,
        fulfillment: "pickup",
        scheduleMode: "asap",
        scheduledAt: null,
        address: "",
        landmark: "",
        notes: catchupNote(row.date),
        lines: [line],
        latitude: null,
        longitude: null,
      };

      const orderId = randomUUID();
      const out = await persistPosOrderToDatabase(orderId, parsed, {
        paymentMethodKey,
        dineInTable: "",
        adminUserId: admin?.id ?? null,
        createdByLabel: admin?.email ?? "sale-catchup",
        soldAt: new Date(`${row.date}T12:00:00+05:30`),
        historical: true,
      });

      const after = await posTotalRupees(prisma, row.date);
      inserted.push({
        date: row.date,
        orderRef: out.orderRef,
        catchupRupees: gap,
        paymentMethod: paymentMethodKey,
        posBefore: pos.rupees,
        posAfter: after.rupees,
        actualRupees: row.actualRupees,
      });
    }

    console.log(JSON.stringify({ inserted, skipped }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
