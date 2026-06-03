import type { Prisma } from "@prisma/client";

import {
  InventoryInsufficientError,
  reapplyOrderInventoryForEdit,
} from "@/lib/inventory/apply-order-inventory";
import { computeOrderTotalMinor } from "@/lib/order-total";
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
    select: { id: true, status: true, source: true },
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

      return u;
    });

    return {
      ok: true,
      id: updated.id,
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
