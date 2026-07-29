import type { Prisma } from "@prisma/client";

import { migrateCartLine } from "@/lib/cart-line";
import { createMenuConsumptionCache } from "@/lib/inventory/consumption-cache";
import { D0, d } from "@/lib/inventory/decimal-utils";
import { planOrderConsumption } from "@/lib/inventory/plan-order-consumption";
import { recordOpeningOrAdjustment } from "@/lib/inventory/stock-ops";
import { formatIstDateInput, istStartOfDay } from "@/lib/ist-dates";
import type { CartLine } from "@/types/menu";

export const RECIPE_RECONCILE_REF_TYPE = "recipe_reconcile";

const QTY_EPS = d("0.000001");
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type RecipeReconcileScope = {
  /** Inclusive lower bound on order.createdAt. */
  from?: Date | null;
  /** Exclusive upper bound on order.createdAt. */
  toExclusive?: Date | null;
};

/**
 * `current` treats today's recipes as if they had always applied — use when the
 * old recipes were simply wrong.
 * `at_sale` resolves each order against the recipe effective on its own date, so
 * legitimate mid-period recipe changes are not flagged; only genuine drift is.
 */
export type RecipeReconcileMode = "current" | "at_sale";

export type RecipeReconcileLine = {
  inventoryItemId: string;
  name: string;
  baseUnit: string;
  /** Sum of FIFO sale consumptions recorded for the scoped orders. */
  deductedBase: string;
  /** Recomputed with current recipes (as-of now). */
  shouldBase: string;
  /** Net stock already added/removed by prior recipe_reconcile runs for this scope. */
  priorCorrectionBase: string;
  /** deductedBase − priorCorrectionBase (stock impact still “owed” by sales). */
  effectiveDeductedBase: string;
  /** effectiveDeducted − should; positive → add stock, negative → remove. */
  deltaBase: string;
  direction: "up" | "down" | "none";
  /** Absolute qty to adjust (0 when none). */
  qtyBase: string;
};

export type RecipeReconcilePreview = {
  scopeKey: string;
  mode: RecipeReconcileMode;
  recipeAsOf: string;
  /** Inclusive IST day YYYY-MM-DD actually used after defaults. */
  fromDate: string | null;
  /** Inclusive IST day YYYY-MM-DD actually used after defaults. */
  toDate: string | null;
  orderCount: number;
  lines: RecipeReconcileLine[];
  changeCount: number;
};

/**
 * Identifies which orders a correction covered. Deliberately excludes the mode:
 * both modes target the same orders, so a mode switch after Apply must net out
 * the corrections already posted instead of stacking on top of them.
 */
export function recipeReconcileScopeKey(scope: RecipeReconcileScope): string {
  const fromMs = scope.from ? scope.from.getTime() : 0;
  const toMs = scope.toExclusive ? scope.toExclusive.getTime() : 0;
  if (!fromMs && !toMs) return "all";
  return `from:${fromMs}:to:${toMs || "open"}`;
}

function createdAtWhere(
  scope: RecipeReconcileScope,
): Prisma.DateTimeFilter | undefined {
  if (!scope.from && !scope.toExclusive) return undefined;
  return {
    ...(scope.from ? { gte: scope.from } : {}),
    ...(scope.toExclusive ? { lt: scope.toExclusive } : {}),
  };
}

const deductedOrderWhere = {
  inventoryDeductedAt: { not: null },
  inventoryRestoredAt: null,
  status: { not: "CANCELLED" as const },
};

/**
 * Fill missing bounds:
 * - only To → From = IST day of the earliest deducted sale
 * - only From → To = today IST (exclusive = tomorrow)
 * - neither → all sales (no bounds)
 */
export async function resolveRecipeReconcileScope(
  tx: Prisma.TransactionClient,
  input: RecipeReconcileScope,
): Promise<RecipeReconcileScope & { fromDate: string | null; toDate: string | null }> {
  let from = input.from ?? null;
  let toExclusive = input.toExclusive ?? null;

  if (!from && toExclusive) {
    const first = await tx.order.findFirst({
      where: {
        ...deductedOrderWhere,
        createdAt: { lt: toExclusive },
      },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    });
    if (!first) {
      // No orders in range — keep an empty window so preview returns 0.
      from = toExclusive;
    } else {
      from = istStartOfDay(first.createdAt);
    }
  }

  if (from && !toExclusive) {
    const todayStart = istStartOfDay(new Date());
    toExclusive = new Date(todayStart.getTime() + MS_PER_DAY);
  }

  if (from && toExclusive && !(from < toExclusive)) {
    throw new Error("from must be on or before to");
  }

  return {
    from,
    toExclusive,
    fromDate: from ? formatIstDateInput(from) : null,
    toDate: toExclusive
      ? formatIstDateInput(new Date(toExclusive.getTime() - MS_PER_DAY))
      : null,
  };
}

/**
 * Compare recorded POS/web sale deductions vs what current recipes would
 * consume for the same orders (recipe lookup forced to `recipeAsOf`, typically now).
 * Prior `recipe_reconcile` adjustments for the same scope are netted out so
 * Apply is idempotent.
 *
 * Read-only, and replaying a long period runs far past the interactive
 * transaction limit — call it with the plain client, not inside `$transaction`.
 */
export async function previewRecipeSalesReconcile(
  tx: Prisma.TransactionClient,
  input: RecipeReconcileScope & {
    recipeAsOf?: Date;
    mode?: RecipeReconcileMode;
  },
): Promise<RecipeReconcilePreview> {
  const recipeAsOf = input.recipeAsOf ?? new Date();
  const mode = input.mode ?? "current";
  const resolved = await resolveRecipeReconcileScope(tx, input);
  const scopeKey = recipeReconcileScopeKey(resolved);
  const createdAt = createdAtWhere(resolved);

  const orders = await tx.order.findMany({
    where: {
      ...deductedOrderWhere,
      ...(createdAt ? { createdAt } : {}),
    },
    select: {
      id: true,
      createdAt: true,
      lines: {
        orderBy: { sortIndex: "asc" },
        select: { payload: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const orderIds = orders.map((o) => o.id);
  const deducted = new Map<string, Prisma.Decimal>();
  if (orderIds.length > 0) {
    const rows = await tx.inventoryBatchConsumption.groupBy({
      by: ["inventoryItemId"],
      where: {
        orderId: { in: orderIds },
        referenceType: "order",
      },
      _sum: { qtyBase: true },
    });
    for (const row of rows) {
      deducted.set(row.inventoryItemId, row._sum.qtyBase ?? D0);
    }
  }

  const should = new Map<string, Prisma.Decimal>();
  const cache = createMenuConsumptionCache();
  for (const o of orders) {
    const lines = o.lines.map((l) =>
      migrateCartLine(l.payload as unknown as CartLine),
    );
    const consumption = await planOrderConsumption(
      tx,
      { lines },
      mode === "current" ? recipeAsOf : o.createdAt,
      cache,
    );
    for (const [id, qty] of consumption) {
      should.set(id, (should.get(id) ?? D0).add(qty));
    }
  }

  const prior = new Map<string, Prisma.Decimal>();
  const priorRows = await tx.inventoryMovement.findMany({
    where: {
      referenceType: RECIPE_RECONCILE_REF_TYPE,
      referenceId: scopeKey,
    },
    select: { inventoryItemId: true, qtyDeltaBase: true },
  });
  for (const row of priorRows) {
    prior.set(
      row.inventoryItemId,
      (prior.get(row.inventoryItemId) ?? D0).add(row.qtyDeltaBase),
    );
  }

  const itemIds = new Set<string>([
    ...deducted.keys(),
    ...should.keys(),
    ...prior.keys(),
  ]);
  const items =
    itemIds.size === 0
      ? []
      : await tx.inventoryItem.findMany({
          where: { id: { in: [...itemIds] } },
          select: {
            id: true,
            name: true,
            baseUnit: true,
            yieldSourceItemId: true,
          },
        });
  const meta = new Map(items.map((i) => [i.id, i]));

  const lines: RecipeReconcileLine[] = [];
  for (const id of itemIds) {
    // Cook items with a yield link never hold stock — sales deduct the source.
    // Skip them so reconcile cannot put leftover qty back onto the cook item.
    if (meta.get(id)?.yieldSourceItemId) continue;

    const deductedBase = deducted.get(id) ?? D0;
    const shouldBase = should.get(id) ?? D0;
    const priorCorrectionBase = prior.get(id) ?? D0;
    // Stock was increased by priorCorrection when we undid over-deduction.
    const effectiveDeducted = deductedBase.sub(priorCorrectionBase);
    const delta = effectiveDeducted.sub(shouldBase);
    let direction: "up" | "down" | "none" = "none";
    let qty = D0;
    if (delta.greaterThan(QTY_EPS)) {
      direction = "up";
      qty = delta;
    } else if (delta.lessThan(d(0).sub(QTY_EPS))) {
      direction = "down";
      qty = delta.abs();
    }

    const m = meta.get(id);
    lines.push({
      inventoryItemId: id,
      name: m?.name ?? id,
      baseUnit: m?.baseUnit ?? "",
      deductedBase: deductedBase.toString(),
      shouldBase: shouldBase.toString(),
      priorCorrectionBase: priorCorrectionBase.toString(),
      effectiveDeductedBase: effectiveDeducted.toString(),
      deltaBase: delta.toString(),
      direction,
      qtyBase: qty.toString(),
    });
  }

  lines.sort((a, b) => a.name.localeCompare(b.name));
  const changeCount = lines.filter((l) => l.direction !== "none").length;

  return {
    scopeKey,
    mode,
    recipeAsOf: recipeAsOf.toISOString(),
    fromDate: resolved.fromDate,
    toDate: resolved.toDate,
    orderCount: orders.length,
    lines,
    changeCount,
  };
}

/**
 * Posts the corrections from an already-computed preview. Kept separate from
 * the preview so the slow order replay stays outside the write transaction.
 */
export async function applyRecipeReconcileAdjustments(
  tx: Prisma.TransactionClient,
  input: {
    preview: RecipeReconcilePreview;
    createdByUserId: string | null;
    allowNegativeStock: boolean;
    occurredAt?: Date;
  },
): Promise<number> {
  const { preview } = input;
  const occurredAt = input.occurredAt ?? new Date();
  let appliedCount = 0;

  for (const line of preview.lines) {
    if (line.direction === "none") continue;
    const qty = d(line.qtyBase);
    if (!qty.greaterThan(QTY_EPS)) continue;

    await recordOpeningOrAdjustment(tx, {
      inventoryItemId: line.inventoryItemId,
      qtyDeltaBase: qty,
      direction: line.direction,
      reason: "CORRECTION",
      note: `Recipe reconcile (${preview.mode}, ${preview.scopeKey}): deducted ${line.deductedBase}, should ${line.shouldBase}`,
      occurredAt,
      createdByUserId: input.createdByUserId,
      allowNegativeStock: input.allowNegativeStock,
      referenceType: RECIPE_RECONCILE_REF_TYPE,
      referenceId: preview.scopeKey,
    });
    appliedCount += 1;
  }

  return appliedCount;
}
