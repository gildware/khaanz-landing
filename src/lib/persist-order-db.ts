import type { OrderSource, Prisma } from "@prisma/client";

import type { CustomerSession } from "@/lib/customer-auth";
import { upsertCustomerAddress } from "@/lib/customer-address";
import { applyOrderInventoryDeduction } from "@/lib/inventory/apply-order-inventory";
import {
  orderSnapshotForAudit,
  recordOrderEvent,
} from "@/lib/order-events";
import type { OrderCreateParsed } from "@/lib/parse-order-create-body";
import {
  allocateNextOrderSequence,
  buildOrderDisplayRef,
  formatDdMMyyIST,
} from "@/lib/order-ref";
import { ORDER_TX_OPTIONS } from "@/lib/order-tx-options";
import { getPrisma } from "@/lib/prisma";
import { normalizeIndianMobileDigits } from "@/lib/phone-digits";

function phoneDigits(phone: string): string {
  return normalizeIndianMobileDigits(phone);
}

function orderTotalMinor(parsed: OrderCreateParsed): number {
  let sum = 0;
  for (const line of parsed.lines) {
    sum += Math.round(line.unitPrice * line.quantity * 100);
  }
  const delivery = Math.max(0, parsed.deliveryChargeMinor ?? 0);
  const discount = Math.max(0, parsed.discountMinor ?? 0);
  sum += delivery;
  return Math.max(0, sum - Math.min(discount, sum));
}

export async function persistOrderToDatabase(
  orderId: string,
  parsed: OrderCreateParsed,
  messageSentViaWhatsApp: boolean,
  customerSession: CustomerSession,
): Promise<{ orderRef: string }> {
  const prisma = getPrisma();
  const digits = phoneDigits(parsed.phone);
  const totalMinor = orderTotalMinor(parsed);
  const deliveryChargeMinor = Math.max(0, parsed.deliveryChargeMinor ?? 0);
  const discountMinor = Math.max(0, parsed.discountMinor ?? 0);
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
        deliveryChargeMinor,
        discountMinor,
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

    await applyOrderInventoryDeduction(tx, orderId, parsed, null, now);

    await recordOrderEvent(tx, {
      orderId,
      action: "CREATED",
      actorType: "CUSTOMER",
      actorLabel: parsed.customerName.trim() || "Customer",
      summary: `Online order placed (${orderRef})`,
      after: orderSnapshotForAudit({
        status: "PENDING",
        totalMinor,
        deliveryChargeMinor,
        discountMinor,
        fulfillment: parsed.fulfillment,
        notes: parsed.notes,
        address: parsed.address,
        lineCount: parsed.lines.length,
      }),
    });

    // Remember the delivery address so the customer can reuse it next time.
    if (parsed.fulfillment === "delivery" && parsed.address.trim().length > 0) {
      await upsertCustomerAddress(tx, customer.id, {
        address: parsed.address,
        landmark: parsed.landmark,
        latitude: parsed.latitude,
        longitude: parsed.longitude,
      });
    }

    return { orderRef };
  }, ORDER_TX_OPTIONS);
}

/** Walk-in / POS: upsert customer by phone and create order (no customer session). No outbound notifications. */
export async function persistPosOrderToDatabase(
  orderId: string,
  parsed: OrderCreateParsed,
  options?: {
    paymentMethodKey?: string;
    dineInTable?: string;
    adminUserId?: string | null;
    /** Display name when creator is known but may not match a server user id. */
    createdByLabel?: string | null;
    /**
     * Business datetime for the sale (IST day for reports, refs, COGS).
     * When set, order.createdAt and inventory occurredAt use this instead of wall-clock now.
     */
    soldAt?: Date;
    /** Mark as an admin backdated / catch-up sale in notes + audit event. */
    historical?: boolean;
  },
): Promise<{ orderRef: string }> {
  const prisma = getPrisma();
  const digits = phoneDigits(parsed.phone);
  const totalMinor = orderTotalMinor(parsed);
  const deliveryChargeMinor = Math.max(0, parsed.deliveryChargeMinor ?? 0);
  const discountMinor = Math.max(0, parsed.discountMinor ?? 0);
  const scheduledAt =
    parsed.scheduleMode === "scheduled" && parsed.scheduledAt
      ? new Date(parsed.scheduledAt)
      : null;

  const paymentKey = (options?.paymentMethodKey ?? "").trim().slice(0, 64);
  const dineInTable = (options?.dineInTable ?? "").trim().slice(0, 80);
  const historical = options?.historical === true;
  const soldAt =
    options?.soldAt instanceof Date && !Number.isNaN(options.soldAt.getTime())
      ? options.soldAt
      : null;

  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.upsert({
      where: { phoneDigits: digits },
      create: {
        phoneDigits: digits,
        displayName: parsed.customerName,
      },
      update: { displayName: parsed.customerName },
    });

    const at = soldAt ?? new Date();
    const seq = await allocateNextOrderSequence(tx, at);
    const orderRef = buildOrderDisplayRef(formatDdMMyyIST(at), seq);

    const historicalTag = "[Backdated sale]";
    let notes = parsed.notes.trim();
    if (historical) {
      notes = notes
        ? notes.includes(historicalTag)
          ? notes
          : `${historicalTag} ${notes}`.slice(0, 2000)
        : historicalTag;
    }

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
        notes,
        latitude: parsed.latitude,
        longitude: parsed.longitude,
        totalMinor,
        deliveryChargeMinor,
        discountMinor,
        messageSentViaWhatsApp: false,
        source: "pos" satisfies OrderSource,
        paymentMethod: paymentKey,
        dineInTable,
        createdByUserId: options?.adminUserId ?? null,
        createdAt: at,
        lines: {
          create: parsed.lines.map((line, sortIndex) => ({
            sortIndex,
            payload: line as unknown as Prisma.InputJsonValue,
          })),
        },
      },
    });

    await applyOrderInventoryDeduction(
      tx,
      orderId,
      parsed,
      options?.adminUserId ?? null,
      at,
    );

    const createdByLabel = (options?.createdByLabel ?? "").trim().slice(0, 160);
    await recordOrderEvent(tx, {
      orderId,
      action: "CREATED",
      actorType:
        options?.adminUserId || createdByLabel ? "USER" : "POS_SYNC",
      actorUserId: options?.adminUserId ?? null,
      actorLabel: createdByLabel || undefined,
      summary: historical
        ? `Backdated POS sale recorded (${orderRef})`
        : `POS order created (${orderRef})`,
      after: orderSnapshotForAudit({
        status: "ACCEPTED",
        totalMinor,
        deliveryChargeMinor,
        discountMinor,
        fulfillment: parsed.fulfillment,
        paymentMethod: paymentKey,
        dineInTable,
        notes,
        address: parsed.address,
        lineCount: parsed.lines.length,
      }),
    });

    if (parsed.fulfillment === "delivery" && parsed.address.trim().length > 0) {
      await upsertCustomerAddress(tx, customer.id, {
        address: parsed.address,
        landmark: parsed.landmark,
        latitude: parsed.latitude,
        longitude: parsed.longitude,
      });
    }

    return { orderRef };
  }, ORDER_TX_OPTIONS);
}
