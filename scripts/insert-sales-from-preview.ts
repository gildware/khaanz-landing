/**
 * Insert one historical POS order for a day, from its preview JSON.
 * The day total always lands on the Excel report total: a shortfall is already
 * a catch-up open line in the preview, an excess becomes an order discount.
 *
 * Run: npx tsx scripts/insert-sales-from-preview.ts --date 2026-07-28 [--dry]
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";

import { persistPosOrderToDatabase } from "../src/lib/persist-order-db";
import { readRestaurantSettings } from "../src/lib/settings-repository";
import { POS_ANONYMOUS_PHONE_DIGITS } from "../src/lib/phone-digits";
import type { CartLine, CartItemLine, CartOpenLine } from "../src/types/menu";
import type { OrderCreateParsed } from "../src/lib/parse-order-create-body";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

type PreviewLine = {
  source: string;
  reportItem: string;
  qty: number;
  unitPrice: number;
  reportTotal: number;
  action: string;
  match: {
    menuItemId: string;
    variationId: string;
  } | null;
};

type PreviewFile = {
  saleDate: string;
  reportGrand: number;
  previewGrand: number;
  discountToMatchExcel?: number;
  lines: PreviewLine[];
};

async function main() {
  const SALE_DATE = arg("--date");
  const dryRun = process.argv.includes("--dry");
  if (!SALE_DATE || !/^\d{4}-\d{2}-\d{2}$/.test(SALE_DATE)) {
    console.error("Usage: --date YYYY-MM-DD [--dry]");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const preview = JSON.parse(
      readFileSync(
        join(process.cwd(), "samples", `sales-preview-${SALE_DATE}.json`),
        "utf8",
      ),
    ) as PreviewFile;

    const start = new Date(`${SALE_DATE}T00:00:00+05:30`);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    const existing = await prisma.order.aggregate({
      where: { createdAt: { gte: start, lt: end } },
      _count: true,
      _sum: { totalMinor: true },
    });
    if (existing._count > 0) {
      throw new Error(
        `Abort: ${existing._count} order(s) already exist for ${SALE_DATE} (₹${(existing._sum.totalMinor ?? 0) / 100}).`,
      );
    }

    const settings = await readRestaurantSettings();
    const paymentMethodKey =
      settings.paymentMethods.find((p) => p.id === "cash")?.id ??
      settings.paymentMethods[0]?.id;
    if (!paymentMethodKey) throw new Error("No payment methods configured.");

    const admin =
      (await prisma.user.findFirst({
        where: { email: "manager@khaanz.in" },
        select: { id: true, email: true },
      })) ??
      (await prisma.user.findFirst({
        orderBy: { createdAt: "asc" },
        select: { id: true, email: true },
      }));

    const menuById = new Map(
      (await prisma.menuItem.findMany({ include: { variations: true } })).map(
        (m) => [m.id, m],
      ),
    );

    const cartLines: CartLine[] = [];
    for (const row of preview.lines) {
      if (row.action === "skip_excel_open_aggregate") continue;

      if (row.action === "menu_item" && row.match) {
        const dish = menuById.get(row.match.menuItemId);
        if (!dish) throw new Error(`Menu item missing: ${row.match.menuItemId}`);
        const variation = dish.variations.find(
          (v) => v.id === row.match!.variationId,
        );
        if (!variation) {
          throw new Error(
            `Variation missing: ${row.match.menuItemId}/${row.match.variationId}`,
          );
        }
        const line: CartItemLine = {
          kind: "item",
          lineId: randomUUID(),
          itemId: dish.id,
          name: dish.name,
          image: dish.image ?? "",
          isVeg: dish.isVeg,
          variation: {
            id: variation.id,
            name: variation.name,
            price: variation.price,
          },
          addons: [],
          quantity: Math.round(row.qty),
          unitPrice: variation.price,
        };
        cartLines.push(line);
        continue;
      }

      if (row.action === "open_item") {
        const line: CartOpenLine = {
          kind: "open",
          lineId: randomUUID(),
          name: row.reportItem.trim() || "Open item",
          quantity: Math.max(1, Math.round(row.qty)),
          unitPrice: row.unitPrice,
        };
        cartLines.push(line);
        continue;
      }

      throw new Error(`Unhandled action: ${row.action} (${row.reportItem})`);
    }

    if (cartLines.length === 0) throw new Error("No lines to insert.");

    const linesMinor = cartLines.reduce(
      (s, l) => s + Math.round(l.unitPrice * 100) * l.quantity,
      0,
    );
    const targetMinor = Math.round(preview.reportGrand * 100);
    const discountMinor = Math.max(0, linesMinor - targetMinor);

    if (linesMinor - discountMinor !== targetMinor) {
      throw new Error(
        `Cannot reach Excel total: lines ₹${linesMinor / 100} − discount ₹${discountMinor / 100} ≠ ₹${preview.reportGrand}`,
      );
    }

    const summary = {
      saleDate: SALE_DATE,
      lineCount: cartLines.length,
      linesRupees: linesMinor / 100,
      discountRupees: discountMinor / 100,
      dayTotalRupees: targetMinor / 100,
      paymentMethod: paymentMethodKey,
    };

    if (dryRun) {
      console.log(JSON.stringify({ dryRun: true, ...summary }, null, 2));
      return;
    }

    const parsed: OrderCreateParsed = {
      customerName: "Guest",
      phone: POS_ANONYMOUS_PHONE_DIGITS,
      fulfillment: "pickup",
      scheduleMode: "asap",
      scheduledAt: null,
      address: "",
      landmark: "",
      notes: `Item-wise sales report ${SALE_DATE} + open-items notebook`,
      lines: cartLines,
      latitude: null,
      longitude: null,
      discountMinor,
    };

    const orderId = randomUUID();
    const out = await persistPosOrderToDatabase(orderId, parsed, {
      paymentMethodKey,
      dineInTable: "",
      adminUserId: admin?.id ?? null,
      createdByLabel: admin?.email ?? "sales-import",
      soldAt: new Date(`${SALE_DATE}T12:00:00+05:30`),
      historical: true,
    });

    const verify = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        orderRef: true,
        totalMinor: true,
        discountMinor: true,
        createdAt: true,
        _count: { select: { lines: true } },
      },
    });

    console.log(
      JSON.stringify(
        {
          ok: true,
          orderRef: out.orderRef,
          ...summary,
          storedTotalRupees: (verify?.totalMinor ?? 0) / 100,
          storedDiscountRupees: (verify?.discountMinor ?? 0) / 100,
          storedLines: verify?._count.lines,
          createdAt: verify?.createdAt,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
