import type { Prisma } from "@prisma/client";

import { d } from "@/lib/inventory/decimal-utils";
import {
  mergeConsumption,
  resolveRecipeVersion,
  scaleRecipe,
} from "@/lib/inventory/recipe-resolve";
import type { OrderCreateParsed } from "@/lib/parse-order-create-body";
import { isCartComboLine, isCartItemLine, isCartOpenLine } from "@/types/menu";

export async function planOrderConsumption(
  tx: Prisma.TransactionClient,
  parsed: Pick<OrderCreateParsed, "lines">,
  at: Date,
): Promise<Map<string, Prisma.Decimal>> {
  const totals = new Map<string, Prisma.Decimal>();
  const lines = parsed.lines;

  const comboIds = lines
    .filter(isCartComboLine)
    .map((l) => l.comboId)
    .filter((id, i, a) => a.indexOf(id) === i);

  const combos =
    comboIds.length > 0
      ? await tx.menuCombo.findMany({
          where: { id: { in: comboIds } },
          include: { components: true },
        })
      : [];
  const comboById = new Map(combos.map((c) => [c.id, c]));

  for (const line of lines) {
    if (isCartOpenLine(line)) continue;

    if (isCartItemLine(line)) {
      const recipe = await resolveRecipeVersion(
        tx,
        line.itemId,
        line.variation.id,
        at,
      );
      if (!recipe) continue;
      const portion = d(line.quantity);
      mergeConsumption(totals, scaleRecipe(recipe, portion));
      continue;
    }

    if (isCartComboLine(line)) {
      const combo = comboById.get(line.comboId);
      if (!combo) continue;
      const comboPortions = d(line.quantity);
      for (const comp of combo.components) {
        const recipe = await resolveRecipeVersion(
          tx,
          comp.itemId,
          comp.variationId,
          at,
        );
        if (!recipe) continue;
        const portions = comboPortions.mul(d(comp.quantity));
        mergeConsumption(totals, scaleRecipe(recipe, portions));
      }
    }
  }

  return totals;
}
