import { after } from "next/server";
import type { OrderStatus } from "@prisma/client";

import { migrateCartLine } from "@/lib/cart-line";
import { notifyCustomerOrderStatusChange } from "@/lib/customer-notify";
import { applyOrderInventoryRestore } from "@/lib/inventory/apply-order-inventory";
import { ensureInventorySettings } from "@/lib/inventory/inventory-settings";
import {
  canAdminSetOrderStatus,
  ORDER_STATUS_LABEL,
  restaurantOrderStatusLabel,
} from "@/lib/order-status-workflow";
import { recordOrderEvent } from "@/lib/order-events";
import { getPrisma } from "@/lib/prisma";
import type { CartLine } from "@/types/menu";

const ALL_STATUSES: OrderStatus[] = [
  "PENDING",
  "ACCEPTED",
  "PREPARING",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "TABLE_CLEARED",
  "CANCELLED",
];

export function isOrderStatus(x: unknown): x is OrderStatus {
  return typeof x === "string" && ALL_STATUSES.includes(x as OrderStatus);
}

export type UpdateOrderStatusResult =
  | {
      ok: true;
      id: string;
      status: OrderStatus;
      statusLabel: string;
    }
  | { ok: false; error: string; status: number };

export async function updateOrderStatus(
  orderId: string,
  nextStatus: OrderStatus,
  options?: { adminUserId?: string | null },
): Promise<UpdateOrderStatusResult> {
  const prisma = getPrisma();
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      customer: true,
      lines: { orderBy: { sortIndex: "asc" } },
    },
  });

  if (!order) {
    return { ok: false, error: "Order not found", status: 404 };
  }

  if (order.status === nextStatus) {
    return {
      ok: true,
      id: order.id,
      status: order.status,
      statusLabel: restaurantOrderStatusLabel(order.status, order.fulfillment),
    };
  }

  if (!canAdminSetOrderStatus(order.status, nextStatus, order.fulfillment)) {
    return {
      ok: false,
      error: `Cannot change status from ${restaurantOrderStatusLabel(order.status, order.fulfillment)} to ${restaurantOrderStatusLabel(nextStatus, order.fulfillment)}.`,
      status: 400,
    };
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.order.update({
      where: { id: orderId },
      data: { status: nextStatus },
    });

    if (
      nextStatus === "CANCELLED" &&
      order.inventoryDeductedAt &&
      !order.inventoryRestoredAt
    ) {
      const inv = await ensureInventorySettings(tx);
      if (inv.restoreStockOnCancel) {
        const lines = order.lines.map((l) =>
          migrateCartLine(l.payload as unknown as CartLine),
        );
        await applyOrderInventoryRestore(
          tx,
          orderId,
          { lines },
          options?.adminUserId ?? null,
          new Date(),
        );
      }
    }

    await recordOrderEvent(tx, {
      orderId,
      action: "STATUS_CHANGED",
      actorType: options?.adminUserId
        ? "USER"
        : options && options.adminUserId === null
          ? "POS_SYNC"
          : "SYSTEM",
      actorUserId: options?.adminUserId ?? null,
      summary: `Status: ${ORDER_STATUS_LABEL[order.status]} → ${ORDER_STATUS_LABEL[nextStatus]}`,
      before: { status: order.status },
      after: { status: nextStatus },
    });

    return u;
  });

  if (order.status !== nextStatus) {
    try {
      after(async () => {
        try {
          await notifyCustomerOrderStatusChange({
            orderRef: updated.orderRef,
            orderId: updated.id,
            phoneDigits10: order.customer.phoneDigits,
            status: nextStatus,
          });
        } catch (e) {
          console.error("Customer status notify failed:", e);
        }
      });
    } catch (e) {
      // `after` only works inside a Next.js request; never fail the status write.
      console.error("Deferred customer status notify skipped:", e);
    }
  }

  return {
    ok: true,
    id: updated.id,
    status: updated.status,
    statusLabel: restaurantOrderStatusLabel(updated.status, order.fulfillment),
  };
}
