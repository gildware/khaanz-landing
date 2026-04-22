import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";

import { getDefaultMenuPayload } from "../src/data/menu";
import { getPrisma } from "../src/lib/prisma";
import { writeMenuPayload } from "../src/lib/menu-repository";
import { recordOpeningStock } from "../src/lib/inventory/stock-ops";
import { createPurchaseInTransaction } from "../src/lib/inventory/purchase-flow";
import { d } from "../src/lib/inventory/decimal-utils";

async function main() {
  const prisma = getPrisma();

  const email = process.env.SEED_SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_SUPER_ADMIN_PASSWORD;

  if (!email || !password) {
    console.warn(
      "Skip super admin: set SEED_SUPER_ADMIN_EMAIL and SEED_SUPER_ADMIN_PASSWORD to create/update the super admin user.",
    );
  } else {
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.upsert({
      where: { email },
      create: {
        email,
        passwordHash,
        displayName: "Super Admin",
        role: "SUPER_ADMIN",
        active: true,
      },
      update: {
        passwordHash,
        role: "SUPER_ADMIN",
        active: true,
      },
    });
    console.log(`Super admin ready: ${email}`);
  }

  if (!(await prisma.restaurantSettings.findUnique({ where: { id: "default" } }))) {
    await prisma.restaurantSettings.create({
      data: {
        id: "default",
        whatsappPhoneE164: "919876543210",
        pickupStart: "11:00",
        pickupEnd: "23:00",
        deliveryStart: "11:00",
        deliveryEnd: "23:00",
        billHeader: "",
        billFooter: "",
        paymentMethodsJson: [
          { id: "cash", name: "Cash" },
          { id: "upi", name: "UPI" },
          { id: "mpay", name: "Mpay" },
        ],
      },
    });
    console.log("Restaurant settings row created (default).");
  }

  const hasMenu =
    (await prisma.category.count()) > 0 ||
    (await prisma.menuItem.count()) > 0;

  if (!hasMenu) {
    await writeMenuPayload(getDefaultMenuPayload());
    console.log("Menu seeded from bundled defaults (src/data/menu.ts).");
  } else {
    console.log("Menu already present — skipping menu seed.");
  }

  // -----------------------------------------------------------------------
  // Inventory dummy data (items, suppliers, opening stock, purchases, recipes)
  // -----------------------------------------------------------------------
  const hasInventory =
    (await prisma.inventoryItem.count()) > 0 || (await prisma.supplier.count()) > 0;

  if (!hasInventory) {
    await prisma.$transaction(async (tx) => {
      // Suppliers
      const s1 = await tx.supplier.create({
        data: {
          name: "Fresh Farm Supplies",
          phone: "9999900001",
          email: "freshfarm@example.com",
          address: "Local Market Road",
          defaultCreditDays: 15,
          active: true,
        },
      });
      const s2 = await tx.supplier.create({
        data: {
          name: "Spice Traders Co.",
          phone: "9999900002",
          email: "spice@example.com",
          address: "Wholesale Street",
          defaultCreditDays: 10,
          active: true,
        },
      });

      // Items (base-unit only; purchase unit with conversion)
      const items = await Promise.all([
        tx.inventoryItem.create({
          data: {
            name: "Chicken (raw)",
            category: "Meat",
            baseUnit: "g",
            purchaseUnit: "kg",
            baseUnitsPerPurchaseUnit: new Prisma.Decimal("1000"),
            minStockBase: new Prisma.Decimal("5000"),
          },
        }),
        tx.inventoryItem.create({
          data: {
            name: "Rice",
            category: "Dry",
            baseUnit: "g",
            purchaseUnit: "kg",
            baseUnitsPerPurchaseUnit: new Prisma.Decimal("1000"),
            minStockBase: new Prisma.Decimal("3000"),
          },
        }),
        tx.inventoryItem.create({
          data: {
            name: "Onion",
            category: "Veg",
            baseUnit: "g",
            purchaseUnit: "kg",
            baseUnitsPerPurchaseUnit: new Prisma.Decimal("1000"),
            minStockBase: new Prisma.Decimal("2000"),
          },
        }),
        tx.inventoryItem.create({
          data: {
            name: "Cooking Oil",
            category: "Oil",
            baseUnit: "ml",
            purchaseUnit: "l",
            baseUnitsPerPurchaseUnit: new Prisma.Decimal("1000"),
            minStockBase: new Prisma.Decimal("2000"),
          },
        }),
        tx.inventoryItem.create({
          data: {
            name: "Garam Masala",
            category: "Spices",
            baseUnit: "g",
            purchaseUnit: "kg",
            baseUnitsPerPurchaseUnit: new Prisma.Decimal("1000"),
            minStockBase: new Prisma.Decimal("300"),
          },
        }),
      ]);

      const now = new Date();

      // Opening stock for each item (creates movement + batch)
      for (const it of items) {
        await recordOpeningStock(tx, {
          inventoryItemId: it.id,
          qtyBase: new Prisma.Decimal("10000"),
          occurredAt: now,
          note: "Seed opening stock",
          createdByUserId: null,
        });
      }

      // Purchases (creates stock + movement + batches + supplier ledger)
      await createPurchaseInTransaction(tx, {
        supplierId: s1.id,
        purchasedAt: now,
        paymentType: "CREDIT",
        creditDays: 15,
        notes: "Seed purchase",
        createdByUserId: null,
        lines: [
          {
            inventoryItemId: items[0]!.id,
            qtyPurchase: d("5"),
            ratePaisePerPurchaseUnit: 22000,
            expiryDate: null,
            lotCode: "FF-CHKN-01",
          },
          {
            inventoryItemId: items[2]!.id,
            qtyPurchase: d("10"),
            ratePaisePerPurchaseUnit: 3000,
            expiryDate: null,
            lotCode: "FF-ONION-01",
          },
        ],
      });

      await createPurchaseInTransaction(tx, {
        supplierId: s2.id,
        purchasedAt: now,
        paymentType: "CASH",
        creditDays: null,
        notes: "Seed spice purchase",
        createdByUserId: null,
        lines: [
          {
            inventoryItemId: items[4]!.id,
            qtyPurchase: d("1"),
            ratePaisePerPurchaseUnit: 180000,
            expiryDate: new Date(now.getTime() + 120 * 24 * 60 * 60 * 1000),
            lotCode: "ST-GM-01",
          },
        ],
      });
    });

    // Seed a couple of recipes for existing menu items (if present).
    await prisma.$transaction(async (tx) => {
      const menuItems = await tx.menuItem.findMany({
        take: 2,
        orderBy: { sortOrder: "asc" },
        include: { variations: { orderBy: { sortOrder: "asc" } } },
      });
      const inv = await tx.inventoryItem.findMany({ where: { active: true } });
      if (menuItems.length === 0 || inv.length < 3) return;

      const at = new Date();
      for (const mi of menuItems) {
        const v = mi.variations[0];
        if (!v) continue;
        await tx.recipeVersion.create({
          data: {
            menuItemId: mi.id,
            variationId: v.id,
            effectiveFrom: at,
            label: "Seed v1",
            ingredients: {
              create: [
                { inventoryItemId: inv[0]!.id, qtyBase: new Prisma.Decimal("150") },
                { inventoryItemId: inv[2]!.id, qtyBase: new Prisma.Decimal("80") },
                { inventoryItemId: inv[4]!.id, qtyBase: new Prisma.Decimal("5") },
              ],
            },
          },
        });
      }
    });

    console.log("Inventory seeded (items, suppliers, opening stock, purchases, recipes).");
  } else {
    console.log("Inventory already present — skipping inventory seed.");
  }
}

main()
  .then(async () => {
    await getPrisma().$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    try {
      await getPrisma().$disconnect();
    } catch {
      /* ignore */
    }
    process.exit(1);
  });
