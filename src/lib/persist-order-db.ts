import type { OrderSource, Prisma } from "@prisma/client";

import type { CustomerSession } from "@/lib/customer-auth";
import type { OrderCreateParsed } from "@/lib/parse-order-create-body";
import {
  allocateNextOrderSequence,
  buildOrderDisplayRef,
  formatDdMMyyIST,
} from "@/lib/order-ref";
import { getPrisma } from "@/lib/prisma";
import { normalizeIndianMobileDigits } from "@/lib/phone-digits";

function phoneDigits(phone: string): string {
  return normalizeIndianMobileDigits(phone);
}

function orderTotalMinor(lines: OrderCreateParsed["lines"]): number {
  let sum = 0;
  for (const line of lines) {
    sum += Math.round(line.unitPrice * line.quantity * 100);
  }
  return sum;
}

export async function persistOrderToDatabase(
  orderId: string,
  parsed: OrderCreateParsed,
  messageSentViaWhatsApp: boolean,
  customerSession: CustomerSession,
): Promise<{ orderRef: string }> {
  const prisma = getPrisma();
  const digits = phoneDigits(parsed.phone);
  const totalMinor = orderTotalMinor(parsed.lines);
  const scheduledAt =
    parsed.scheduleMode === "scheduled" && parsed.scheduledAt
      ? new Date(parsed.scheduledAt)
      : null;

  return prisma.$transaction(async (tx) => {
    if (customerSession.phoneDigits !== digits) {
      throw new Error("SESSION_PHONE_MISMATCH");
    }
    const row = await tx.customer.findUnique({
      where: { id: customerSession.customerId },
    });
    if (!row || row.phoneDigits !== digits) {
      throw new Error("SESSION_CUSTOMER_INVALID");
    }
    const customer = await tx.customer.update({
      where: { id: row.id },
      data: { displayName: parsed.customerName },
    });

    const now = new Date();
    const seq = await allocateNextOrderSequence(tx, now);
    const orderRef = buildOrderDisplayRef(formatDdMMyyIST(now), seq);

    await tx.order.create({
      data: {
        id: orderId,
        orderRef,
        customerId: customer.id,
        status: "PENDING",
        fulfillment: parsed.fulfillment,
        scheduleMode: parsed.scheduleMode,
        scheduledAt,
        address: parsed.address,
        landmark: parsed.landmark,
        notes: parsed.notes,
        latitude: parsed.latitude,
        longitude: parsed.longitude,
        totalMinor,
        messageSentViaWhatsApp,
        source: "website" satisfies OrderSource,
        paymentMethod: "",
        dineInTable: "",
        lines: {
          create: parsed.lines.map((line, sortIndex) => ({
            sortIndex,
            payload: line as unknown as Prisma.InputJsonValue,
          })),
        },
      },
    });

    return { orderRef };
  });
}

/** Walk-in / POS: upsert customer by phone and create order (no customer session). No outbound notifications. */
export async function persistPosOrderToDatabase(
  orderId: string,
  parsed: OrderCreateParsed,
  options?: { paymentMethodKey?: string; dineInTable?: string },
): Promise<{ orderRef: string }> {
  const prisma = getPrisma();
  const digits = phoneDigits(parsed.phone);
  const totalMinor = orderTotalMinor(parsed.lines);
  const scheduledAt =
    parsed.scheduleMode === "scheduled" && parsed.scheduledAt
      ? new Date(parsed.scheduledAt)
      : null;

  const paymentKey = (options?.paymentMethodKey ?? "").trim().slice(0, 64);
  const dineInTable = (options?.dineInTable ?? "").trim().slice(0, 80);

  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.upsert({
      where: { phoneDigits: digits },
      create: {
        phoneDigits: digits,
        displayName: parsed.customerName,
      },
      update: { displayName: parsed.customerName },
    });

    const now = new Date();
    const seq = await allocateNextOrderSequence(tx, now);
    const orderRef = buildOrderDisplayRef(formatDdMMyyIST(now), seq);

    await tx.order.create({
      data: {
        id: orderId,
        orderRef,
        customerId: customer.id,
        status: "ACCEPTED",
        fulfillment: parsed.fulfillment,
        scheduleMode: parsed.scheduleMode,
        scheduledAt,
        address: parsed.address,
        landmark: parsed.landmark,
        notes: parsed.notes,
        latitude: parsed.latitude,
        longitude: parsed.longitude,
        totalMinor,
        messageSentViaWhatsApp: false,
        source: "pos" satisfies OrderSource,
        paymentMethod: paymentKey,
        dineInTable,
        lines: {
          create: parsed.lines.map((line, sortIndex) => ({
            sortIndex,
            payload: line as unknown as Prisma.InputJsonValue,
          })),
        },
      },
    });

    return { orderRef };
  });
}
