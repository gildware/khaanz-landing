import type { Prisma } from "@prisma/client";

import type {
  MenuComboWithComponents,
  MenuConsumptionCache,
} from "@/lib/inventory/consumption-cache";
import { d } from "@/lib/inventory/decimal-utils";
import {
  expandMenuItemConsumption,
  mergeConsumption,
} from "@/lib/inventory/recipe-resolve";
import type { OrderCreateParsed } from "@/lib/parse-order-create-body";
import { isCartComboLine, isCartItemLine, isCartOpenLine } from "@/types/menu";

export async function planOrderConsumption(
  tx: Prisma.TransactionClient,
  parsed: Pick<OrderCreateParsed, "lines">,
  at: Date,
  cache?: MenuConsumptionCache,
): Promise<Map<string, Prisma.Decimal>> {
  const totals = new Map<string, Prisma.Decimal>();
  const lines = parsed.lines;

  const comboIds = lines
    .filter(isCartComboLine)
    .map((l) => l.comboId)
    .filter((id, i, a) => a.indexOf(id) === i);

  const comboById = new Map<string, MenuComboWithComponents>();
  if (comboIds.length > 0) {
    const combos: (MenuComboWithComponents | null)[] = [];
    if (cache) {
      for (const id of comboIds) combos.push(await cache.comboFor(tx, id));
    } else {
      combos.push(
        ...(await tx.menuCombo.findMany({
          where: { id: { in: comboIds } },
          include: { components: true },
        })),
      );
    }
    for (const combo of combos) {
      if (combo) comboById.set(combo.id, combo);
    }
  }

  for (const line of lines) {
    if (isCartOpenLine(line)) continue;

    if (isCartItemLine(line)) {
      const portion = d(line.quantity);
      const consumption = await expandMenuItemConsumption(
        tx,
        line.itemId,
        line.variation.id,
        at,
        portion,
        [],
        cache,
      );
      mergeConsumption(totals, consumption);
      continue;
    }

    if (isCartComboLine(line)) {
      const combo = comboById.get(line.comboId);
      if (!combo) continue;
      const comboPortions = d(line.quantity);
      for (const comp of combo.components) {
        const portions = comboPortions.mul(d(comp.quantity));
        const consumption = await expandMenuItemConsumption(
          tx,
          comp.itemId,
          comp.variationId,
          at,
          portions,
          [],
          cache,
        );
        mergeConsumption(totals, consumption);
      }
    }
  }

  return totals;
}
