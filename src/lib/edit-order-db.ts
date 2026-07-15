import type { OrderStatus, Prisma } from "@prisma/client";

import {
  InventoryInsufficientError,
  reapplyOrderInventoryForEdit,
} from "@/lib/inventory/apply-order-inventory";
import {
  orderSnapshotForAudit,
  recordOrderEvent,
} from "@/lib/order-events";
import { canEditPosOrder } from "@/lib/order-status-workflow";
import { computeOrderTotalMinor } from "@/lib/order-total";
import type { OrderCreateParsed } from "@/lib/parse-order-create-body";
import { normalizeIndianMobileDigits } from "@/lib/phone-digits";
import { getPrisma } from "@/lib/prisma";
import type { CartLine } from "@/types/menu";

export type EditOrderInput = {
  lines: CartLine[];
  deliveryChargeMinor: number;
  discountMinor: number;
};

export type EditOrderResult =
  | {
      ok: true;
      id: string;
      orderRef: string | null;
      totalMinor: number;
      deliveryChargeMinor: number;
      discountMinor: number;
    }
  | {
      ok: false;
      error: string;
      status: number;
      shortages?: { inventoryItemId: string; needed: string; onHand: string }[];
    };

export async function editOnlineOrder(
  orderId: string,
  input: EditOrderInput,
  options?: { adminUserId?: string | null },
): Promise<EditOrderResult> {
  const prisma = getPrisma();
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      source: true,
      totalMinor: true,
      deliveryChargeMinor: true,
      discountMinor: true,
      fulfillment: true,
      notes: true,
      address: true,
      _count: { select: { lines: true } },
    },
  });

  if (!order) {
    return { ok: false, error: "Order not found", status: 404 };
  }

  // Editing is only safe before the order is accepted, and only for online
  // (website) orders. POS orders are edited from the POS screen.
  if (order.source !== "website" || order.status !== "PENDING") {
    return {
      ok: false,
      error: "Only new online orders (pending acceptance) can be edited.",
      status: 409,
    };
  }

  if (input.lines.length === 0) {
    return { ok: false, error: "An order must have at least one item.", status: 400 };
  }

  const deliveryChargeMinor = Math.max(0, Math.round(input.deliveryChargeMinor));
  const discountMinor = Math.max(0, Math.round(input.discountMinor));
  const totalMinor = computeOrderTotalMinor({
    lines: input.lines,
    deliveryChargeMinor,
    discountMinor,
  });

  const before = orderSnapshotForAudit({
    status: order.status,
    totalMinor: order.totalMinor,
    deliveryChargeMinor: order.deliveryChargeMinor,
    discountMinor: order.discountMinor,
    fulfillment: order.fulfillment,
    notes: order.notes,
    address: order.address,
    lineCount: order._count.lines,
  });

  try {
    const updated = await prisma.$transaction(async (tx) => {
      await reapplyOrderInventoryForEdit(
        tx,
        orderId,
        { lines: input.lines },
        options?.adminUserId ?? null,
        new Date(),
      );

      await tx.orderLine.deleteMany({ where: { orderId } });

      const u = await tx.order.update({
        where: { id: orderId },
        data: {
          totalMinor,
          deliveryChargeMinor,
          discountMinor,
          lines: {
            create: input.lines.map((line, sortIndex) => ({
              sortIndex,
              payload: line as unknown as Prisma.InputJsonValue,
            })),
          },
        },
      });

      await recordOrderEvent(tx, {
        orderId,
        action: "EDITED",
        actorType: options?.adminUserId ? "USER" : "SYSTEM",
        actorUserId: options?.adminUserId ?? null,
        summary: "Online order items/charges updated",
        before,
        after: orderSnapshotForAudit({
          status: u.status,
          totalMinor: u.totalMinor,
          deliveryChargeMinor: u.deliveryChargeMinor,
          discountMinor: u.discountMinor,
          fulfillment: u.fulfillment,
          notes: u.notes,
          address: u.address,
          lineCount: input.lines.length,
        }),
      });

      return u;
    });

    return {
      ok: true,
      id: updated.id,
      orderRef: updated.orderRef,
      totalMinor: updated.totalMinor,
      deliveryChargeMinor: updated.deliveryChargeMinor,
      discountMinor: updated.discountMinor,
    };
  } catch (err) {
    if (err instanceof InventoryInsufficientError) {
      return {
        ok: false,
        error: "Not enough ingredient stock for the edited items.",
        status: 409,
        shortages: err.shortages,
      };
    }
    throw err;
  }
}

export type EditPosOrderOptions = {
  paymentMethodKey?: string;
  dineInTable?: string;
  adminUserId?: string | null;
};

/** Edit an existing order from the POS desktop (lines, charges, customer, fulfillment). */
export async function editPosOrder(
  orderId: string,
  parsed: OrderCreateParsed,
  options?: EditPosOrderOptions,
): Promise<EditOrderResult> {
  const prisma = getPrisma();
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      source: true,
      orderRef: true,
      totalMinor: true,
      deliveryChargeMinor: true,
      discountMinor: true,
      fulfillment: true,
      paymentMethod: true,
      dineInTable: true,
      notes: true,
      address: true,
      _count: { select: { lines: true } },
    },
  });

  if (!order) {
    return { ok: false, error: "Order not found", status: 404 };
  }

  if (!canEditPosOrder(order.status, order.fulfillment)) {
    return {
      ok: false,
      error:
        order.fulfillment === "dine_in"
          ? "Cleared or cancelled dine-in orders cannot be edited."
          : "Completed or cancelled orders cannot be edited.",
      status: 409,
    };
  }

  if (parsed.lines.length === 0) {
    return { ok: false, error: "An order must have at least one item.", status: 400 };
  }

  const deliveryChargeMinor = Math.max(0, Math.round(parsed.deliveryChargeMinor ?? 0));
  const discountMinor = Math.max(0, Math.round(parsed.discountMinor ?? 0));
  const totalMinor = computeOrderTotalMinor({
    lines: parsed.lines,
    deliveryChargeMinor,
    discountMinor,
  });
  const digits = normalizeIndianMobileDigits(parsed.phone);
  const paymentKey = (options?.paymentMethodKey ?? "").trim().slice(0, 64);
  const dineInTable = (options?.dineInTable ?? "").trim().slice(0, 80);
  const scheduledAt =
    parsed.scheduleMode === "scheduled" && parsed.scheduledAt
      ? new Date(parsed.scheduledAt)
      : null;

  const before = orderSnapshotForAudit({
    status: order.status,
    totalMinor: order.totalMinor,
    deliveryChargeMinor: order.deliveryChargeMinor,
    discountMinor: order.discountMinor,
    fulfillment: order.fulfillment,
    paymentMethod: order.paymentMethod,
    dineInTable: order.dineInTable,
    notes: order.notes,
    address: order.address,
    lineCount: order._count.lines,
  });

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const customer = await tx.customer.upsert({
        where: { phoneDigits: digits },
        create: {
          phoneDigits: digits,
          displayName: parsed.customerName,
        },
        update: { displayName: parsed.customerName },
      });

      await reapplyOrderInventoryForEdit(
        tx,
        orderId,
        { lines: parsed.lines },
        options?.adminUserId ?? null,
        new Date(),
      );

      await tx.orderLine.deleteMany({ where: { orderId } });

      const u = await tx.order.update({
        where: { id: orderId },
        data: {
          customerId: customer.id,
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

      await recordOrderEvent(tx, {
        orderId,
        action: "EDITED",
        actorType: options?.adminUserId ? "USER" : "POS_SYNC",
        actorUserId: options?.adminUserId ?? null,
        summary: "POS order updated",
        before,
        after: orderSnapshotForAudit({
          status: u.status,
          totalMinor: u.totalMinor,
          deliveryChargeMinor: u.deliveryChargeMinor,
          discountMinor: u.discountMinor,
          fulfillment: u.fulfillment,
          paymentMethod: u.paymentMethod,
          dineInTable: u.dineInTable,
          notes: u.notes,
          address: u.address,
          lineCount: parsed.lines.length,
        }),
      });

      return u;
    });

    return {
      ok: true,
      id: updated.id,
      orderRef: updated.orderRef,
      totalMinor: updated.totalMinor,
      deliveryChargeMinor: updated.deliveryChargeMinor,
      discountMinor: updated.discountMinor,
    };
  } catch (err) {
    if (err instanceof InventoryInsufficientError) {
      return {
        ok: false,
        error: "Not enough ingredient stock for the edited items.",
        status: 409,
        shortages: err.shortages,
      };
    }
    throw err;
  }
}
