import test from "node:test";
import assert from "node:assert/strict";

import { getPrisma } from "@/lib/prisma";
import { d } from "@/lib/inventory/decimal-utils";
import { expandMenuItemConsumption } from "@/lib/inventory/recipe-resolve";
import { computeDishCostBreakdown } from "@/lib/inventory/dish-cost";

function rand(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

test("nested recipe: chowmein uses 50g of fried chicken yield 200g", async () => {
  const prisma = getPrisma();
  const now = new Date();
  const categoryId = rand("cat");
  const friedChickenId = rand("fc");
  const chowmeinId = rand("cm");
  const fcVarId = rand("fcv");
  const cmVarId = rand("cmv");
  const chickenInvId = rand("inv-chicken");
  const oilInvId = rand("inv-oil");
  const noodleInvId = rand("inv-noodle");

  await prisma.$transaction(async (tx) => {
    await tx.inventorySettings.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        costingMethod: "WEIGHTED_AVERAGE",
        restoreStockOnCancel: true,
        allowNegativeStock: true,
      },
      update: { costingMethod: "WEIGHTED_AVERAGE" },
    });

    await tx.category.create({
      data: {
        id: categoryId,
        name: rand("NestCat"),
        sortOrder: 0,
      },
    });

    await tx.inventoryItem.createMany({
      data: [
        {
          id: chickenInvId,
          name: rand("Chicken"),
          category: "Meat",
          baseUnit: "g",
          purchaseUnit: "kg",
          baseUnitsPerPurchaseUnit: d("1000"),
          avgCostPaisePerBase: d("2"),
          active: true,
        },
        {
          id: oilInvId,
          name: rand("Oil"),
          category: "Oil",
          baseUnit: "ml",
          purchaseUnit: "L",
          baseUnitsPerPurchaseUnit: d("1000"),
          avgCostPaisePerBase: d("1"),
          active: true,
        },
        {
          id: noodleInvId,
          name: rand("Noodles"),
          category: "Dry",
          baseUnit: "g",
          purchaseUnit: "kg",
          baseUnitsPerPurchaseUnit: d("1000"),
          avgCostPaisePerBase: d("1"),
          active: true,
        },
      ],
    });

    await tx.menuItem.create({
      data: {
        id: friedChickenId,
        categoryId,
        name: rand("Fried Chicken"),
        sortOrder: 0,
        variations: {
          create: {
            id: fcVarId,
            name: "Regular",
            price: 120,
            sortOrder: 0,
          },
        },
      },
    });
    await tx.menuItem.create({
      data: {
        id: chowmeinId,
        categoryId,
        name: rand("Chicken Chowmein"),
        sortOrder: 1,
        variations: {
          create: {
            id: cmVarId,
            name: "Regular",
            price: 150,
            sortOrder: 0,
          },
        },
      },
    });

    // Fried chicken: 400g chicken + 20ml oil → yield 200g finished
    await tx.recipeVersion.create({
      data: {
        menuItemId: friedChickenId,
        variationId: null,
        effectiveFrom: now,
        yieldQty: d("200"),
        yieldUnit: "g",
        ingredients: {
          create: [
            { inventoryItemId: chickenInvId, qtyBase: d("400") },
            { inventoryItemId: oilInvId, qtyBase: d("20") },
          ],
        },
      },
    });

    // Chowmein: 50g fried chicken + 100g noodles
    await tx.recipeVersion.create({
      data: {
        menuItemId: chowmeinId,
        variationId: null,
        effectiveFrom: now,
        yieldQty: d("1"),
        yieldUnit: "portion",
        ingredients: {
          create: [
            {
              componentMenuItemId: friedChickenId,
              componentVariationId: null,
              qtyBase: d("50"),
            },
            { inventoryItemId: noodleInvId, qtyBase: d("100") },
          ],
        },
      },
    });

    const consumption = await expandMenuItemConsumption(
      tx,
      chowmeinId,
      cmVarId,
      new Date(now.getTime() + 1000),
      d("1"),
    );

    // 50/200 of fried chicken → 100g chicken, 5ml oil, plus 100g noodles
    assert.equal(consumption.get(chickenInvId)?.toString(), "100");
    assert.equal(consumption.get(oilInvId)?.toString(), "5");
    assert.equal(consumption.get(noodleInvId)?.toString(), "100");

    const cost = await computeDishCostBreakdown(
      tx,
      chowmeinId,
      cmVarId,
      new Date(now.getTime() + 1000),
    );
    assert.ok(cost);
    // 100*2 + 5*1 + 100*1 = 305
    assert.equal(Number(cost!.costPaise.toString()), 305);
  });
});

test("nested recipe: rejects self-reference via cycle check helper path", async () => {
  const prisma = getPrisma();
  const now = new Date();
  const categoryId = rand("cat2");
  const itemA = rand("a");
  const varA = rand("va");
  const invId = rand("inv");

  await prisma.$transaction(async (tx) => {
    await tx.category.create({
      data: { id: categoryId, name: rand("Cat2"), sortOrder: 0 },
    });
    await tx.inventoryItem.create({
      data: {
        id: invId,
        name: rand("Salt"),
        category: "Spice",
        baseUnit: "g",
        purchaseUnit: "kg",
        baseUnitsPerPurchaseUnit: d("1000"),
        active: true,
      },
    });
    await tx.menuItem.create({
      data: {
        id: itemA,
        categoryId,
        name: rand("Self Dish"),
        sortOrder: 0,
        variations: {
          create: { id: varA, name: "R", price: 10, sortOrder: 0 },
        },
      },
    });
    await tx.recipeVersion.create({
      data: {
        menuItemId: itemA,
        effectiveFrom: now,
        ingredients: {
          create: [{ inventoryItemId: invId, qtyBase: d("1") }],
        },
      },
    });

    // Expansion with a self-component should not infinite-loop (stack guard)
    await tx.recipeIngredient.create({
      data: {
        recipeVersionId: (
          await tx.recipeVersion.findFirstOrThrow({
            where: { menuItemId: itemA },
          })
        ).id,
        componentMenuItemId: itemA,
        qtyBase: d("1"),
      },
    });

    const consumption = await expandMenuItemConsumption(
      tx,
      itemA,
      varA,
      new Date(now.getTime() + 1000),
      d("1"),
    );
    assert.equal(consumption.get(invId)?.toString(), "1");
  });
});
