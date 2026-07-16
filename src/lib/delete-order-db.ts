import { migrateCartLine } from "@/lib/cart-line";
import { applyOrderInventoryRestore } from "@/lib/inventory/apply-order-inventory";
import { getPrisma } from "@/lib/prisma";
import type { CartLine } from "@/types/menu";

export type DeleteOrderResult =
  | { ok: true; id: string; orderRef: string | null }
  | { ok: false; error: string; status: number };

/**
 * Permanently remove an order. Restores inventory when stock was deducted and
 * not yet restored (hard delete should not leave stock missing).
 */
export async function deleteOrder(
  orderId: string,
  options?: { adminUserId?: string | null },
): Promise<DeleteOrderResult> {
  const prisma = getPrisma();
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      lines: { orderBy: { sortIndex: "asc" } },
    },
  });

  if (!order) {
    return { ok: false, error: "Order not found", status: 404 };
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (order.inventoryDeductedAt && !order.inventoryRestoredAt) {
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

      await tx.order.delete({ where: { id: orderId } });
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("deleteOrder failed:", message);
    return {
      ok: false,
      error: "Could not delete order.",
      status: 500,
    };
  }

  return {
    ok: true,
    id: order.id,
    orderRef: order.orderRef,
  };
}
